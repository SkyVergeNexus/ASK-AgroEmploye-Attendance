import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Card, Row, Col, Button, Typography, Space, Tag, Statistic, message,
  Table, Empty, Badge, Grid, Avatar, Alert, Modal, Input, Popconfirm,
} from 'antd';
import {
  LoginOutlined, LogoutOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, CalendarOutlined, UserOutlined, ReloadOutlined, DeleteOutlined,
  EnvironmentOutlined, WifiOutlined, CameraOutlined, HomeOutlined,
  SafetyCertificateOutlined, PlusOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../config';

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

export default function Dashboard() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [earlyRequests, setEarlyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [now, setNow] = useState(new Date());

  const [ipCheck, setIpCheck] = useState(null);
  const [ipChecking, setIpChecking] = useState(false);

  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [clockModeOpen, setClockModeOpen] = useState(false);
  const [remoteClockInOpen, setRemoteClockInOpen] = useState(false);
  const [remoteClockOutOpen, setRemoteClockOutOpen] = useState(false);
  const [remoteLocation, setRemoteLocation] = useState('');
  const [remoteSelfie, setRemoteSelfie] = useState(null);
  const [selfieCoordinates, setSelfieCoordinates] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieCapturedAt, setSelfieCapturedAt] = useState(null);
  const [capturingSelfie, setCapturingSelfie] = useState(false);

  const [taskInput, setTaskInput] = useState('');
  const [remoteTasks, setRemoteTasks] = useState([]);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef(null);

  const [geo, setGeo] = useState({
    status: 'idle',
    distance: null,
    coords: null,
    radius: null,
  });

  const [clockInError, setClockInError] = useState(null);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    if (!remoteSelfie) {
      setSelfiePreview(null);
      return undefined;
    }
    const previewUrl = URL.createObjectURL(remoteSelfie);
    setSelfiePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [remoteSelfie]);

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

  const checkIp = useCallback(async () => {
    setIpChecking(true);
    try {
      const { data } = await api.get('/settings/check-ip');
      setIpCheck(data);
    } catch {
      setIpCheck(null);
    } finally {
      setIpChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
    checkIp();
  }, [load, checkIp]);

  useEffect(() => {
    checkIp();
  }, [today, checkIp]);

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

  // ═══════════ CAMERA CAPTURE ═══════════
  const openCamera = async () => {
    setRemoteSelfie(null);
    setSelfieCoordinates(null);
    setSelfieCapturedAt(null);
    setCameraError(null);
    setCameraReady(false);
    setCameraOpen(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported by this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      setCameraStream(stream);
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in your browser settings.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : err.message || 'Could not open camera';
      setCameraError(msg);
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }
    setCameraStream(null);
    setCameraOpen(false);
    setCameraReady(false);
    setCameraError(null);
  };

  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play().catch(() => {});
        setCameraReady(true);
      };
    }
  }, [cameraOpen, cameraStream]);

  useEffect(() => {
    if (!cameraOpen && cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraOpen, cameraStream]);

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || capturingSelfie) return;

    setCapturingSelfie(true);
    try {
      if (!navigator.geolocation) {
        throw new Error('Location is not supported by this browser');
      }
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => reject(new Error(error.message || 'Allow location access to capture the selfie location')),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
      const coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      const capturedAt = new Date();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );

      if (!blob) throw new Error('Failed to capture photo');

      const file = new File([blob], `selfie_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      setRemoteSelfie(file);
      setSelfieCoordinates(coordinates);
      setSelfieCapturedAt(capturedAt);
      closeCamera();
      message.success('Photo captured');
    } catch (err) {
      message.error(err.message || 'Could not capture photo and location');
    } finally {
      setCapturingSelfie(false);
    }
  };

  // ═══════════ TODAY'S REQUESTS ═══════════
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

  // ═══════════ CLOCK IN ═══════════
  const clockIn = async (mode = 'onsite') => {
    if (mode === 'remote' && !remoteLocation.trim()) {
      message.error('Enter the location where you are working today');
      return;
    }
    if (mode === 'remote' && !remoteSelfie) {
      message.error('Take a live selfie with your camera before clocking in');
      return;
    }
    if (mode === 'remote' && !selfieCoordinates) {
      message.error('Retake the selfie to capture its GPS location');
      return;
    }
    setClocking(true);
    setClockInError(null);
    try {
      let coords = geo.coords;
      if (mode === 'remote') {
        coords = selfieCoordinates;
      } else if (!coords && navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
      }

      if (mode === 'remote') {
        const formData = new FormData();
        formData.append('mode', 'remote');
        formData.append('remote_location', remoteLocation.trim());
        formData.append('lat', String(coords.lat));
        formData.append('lng', String(coords.lng));
        formData.append('selfie', remoteSelfie);
        if (selfieCapturedAt) {
          formData.append('captured_at', selfieCapturedAt.toISOString());
        }
        await api.post('/attendance/clock-in', formData);
      } else {
        await api.post('/attendance/clock-in', {
          mode: 'onsite',
          ...(coords || {}),
        });
      }
      message.success('Clocked in!');
      setClockModeOpen(false);
      setRemoteClockInOpen(false);
      setRemoteLocation('');
      setRemoteSelfie(null);
      setSelfieCoordinates(null);
      setSelfieCapturedAt(null);
      load();
    } catch (e) {
      const data = e.response?.data;
      const msg = data?.message || e.message || 'Clock-in failed';
      setClockInError({
        message: msg,
        requiresOfficeWifi: !!data?.requiresOfficeWifi,
        requiresLocation: !!data?.requiresLocation,
        distance: data?.distance,
        radius: data?.radius,
        sawIp: data?.sawIp,
      });
      message.error(msg);
      checkIp();
    } finally {
      setClocking(false);
    }
  };

  // ═══════════ CLOCK OUT ═══════════
  const clockOut = async (tasksList) => {
    const hasTasksArg = Array.isArray(tasksList);

    if (today?.clock_in_mode === 'remote' && !hasTasksArg) {
      setRemoteClockOutOpen(true);
      return;
    }

    if (today?.clock_in_mode === 'remote' && hasTasksArg && tasksList.length === 0) {
      message.error('Add at least one completed task before clocking out');
      return;
    }

    const tasksText = hasTasksArg
      ? tasksList.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : null;

    setClocking(true);
    try {
      await api.post(
        '/attendance/clock-out',
        hasTasksArg ? { tasks_completed: tasksText } : {}
      );
      message.success('Clocked out!');
      setRemoteClockOutOpen(false);
      setRemoteTasks([]);
      setTaskInput('');
      load();
    } catch (e) {
      const data = e.response?.data;
      if (data?.requiresApproval) {
        setRemoteClockOutOpen(false);
        setEarlyModalOpen(true);
        setEarlyReason('');
      } else {
        message.error(data?.message || 'Clock-out failed');
      }
    } finally {
      setClocking(false);
    }
  };

  // ═══════════ TASK LIST HANDLERS ═══════════
  const addTask = () => {
    const trimmed = taskInput.trim();
    if (!trimmed) {
      message.warning('Type a task before adding');
      return;
    }
    if (trimmed.length > 500) {
      message.warning('Each task must be 500 characters or fewer');
      return;
    }
    setRemoteTasks((prev) => [...prev, trimmed]);
    setTaskInput('');
  };

  const removeTask = (index) => {
    setRemoteTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const editTask = (index, value) => {
    setRemoteTasks((prev) => prev.map((t, i) => (i === index ? value : t)));
  };

  const handleTaskInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTask();
    }
  };

  // ═══════════ EARLY LEAVE ═══════════
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

  // ═══════════ Flags ═══════════
  const enforceLocation = !!Number(settings?.enforce_location);
  const ipEnforced = ipCheck?.enforce === true;
  const enforceNetwork = !!Number(settings?.enforce_network);

  const networkIsEnforced = ipCheck ? ipEnforced : enforceNetwork;
  const ipAllowed = ipCheck ? ipCheck.allowed !== false : true;

  const canClockIn = !today;
  const canClockInOnsite =
    canClockIn &&
    (!enforceLocation || !locationBlocked) &&
    (!networkIsEnforced || ipAllowed);
  const canClockOut = today && !today.clock_out && !pendingEarly;

  const picUrl = assetUrl(user?.profile_picture);

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

    if (today?.status === 'leave') {
      return { text: '—', hint: 'Approved leave today', active: false };
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
      render: (v) => (
        <Tag color={statusColor[v] || 'default'}>
          {v ? v[0].toUpperCase() + v.slice(1) : '—'}
        </Tag>
      ),
    },
  ];

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

      {/* ═══════════════ Today's status ═══════════════ */}
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
            onClick={() => { load(); checkIp(); }}
            loading={loading || ipChecking}
          >
            {!isMobile && 'Refresh'}
          </Button>
        }
      >
        {!today && networkIsEnforced && ipCheck && (
          <>
            {ipCheck.allowed ? (
              <Alert
                type="success"
                showIcon
                icon={<SafetyCertificateOutlined />}
                style={{ marginBottom: 12 }}
                title="You're on the office network"
                description={
                  <span style={{ fontSize: 13 }}>
                    Your IP <Text code>{ipCheck.clientIp || 'unknown'}</Text> is in
                    the allowlist. On-site clock-in is available.
                  </span>
                }
              />
            ) : (
              <Alert
                type="error"
                showIcon
                icon={<WifiOutlined />}
                style={{ marginBottom: 12 }}
                title="You're not on the office Wi-Fi"
                description={
                  <span style={{ fontSize: 13 }}>
                    Your IP <Text code>{ipCheck.clientIp || 'unknown'}</Text> is not
                    in the allowed list. Connect to the office network to clock in
                    on-site, or use remote clock-in below.
                  </span>
                }
              />
            )}
          </>
        )}

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

        {!today && (enforceLocation || networkIsEnforced) && (
          <Alert
            type="info"
            showIcon
            icon={networkIsEnforced ? <WifiOutlined /> : <EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title={
              enforceLocation && networkIsEnforced
                ? 'Two conditions must pass to clock in'
                : networkIsEnforced
                ? 'Office network check is on'
                : 'GPS geofence check is on'
            }
            description={
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                {networkIsEnforced && (
                  <div>
                    <strong>1. Office Wi-Fi</strong> — your device must be on the
                    office network.
                    {ipCheck && (
                      <>
                        {' '}
                        {ipCheck.allowed ? (
                          <Tag color="green">✓ network OK</Tag>
                        ) : (
                          <Tag color="red">✗ not on office network</Tag>
                        )}
                      </>
                    )}
                  </div>
                )}
                {enforceLocation && (
                  <div>
                    <strong>{networkIsEnforced ? '2.' : '1.'} Inside GPS radius</strong>{' '}
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
                )}
              </div>
            }
          />
        )}

        {!today && enforceLocation && geo.status === 'checking' && (
          <Alert
            type="info"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Checking your location…"
            description="Verifying you are at the office before enabling clock-in."
          />
        )}
        {!today && enforceLocation && geo.status === 'outside' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title={`You are ${geo.distance}m from the office`}
            description={`You must be within ${geo.radius}m to clock in. Move closer to the office.`}
          />
        )}
        {!today && enforceLocation && geo.status === 'denied' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Location permission denied"
            description="Enable location access in your browser to clock in."
          />
        )}
        {!today && enforceLocation && geo.status === 'unsupported' && (
          <Alert
            type="warning"
            showIcon
            icon={<EnvironmentOutlined />}
            style={{ marginBottom: 12 }}
            title="Location not supported by this device"
            description="Your browser doesn't support GPS."
          />
        )}
        {!today && enforceLocation && geo.status === 'no-office' && (
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
                  today?.status === 'absent' ? '#dc2626' :
                  today?.status === 'leave' ? '#7c3aed' : '#94a3b8'
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
                ) : today?.status === 'leave' ? (
                  <CalendarOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
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
                        today?.status === 'absent' ? '#dc2626' :
                        today?.status === 'leave' ? '#7c3aed' : '#64748b',
                    }}
                  >
                    {today?.status === 'leave' ? 'On approved leave' : today?.status || 'Not marked'}
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
                value={today?.status === 'leave' ? 'On approved leave' : today?.status || 'Not marked'}
                prefix={
                  today?.status === 'present' ? (
                    <CheckCircleOutlined style={{ color: '#16a34a' }} />
                  ) : today?.status === 'late' ? (
                    <ClockCircleOutlined style={{ color: '#d97706' }} />
                  ) : today?.status === 'absent' ? (
                    <CloseCircleOutlined style={{ color: '#dc2626' }} />
                  ) : today?.status === 'leave' ? (
                    <CalendarOutlined style={{ color: '#7c3aed' }} />
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
                      today?.status === 'leave' ? '#7c3aed' :
                      '#64748b',
                  },
                }}
              />
            </Col>
          </Row>
        )}

        <Space wrap>
          <Button
            type="primary"
            size="large"
            icon={<LoginOutlined />}
            onClick={() => setClockModeOpen(true)}
            disabled={!canClockIn}
            loading={clocking}
            style={{ backgroundColor: canClockIn ? '#15803d' : undefined }}
          >
            Clock In
          </Button>
          <Button
            size="large"
            icon={<LogoutOutlined />}
            onClick={() => clockOut()}
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

      {/* ═══════════ Clock mode modal ═══════════ */}
      <Modal
        open={clockModeOpen}
        title="How are you working today?"
        footer={null}
        onCancel={() => setClockModeOpen(false)}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Text type="secondary">
          Choose where you are reporting from to continue with the correct attendance check.
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 18 }}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <WifiOutlined style={{ color: '#15803d', fontSize: 22 }} />
              <Text strong>On-site</Text>
              <Text type="secondary" style={{ minHeight: 40 }}>
                Clock in using the usual office attendance process.
              </Text>
              <Button
                block
                disabled={!canClockInOnsite}
                loading={clocking}
                onClick={() => clockIn('onsite')}
              >
                Clock in on-site
              </Button>
              {!canClockInOnsite && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {networkIsEnforced && !ipAllowed
                    ? 'You must be on the office Wi-Fi network.'
                    : enforceLocation && locationBlocked
                    ? 'You must be within the office GPS radius.'
                    : 'Office checks must pass.'}
                </Text>
              )}
            </Space>
          </Card>
          <Card size="small" style={{ borderRadius: 12, borderColor: '#bbf7d0' }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <HomeOutlined style={{ color: '#15803d', fontSize: 22 }} />
              <Text strong>Remote</Text>
              <Text type="secondary" style={{ minHeight: 40 }}>
                Submit your work location, a live selfie, and your current GPS location.
              </Text>
              <Button
                type="primary"
                block
                loading={clocking}
                onClick={() => {
                  setClockModeOpen(false);
                  setRemoteClockInOpen(true);
                }}
              >
                Clock in remotely
              </Button>
            </Space>
          </Card>
        </div>
      </Modal>

      {/* ═══════════ Remote clock-in modal ═══════════ */}
      <Modal
        open={remoteClockInOpen}
        title="Remote clock-in"
        okText="Submit & clock in"
        cancelText="Cancel"
        confirmLoading={clocking}
        okButtonProps={{
          disabled: !remoteLocation.trim() || !remoteSelfie || !selfieCoordinates,
        }}
        onOk={() => clockIn('remote')}
        onCancel={() => {
          setRemoteClockInOpen(false);
          setRemoteSelfie(null);
          setSelfieCoordinates(null);
          setSelfieCapturedAt(null);
        }}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="Remote attendance check"
            description={
              settings?.work_start && settings?.work_end
                ? `Remote clock-in is available from ${String(settings.work_start).slice(0, 5)} to ${String(settings.work_end).slice(0, 5)}. Enter your work location, allow GPS, and take a live selfie. Fresh GPS coordinates are captured with the selfie and saved with the attendance record.`
                : 'Enter your work location, allow GPS, and take a live selfie during working hours. Fresh GPS coordinates are captured with the selfie and saved with the attendance record.'
            }
          />
          <div>
            <Text strong>Work location (enter the site or place name)</Text>
            <Input
              value={remoteLocation}
              onChange={(e) => setRemoteLocation(e.target.value)}
              placeholder="e.g. Client farm, town or site name"
              maxLength={255}
              showCount
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Text strong>Live selfie at your work location</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 2, marginBottom: 8 }}>
              You must take the photo now — uploading from your gallery is disabled to prevent old photos.
            </Text>
            {selfiePreview ? (
              <div>
                <img
                  src={selfiePreview}
                  alt="Remote work location selfie preview"
                  style={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10 }}
                />
                {selfieCapturedAt && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                    Captured at {selfieCapturedAt.toLocaleTimeString()}
                  </Text>
                )}
                {selfieCoordinates && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                    GPS captured with selfie: {selfieCoordinates.lat.toFixed(6)}, {selfieCoordinates.lng.toFixed(6)}
                    {Number.isFinite(selfieCoordinates.accuracy)
                      ? ` (accuracy ±${Math.round(selfieCoordinates.accuracy)} m)`
                      : ''}
                  </Text>
                )}
                <Space style={{ marginTop: 8 }}>
                  <Button icon={<CameraOutlined />} onClick={openCamera} size="small">
                    Retake
                  </Button>
                  <Button
                    type="link"
                    danger
                    onClick={() => {
                      setRemoteSelfie(null);
                      setSelfieCoordinates(null);
                      setSelfieCapturedAt(null);
                    }}
                    style={{ paddingLeft: 0 }}
                  >
                    Remove photo
                  </Button>
                </Space>
              </div>
            ) : (
              <div>
                <Button
                  type="primary"
                  icon={<CameraOutlined />}
                  onClick={openCamera}
                  block
                  size="large"
                  style={{ backgroundColor: '#15803d', height: 52, fontSize: 15, fontWeight: 600 }}
                >
                  Open camera
                </Button>
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#92400e',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Note:</strong> you must take a live photo with the camera.
                  Gallery uploads are disabled for security.
                </div>
              </div>
            )}
          </div>
        </Space>
      </Modal>

      {/* ═══════════ Camera capture modal ═══════════ */}
      <Modal
        open={cameraOpen}
        title="Take a selfie"
        onCancel={closeCamera}
        footer={null}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        destroyOnClose
        styles={{ body: { padding: 12 } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {cameraError ? (
            <Alert
              type="error"
              showIcon
              title="Camera unavailable"
              description={cameraError}
            />
          ) : (
            <div
              style={{
                position: 'relative',
                width: '100%',
                background: '#000',
                borderRadius: 12,
                overflow: 'hidden',
                aspectRatio: '4 / 3',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  transform: 'scaleX(-1)',
                }}
              />
              {!cameraReady && !cameraError && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 13,
                  }}
                >
                  Starting camera…
                </div>
              )}
            </div>
          )}

          <Space style={{ width: '100%', justifyContent: 'center' }} size="middle">
            <Button onClick={closeCamera}>Cancel</Button>
            <Button
              type="primary"
              size="large"
              icon={<CameraOutlined />}
              onClick={captureFromCamera}
              disabled={!cameraReady || !!cameraError || capturingSelfie}
              loading={capturingSelfie}
              style={{ minWidth: 160, backgroundColor: cameraReady ? '#15803d' : undefined }}
            >
              {capturingSelfie ? 'Getting GPS and capturing…' : 'Capture'}
            </Button>
          </Space>

          {cameraError && (
            <Alert
              type="warning"
              showIcon
              title="Camera problem"
              description="If your camera keeps failing, contact your administrator. Gallery uploads are disabled for security reasons."
            />
          )}
        </Space>
      </Modal>

      {/* ═══════════ Remote clock-out modal with task list ═══════════ */}
      <Modal
        open={remoteClockOutOpen}
        title="Tasks completed today"
        okText="Submit & clock out"
        cancelText="Cancel"
        confirmLoading={clocking}
        okButtonProps={{ disabled: remoteTasks.length === 0 }}
        onOk={() => clockOut(remoteTasks)}
        onCancel={() => {
          setRemoteClockOutOpen(false);
          setRemoteTasks([]);
          setTaskInput('');
        }}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="A daily work summary is required"
            description="Add each task you completed today. Your entries are numbered automatically."
          />

          <div>
            <Text strong>Add a completed task</Text>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={handleTaskInputKeyDown}
                placeholder="e.g. Visited client farm in Nsawam"
                maxLength={500}
                allowClear
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={addTask}
                disabled={!taskInput.trim()}
              >
                Add
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Press Enter to add quickly.
            </Text>
          </div>

          {remoteTasks.length > 0 && (
            <div>
              <Text strong>
                Your tasks ({remoteTasks.length})
              </Text>
              <div style={{ marginTop: 8 }}>
                {remoteTasks.map((task, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        background: '#065f46',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>
                    <Input
                      value={task}
                      onChange={(e) => editTask(index, e.target.value)}
                      variant="borderless"
                      style={{ flex: 1, padding: 0, fontSize: 13 }}
                      maxLength={500}
                    />
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeTask(index)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {remoteTasks.length === 0 && (
            <div
              style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: 13,
                border: '1px dashed #e2e8f0',
                borderRadius: 10,
              }}
            >
              No tasks added yet. Type a task above and click <strong>Add</strong>.
            </div>
          )}
        </Space>
      </Modal>

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

      {/* ═══════════ Early clock-out modal ═══════════ */}
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