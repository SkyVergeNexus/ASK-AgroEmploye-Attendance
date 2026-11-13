import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Button, Typography, Space, Tag, Statistic, message,
  Table, Empty, Badge, Grid, Avatar, Alert, Modal, Input, Popconfirm,
} from 'antd';
import {
  LoginOutlined, LogoutOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, UserOutlined, ReloadOutlined, DeleteOutlined,
  EnvironmentOutlined, WifiOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../config';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { TextArea } = Input;

const statusColor = {
  present: 'green',
  late: 'gold',
  absent: 'red',
  'half-day': 'blue',
  leave: 'purple',
};

const RECENT_LIMIT = 5;

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeStringToDate(hms) {
  if (!hms) return null;
  const [h, m, s = 0] = String(hms).split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

function formatDuration(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ip || null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [earlyRequests, setEarlyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [now, setNow] = useState(new Date());

  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [geo, setGeo] = useState({
    status: 'idle',
    distance: null,
    coords: null,
    radius: null,
  });

  const [clockInError, setClockInError] = useState(null);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    try {
      const [t, h, s, er] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/my'),
        api.get('/settings'),
        api.get('/attendance/early-leave/my'),
      ]);
      setToday(t.data);
      setHistory(h.data);
      setSettings(s.data);
      setEarlyRequests(er.data);
      setClockInError(null);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!settings) return;

    const enforced = !!Number(settings.enforce_location);
    if (!enforced) {
      setGeo({ status: 'not-enforced', distance: null, coords: null, radius: null });
      return;
    }
    if (settings.office_lat == null || settings.office_lng == null) {
      setGeo({ status: 'no-office', distance: null, coords: null, radius: null });
      return;
    }
    if (!navigator.geolocation) {
      setGeo({ status: 'unsupported', distance: null, coords: null, radius: null });
      return;
    }

    setGeo((g) => ({ ...g, status: 'checking' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = haversineMeters(
          latitude,
          longitude,
          Number(settings.office_lat),
          Number(settings.office_lng)
        );
        const radius = Number(settings.geofence_radius_m || 200);
        setGeo({
          status: dist <= radius ? 'inside' : 'outside',
          distance: Math.round(dist),
          coords: { lat: latitude, lng: longitude },
          radius,
        });
      },
      () => {
        setGeo({ status: 'denied', distance: null, coords: null, radius: null });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [settings]);

  const todaysRequests = useMemo(() => {
    if (!today) return [];
    const todayStr = localDateString();
    return earlyRequests.filter((r) => {
      const createdDate = String(r.created_at).slice(0, 10);
      return createdDate === todayStr;
    });
  }, [earlyRequests, today]);

  const pendingEarly = todaysRequests.find((r) => r.status === 'pending');
  const approvedEarly = todaysRequests.find((r) => r.status === 'approved');
  const rejectedEarly = todaysRequests.find((r) => r.status === 'rejected');

  const clockIn = async () => {
    setClocking(true);
    setClockInError(null);
    try {
      let coords = geo.coords;
      if (!coords && navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
      }

      const publicIp = await fetchPublicIp();

      await api.post('/attendance/clock-in', {
        ...(coords || {}),
        publicIp,
      });
      message.success('Clocked in!');
      load();
    } catch (e) {
      const data = e.response?.data;
      const msg = data?.message || 'Clock-in failed';
      setClockInError({
        message: msg,
        requiresOfficeWifi: !!data?.requiresOfficeWifi,
        requiresLocation: !!data?.requiresLocation,
        distance: data?.distance,
        radius: data?.radius,
        sawIp: data?.sawIp,
      });
      message.error(msg);
    } finally {
      setClocking(false);
    }
  };

  const clockOut = async () => {
    setClocking(true);
    try {
      await api.post('/attendance/clock-out');
      message.success('Clocked out!');
      load();
    } catch (e) {
      const data = e.response?.data;
      if (data?.requiresApproval) {
        setEarlyModalOpen(true);
        setEarlyReason('');
      } else {
        message.error(data?.message || 'Clock-out failed');
      }
    } finally {
      setClocking(false);
    }
  };

  const submitEarlyRequest = async () => {
    if (!earlyReason.trim()) {
      return message.error('Please provide a reason');
    }
    setSubmittingRequest(true);
    try {
      await api.post('/attendance/early-leave/request', {
        reason: earlyReason.trim(),
      });
      message.success('Request submitted. Waiting for admin approval.');
      setEarlyModalOpen(false);
      setEarlyReason('');
      load();
    } catch (e) {
      message.error(e.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const cancelEarlyRequest = async () => {
    if (!pendingEarly) return;
    setCancelling(true);
    try {
      await api.delete('/attendance/early-leave/' + pendingEarly.id);
      message.success('Request cancelled');
      load();
    } catch (e) {
      message.error(e.response?.data?.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const locationBlocked =
    geo.status === 'outside' ||
    geo.status === 'denied' ||
    geo.status === 'unsupported' ||
    geo.status === 'no-office' ||
    geo.status === 'checking';

  const canClockIn = !today && !locationBlocked;
  const canClockOut = today && !today.clock_out && !pendingEarly;

  const enforceLocation = !!Number(settings?.enforce_location);

  const picUrl = user?.profile_picture
    ? API_ORIGIN + user.profile_picture
    : null;

  const recentHistory = useMemo(() => {
    return [...history]
      .sort((a, b) =>
        String(b.attendance_date).localeCompare(String(a.attendance_date))
      )
      .slice(0, RECENT_LIMIT);
  }, [history]);

  const countdown = useMemo(() => {
    if (!settings) return { text: '—', hint: 'Loading settings…', active: false };

    const workEnd = timeStringToDate(settings.work_end);
    const workStart = timeStringToDate(settings.work_start);
    if (!workEnd || !workStart) {
      return { text: '—', hint: 'No work hours set', active: false };
    }

    if (!today?.clock_in) {
      return { text: '00:00:00', hint: 'Starts when you clock in', active: false };
    }

    if (today.clock_out) {
      return {
        text: '00:00:00',
        hint: today.early_leave_reason ? 'Left early — reason recorded' : 'Day complete',
        active: false,
      };
    }

    if (pendingEarly) {
      return {
        text: '00:00:00',
        hint: 'Early clock-out pending approval',
        active: false,
      };
    }

    const remainingMs = workEnd - now;
    if (remainingMs <= 0) {
      return {
        text: '00:00:00',
        hint: 'Past closing — please clock out',
        active: false,
      };
    }

    return {
      text: formatDuration(remainingMs),
      hint: `Until ${settings.work_end}`,
      active: true,
    };
  }, [settings, today, now, pendingEarly]);

  const columns = [
    {
      title: 'Date',
      dataIndex: 'attendance_date',
      key: 'attendance_date',
      render: (v) => String(v).slice(0, 10),
      sorter: (a, b) =>
        String(a.attendance_date).localeCompare(String(b.attendance_date)),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Clock In',
      dataIndex: 'clock_in',
      key: 'clock_in',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Clock Out',
      dataIndex: 'clock_out',
      key: 'clock_out',
      render: (v, r) => (
        <Space size={4}>
          {v || <Text type="secondary">—</Text>}
          {r.early_leave_reason && (
            <Tag color="orange" style={{ marginLeft: 4 }}>early</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
  ];

  // ── Mobile-friendly history row ──────────────────────────
  const renderMobileRecord = (r) => (
    <div
      key={r.id}
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#ecfdf5', color: '#065f46',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}
          >
            <ClockCircleOutlined />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              {String(r.attendance_date).slice(0, 10)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {r.early_leave_reason ? 'Left early' : 'Full day'}
            </div>
          </div>
        </div>
        <Tag
          color={statusColor[r.status] || 'default'}
          style={{ margin: 0, borderRadius: 10, textTransform: 'capitalize' }}
        >
          {r.status}
        </Tag>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          background: '#f8fafc',
          borderRadius: 8,
          padding: '8px 10px',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            In
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
            {r.clock_in || '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Out
          </div>
          <div
            style={{
              fontSize: 14, fontWeight: 600,
              color: r.clock_out ? '#d97706' : '#94a3b8',
            }}
          >
            {r.clock_out || '—'}
          </div>
        </div>
      </div>

      {r.early_leave_reason && (
        <div
          style={{
            fontSize: 11, color: '#92400e',
            background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: 8, padding: '6px 8px',
          }}
        >
          <strong>Reason:</strong> {r.early_leave_reason}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      {/* ═══════════════ Greeting header ═══════════════ */}
      {isMobile ? (
        <Card
          style={{
            border: 'none',
            borderRadius: 16,
            marginBottom: 16,
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)',
            boxShadow: '0 10px 24px -10px rgba(6,95,70,0.5)',
          }}
          styles={{ body: { padding: '18px 16px' } }}
        >
          {/* Top row: avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <Avatar
              size={56}
              src={picUrl || undefined}
              icon={!picUrl ? <UserOutlined /> : undefined}
              style={{
                backgroundColor: picUrl ? undefined : 'rgba(255,255,255,0.2)',
                border: '2px solid rgba(255,255,255,0.4)',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                Welcome back
              </div>
              <div
                style={{
                  color: '#fff', fontSize: 18, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                }}
              >
                {user?.name || 'there'}
              </div>
              <div style={{ marginTop: 4 }}>
                {user?.department_name && (
                  <Tag
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      color: '#fff', borderRadius: 10, fontSize: 11, margin: 0,
                    }}
                  >
                    {user.department_name}
                  </Tag>
                )}
              </div>
            </div>
          </div>

          {/* Bottom row: time + countdown in 2 cols */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              background: 'rgba(0,0,0,0.15)',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Now
              </div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2 }}>
                {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 12 }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {countdown.active ? 'Time left' : 'Countdown'}
              </div>
              <div
                style={{
                  fontSize: 20, fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  color: countdown.active ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                  letterSpacing: 1, lineHeight: 1.2,
                }}
              >
                {countdown.text}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 }}>
                {countdown.hint}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="borderless" className="shadow-sm mb-6">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={14}>
              <Space size={16} align="center" wrap>
                <Avatar
                  size={64}
                  src={picUrl || undefined}
                  icon={!picUrl ? <UserOutlined /> : undefined}
                  style={{ backgroundColor: picUrl ? undefined : '#065f46' }}
                />
                <div>
                  <Title level={3} style={{ margin: 0, color: '#065f46' }}>
                    Hi, {user?.name || 'there'}
                  </Title>
                  <Text type="secondary">
                    {user?.department_name || 'ASK Agrobusiness Limited'}
                    {user?.role_name && ` · ${user.role_name}`}
                  </Text>
                </div>
              </Space>
            </Col>
            <Col xs={24} md={10} style={{ textAlign: 'right' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {now.toLocaleDateString(undefined, {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
              <div style={{ fontSize: 26, fontWeight: 600, color: '#065f46' }}>
                {now.toLocaleTimeString()}
              </div>
              <div className="mt-2">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {countdown.active ? 'Time left today' : 'Countdown'}
                </Text>
                <div
                  style={{
                    fontSize: 30, fontWeight: 700, fontFamily: 'monospace',
                    color: countdown.active ? '#d97706' : '#94a3b8',
                    letterSpacing: 1, lineHeight: 1.1,
                  }}
                >
                  {countdown.text}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {countdown.hint}
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* ═══════════════ Today's status (UNTOUCHED) ═══════════════ */}
      <Card
        title={
          <Space>
            <span>Today's Status</span>
            {today && (
              <Tag color={statusColor[today.status] || 'default'}>
                {today.status}
              </Tag>
            )}
          </Space>
        }
        variant="borderless"
        className="shadow-sm mb-6"
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={load}
            loading={loading}
          >
            {!isMobile && 'Refresh'}
          </Button>
        }
      >
        {clockInError && !today && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setClockInError(null)}
            style={{ marginBottom: 12 }}
            title={clockInError.message}
            description={
              clockInError.requiresOfficeWifi ? (
                <>
                  <Text strong>Connect to the office Wi-Fi network</Text> and try again.
                  Only devices on the office network can clock in.
                  {clockInError.sawIp && (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      <Text type="secondary">Your current IP: </Text>
                      <Text code>{clockInError.sawIp}</Text>
                    </div>
                  )}
                </>
              ) : clockInError.requiresLocation ? (
                'Enable location/GPS in your browser settings, then try again.'
              ) : clockInError.distance != null ? (
                `You are ${clockInError.distance}m away. Move within ${clockInError.radius}m of the office.`
              ) : (
                'Try again or contact your administrator.'
              )
            }
          />
        )}

        {!today && enforceLocation && (
          <Alert
            type="info"
            showIcon
            icon={<WifiOutlined />}
            style={{ marginBottom: 12 }}
            title="Two conditions must pass to clock in"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div>
                  <strong>1. Office Wi-Fi</strong> — your device must be on the
                  office network. GPS alone is not enough.
                </div>
                <div>
                  <strong>2. Inside GPS radius</strong>{' '}
                  {geo.status === 'inside' && (
                    <Tag color="green">✓ {geo.distance}m</Tag>
                  )}
                  {geo.status === 'outside' && (
                    <Tag color="orange">✗ {geo.distance}m (max {geo.radius}m)</Tag>
                  )}
                  {geo.status === 'checking' && <Tag>checking…</Tag>}
                  {geo.status === 'denied' && <Tag color="red">GPS denied</Tag>}
                  {geo.status === 'unsupported' && (
                    <Tag color="red">GPS unsupported</Tag>
                  )}
                  {geo.status === 'no-office' && (
                    <Tag color="orange">not configured</Tag>
                  )}
                </div>
              </div>
            }
          />
        )}

        {!today && geo.status === 'checking' && (
          <Alert
            type="info"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Checking your location…"
            description="Verifying you are at the office before enabling clock-in."
          />
        )}
        {!today && geo.status === 'outside' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title={`You are ${geo.distance}m from the office`}
            description={`You must be within ${geo.radius}m to clock in. Move closer to the office.`}
          />
        )}
        {!today && geo.status === 'denied' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Location permission denied"
            description="Enable location access in your browser to clock in."
          />
        )}
        {!today && geo.status === 'unsupported' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Location not supported by this device"
            description="Your browser doesn't support GPS."
          />
        )}
        {!today && geo.status === 'no-office' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Office location not configured"
            description="Ask your administrator to set the office location in Settings."
          />
        )}

        {pendingEarly && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="Early clock-out pending approval"
            description={
              <div>
                <div>
                  You requested to leave at{' '}
                  <Text strong>{pendingEarly.requested_out_time}</Text>. Waiting for
                  admin review.
                </div>
                <Popconfirm
                  title="Cancel this request?"
                  description="The admin will no longer see it in their queue."
                  okText="Yes, cancel"
                  okButtonProps={{ danger: true }}
                  cancelText="Keep it"
                  onConfirm={cancelEarlyRequest}
                >
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={cancelling}
                    style={{ marginTop: 8 }}
                  >
                    Cancel request
                  </Button>
                </Popconfirm>
              </div>
            }
          />
        )}
        {approvedEarly && !today?.clock_out && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            title="Early clock-out approved"
            description="You can now click Clock Out to end your day."
          />
        )}
        {rejectedEarly && !today?.clock_out && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="Early clock-out rejected"
            description={
              rejectedEarly.admin_note
                ? `Admin note: ${rejectedEarly.admin_note}`
                : 'Your request was not approved. Please continue your shift.'
            }
          />
        )}

        {/* ── Stat row — mobile stacked, desktop 3-col (unchanged on desktop) ── */}
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 14px',
                borderLeft: '4px solid #16a34a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LoginOutlined style={{ color: '#16a34a', fontSize: 18 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Clock In
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: today?.clock_in ? '#065f46' : '#94a3b8' }}>
                    {today?.clock_in || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 14px',
                borderLeft: '4px solid #d97706',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LogoutOutlined style={{ color: '#d97706', fontSize: 18 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Clock Out
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: today?.clock_out ? '#065f46' : '#94a3b8' }}>
                    {today?.clock_out || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 14px',
                borderLeft: `4px solid ${
                  today?.status === 'present' ? '#16a34a' :
                  today?.status === 'late' ? '#d97706' :
                  today?.status === 'absent' ? '#dc2626' : '#94a3b8'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {today?.status === 'present' ? (
                  <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 18 }} />
                ) : today?.status === 'late' ? (
                  <ClockCircleOutlined style={{ color: '#d97706', fontSize: 18 }} />
                ) : today?.status === 'absent' ? (
                  <CloseCircleOutlined style={{ color: '#dc2626', fontSize: 18 }} />
                ) : (
                  <ClockCircleOutlined style={{ color: '#94a3b8', fontSize: 18 }} />
                )}
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Status
                  </div>
                  <div
                    style={{
                      fontSize: 16, fontWeight: 700, textTransform: 'capitalize',
                      color:
                        today?.status === 'present' ? '#16a34a' :
                        today?.status === 'late' ? '#d97706' :
                        today?.status === 'absent' ? '#dc2626' : '#64748b',
                    }}
                  >
                    {today?.status || 'Not marked'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Row gutter={[16, 16]} className="mb-4">
            <Col xs={24} sm={8}>
              <Statistic
                title="Clock In"
                value={today?.clock_in || '—'}
                prefix={<LoginOutlined style={{ color: '#16a34a' }} />}
                styles={{ content: { color: today?.clock_in ? '#065f46' : '#94a3b8' } }}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Statistic
                title="Clock Out"
                value={today?.clock_out || '—'}
                prefix={<LogoutOutlined style={{ color: '#d97706' }} />}
                styles={{ content: { color: today?.clock_out ? '#065f46' : '#94a3b8' } }}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Statistic
                title="Status"
                value={today?.status || 'Not marked'}
                prefix={
                  today?.status === 'present' ? (
                    <CheckCircleOutlined style={{ color: '#16a34a' }} />
                  ) : today?.status === 'late' ? (
                    <ClockCircleOutlined style={{ color: '#d97706' }} />
                  ) : today?.status === 'absent' ? (
                    <CloseCircleOutlined style={{ color: '#dc2626' }} />
                  ) : (
                    <ClockCircleOutlined style={{ color: '#94a3b8' }} />
                  )
                }
                styles={{
                  content: {
                    color:
                      today?.status === 'present' ? '#16a34a' :
                      today?.status === 'late' ? '#d97706' :
                      today?.status === 'absent' ? '#dc2626' :
                      '#64748b',
                  },
                }}
              />
            </Col>
          </Row>
        )}

        {/* ═══════════ Clock In / Clock Out buttons — UNTOUCHED ═══════════ */}
        <Space wrap>
          <Button
            type="primary"
            size="large"
            icon={<LoginOutlined />}
            onClick={clockIn}
            disabled={!canClockIn}
            loading={clocking && canClockIn}
            style={{ backgroundColor: canClockIn ? '#15803d' : undefined }}
          >
            Clock In
          </Button>
          <Button
            size="large"
            icon={<LogoutOutlined />}
            onClick={clockOut}
            disabled={!canClockOut}
            loading={clocking && canClockOut}
            danger
          >
            Clock Out
          </Button>
          {pendingEarly && (
            <Badge
              status="warning"
              text={<Text type="secondary">Awaiting admin approval</Text>}
            />
          )}
          {approvedEarly && !today?.clock_out && (
            <Badge
              status="success"
              text={<Text type="secondary">Approved — you can clock out</Text>}
            />
          )}
          {today?.clock_out && (
            <Badge
              status="success"
              text={<Text type="secondary">Day complete — see you tomorrow</Text>}
            />
          )}
        </Space>
      </Card>

      {/* ═══════════ Recent History ═══════════ */}
      <Card
        title={
          <Space>
            <span>Recent Attendance</span>
            <Tag color="default">Last {RECENT_LIMIT}</Tag>
          </Space>
        }
        variant="borderless"
        className="shadow-sm"
        extra={
          !isMobile && (
            <Text type="secondary">
              showing {recentHistory.length} of {history.length}
            </Text>
          )
        }
      >
        {isMobile ? (
          loading ? (
            <Text type="secondary">Loading...</Text>
          ) : recentHistory.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No records yet" />
          ) : (
            <div>{recentHistory.map(renderMobileRecord)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={recentHistory}
            loading={loading}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No records yet' }}
          />
        )}
      </Card>

      {/* ═══════════ Early clock-out request modal ═══════════ */}
      <Modal
        open={earlyModalOpen}
        title="Request early clock-out"
        okText="Submit request"
        cancelText="Cancel"
        confirmLoading={submittingRequest}
        onOk={submitEarlyRequest}
        onCancel={() => setEarlyModalOpen(false)}
        centered
        width={500}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            title="This needs admin approval"
            description="You'll be able to clock out once an administrator approves your request."
          />
          <div>
            <Text strong>Reason for leaving early</Text>
            <TextArea
              rows={4}
              style={{ marginTop: 6 }}
              placeholder="e.g. Doctor's appointment, family emergency, official duty…"
              value={earlyReason}
              onChange={(e) => setEarlyReason(e.target.value)}
              maxLength={500}
              showCount
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}