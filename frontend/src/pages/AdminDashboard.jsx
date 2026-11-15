import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Card, Statistic, Row, Col, Tag, Button, Typography, Space, Badge,
  Divider, Descriptions, Empty, message, List, Alert,
} from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  ApartmentOutlined,
  UserAddOutlined,
  FileTextOutlined,
  WarningOutlined,
  ArrowRightOutlined,
  LoginOutlined,
  LogoutOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

// Use LOCAL date (not UTC) so today's key matches the server's date
const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Activity event filter chips
const FEED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'clock', label: 'Clock' },
  { key: 'early', label: 'Early leaves' },
  { key: 'registration', label: 'Registrations' },
];

export default function AdminDashboard() {
  const [dayKey, setDayKey] = useState(getTodayKey());
  const [stats, setStats] = useState({
    total: 0, present: 0, late: 0, absent: 0, pending_early_leaves: 0,
  });
  const [earlyRequests, setEarlyRequests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [feedFilter, setFeedFilter] = useState('all');

  const load = useCallback(async (dateKey) => {
    setLoading(true);
    try {
      const [statsRes, settingsRes, earlyRes, activityRes] = await Promise.all([
        api.get('/attendance/stats'),
        api.get('/settings'),
        api.get('/attendance/early-leave/all', { params: { status: 'pending' } }),
        api.get('/attendance/activity-feed', {
          params: { from: dateKey, to: dateKey, limit: 150 },
        }),
      ]);

      setStats(statsRes.data);
      setSettings(settingsRes.data);
      setEarlyRequests(earlyRes.data || []);
      setActivity(activityRes.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Watch for date rollover every 30s
  useEffect(() => {
    const tick = () => {
      const current = getTodayKey();
      if (current !== dayKey) {
        setActivity([]);
        setEarlyRequests([]);
        setDayKey(current);
      }
    };
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [dayKey]);

  // Load whenever dayKey changes + poll every 30s
  useEffect(() => {
    load(dayKey);
    const timer = setInterval(() => load(dayKey), 30000);
    return () => clearInterval(timer);
  }, [dayKey, load]);

  // Filtered feed based on chip selection
  const filteredActivity = useMemo(() => {
    if (feedFilter === 'all') return activity;
    if (feedFilter === 'clock') {
      return activity.filter((e) => e.kind === 'clock-in' || e.kind === 'clock-out');
    }
    if (feedFilter === 'early') {
      return activity.filter((e) => e.kind.startsWith('early'));
    }
    if (feedFilter === 'registration') {
      return activity.filter((e) => e.kind === 'registration');
    }
    return activity;
  }, [activity, feedFilter]);

  const pendingCount = earlyRequests.length;

  // ── Render a single activity item ──────────────────────────
  const renderActivityItem = (ev) => {
    const time = ev.at
      ? new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';

    const baseStyle = {
      width: 34, height: 34, borderRadius: 9,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 15, flexShrink: 0,
    };

    const renderIcon = () => {
      switch (ev.kind) {
        case 'clock-in':
          return <div style={{ ...baseStyle, background: '#ecfdf5', color: '#16a34a' }}><LoginOutlined /></div>;
        case 'clock-out':
          return <div style={{ ...baseStyle, background: '#fffbeb', color: '#d97706' }}><LogoutOutlined /></div>;
        case 'early-request':
          return <div style={{ ...baseStyle, background: '#fef3c7', color: '#b45309' }}><ClockCircleOutlined /></div>;
        case 'early-approved':
          return <div style={{ ...baseStyle, background: '#ecfdf5', color: '#16a34a' }}><CheckOutlined /></div>;
        case 'early-rejected':
          return <div style={{ ...baseStyle, background: '#fef2f2', color: '#dc2626' }}><CloseOutlined /></div>;
        case 'registration':
          return <div style={{ ...baseStyle, background: '#eff6ff', color: '#1677ff' }}><UserAddOutlined /></div>;
        default:
          return <div style={{ ...baseStyle, background: '#f8fafc', color: '#64748b' }}><ReloadOutlined /></div>;
      }
    };

    const name = ev.employee?.full_name || 'Unknown';
    const code = ev.employee?.employee_code;
    const dept = ev.employee?.department;

    const renderBody = () => {
      switch (ev.kind) {
        case 'clock-in':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong> clocked in
                {ev.meta?.mode === 'remote' && (
                  <> <Tag color="purple" style={{ marginLeft: 4, fontSize: 10 }}>Remote</Tag></>
                )}
                {ev.meta?.status === 'late' && (
                  <> <Tag color="gold" style={{ marginLeft: 2, fontSize: 10 }}>Late</Tag></>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {ev.meta?.time}{code ? ` · ${code}` : ''}{dept ? ` · ${dept}` : ''}
              </div>
            </>
          );

        case 'clock-out':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong> clocked out
                {ev.meta?.early && (
                  <> <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>Early</Tag></>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {ev.meta?.time}{code ? ` · ${code}` : ''}
              </div>
              {ev.meta?.early_reason && (
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 3, fontStyle: 'italic' }}>
                  "{ev.meta.early_reason}"
                </div>
              )}
            </>
          );

        case 'early-request':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong> requested early leave
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                Wants out at <strong>{ev.meta?.requested_out_time}</strong>{code ? ` · ${code}` : ''}
              </div>
              {ev.meta?.reason && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>
                  "{ev.meta.reason}"
                </div>
              )}
            </>
          );

        case 'early-approved':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong>'s early leave <Text type="success">approved</Text>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                by {ev.meta?.decided_by_name || 'admin'} · out at {ev.meta?.requested_out_time}
              </div>
            </>
          );

        case 'early-rejected':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong>'s early leave <Text type="danger">rejected</Text>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                by {ev.meta?.decided_by_name || 'admin'}
              </div>
              {ev.meta?.admin_note && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>
                  "{ev.meta.admin_note}"
                </div>
              )}
            </>
          );

        case 'registration':
          return (
            <>
              <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.4 }}>
                <strong>{name}</strong> registered
                {!ev.meta?.is_approved && (
                  <> <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>Pending</Tag></>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {code}{dept ? ` · ${dept}` : ''}
              </div>
              {ev.meta?.email && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {ev.meta.email}
                </div>
              )}
            </>
          );

        default:
          return <div>{name} — {ev.kind}</div>;
      }
    };

    return (
      <div
        key={ev.id}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 0',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        {renderIcon()}
        <div style={{ flex: 1, minWidth: 0 }}>{renderBody()}</div>
        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {time}
        </Text>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Admin Dashboard
          </Title>
          <Text type="secondary">
            {settings?.company_name || 'ASK Agrobusiness Limited'}
            {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString()}`}
          </Text>
        </div>
        <Space>
          <Badge status="processing" text="Live" />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(dayKey)}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Pending early-leave alert */}
      {pendingCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <Text strong>
              {pendingCount} early clock-out request{pendingCount === 1 ? '' : 's'} waiting for review
            </Text>
          }
          description="Employees are waiting for your approval to leave before closing time."
          action={
            <Link to="/early-leave">
              <Button type="primary" size="small" icon={<ArrowRightOutlined />}>
                Review now
              </Button>
            </Link>
          }
        />
      )}

      {/* Stat cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Employees"
              value={stats.total}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Present Today"
              value={stats.present}
              prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Late Today"
              value={stats.late}
              prefix={<ClockCircleOutlined style={{ color: '#d97706' }} />}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="shadow-sm"
            style={
              pendingCount > 0
                ? { border: '1px solid #f59e0b', background: '#fffbeb' }
                : undefined
            }
          >
            <Statistic
              title="Pending Early-Outs"
              value={pendingCount}
              prefix={<WarningOutlined style={{ color: '#d97706' }} />}
              valueStyle={{ color: pendingCount > 0 ? '#d97706' : '#94a3b8' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main content */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* ═══════════════ LIVE ACTIVITY FEED ═══════════════ */}
          <Card
            title={
              <Space wrap>
                <span>Today's Activity</span>
                <Badge count={activity.length} showZero color="#065f46" />
                <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                  {dayKey}
                </Text>
              </Space>
            }
            bordered={false}
            className="shadow-sm"
            extra={
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => load(dayKey)}
                loading={loading}
              >
                Refresh
              </Button>
            }
          >
            {/* Filter chips */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              {FEED_FILTERS.map((opt) => {
                const active = feedFilter === opt.key;
                let count = 0;
                if (opt.key === 'all') count = activity.length;
                else if (opt.key === 'clock')
                  count = activity.filter((e) => e.kind === 'clock-in' || e.kind === 'clock-out').length;
                else if (opt.key === 'early')
                  count = activity.filter((e) => e.kind.startsWith('early')).length;
                else if (opt.key === 'registration')
                  count = activity.filter((e) => e.kind === 'registration').length;

                return (
                  <Button
                    key={opt.key}
                    size="small"
                    type={active ? 'primary' : 'default'}
                    onClick={() => setFeedFilter(opt.key)}
                    style={{
                      borderRadius: 16,
                      fontSize: 12,
                      paddingInline: 14,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {opt.label} {count > 0 && <Text style={{ opacity: 0.7, marginLeft: 4 }}>{count}</Text>}
                  </Button>
                );
              })}
            </div>

            {/* Feed body */}
            {filteredActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    loading
                      ? 'Loading activity…'
                      : feedFilter === 'all'
                      ? 'No activity yet today'
                      : `No ${feedFilter} activity today`
                  }
                />
              </div>
            ) : (
              <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
                {filteredActivity.map(renderActivityItem)}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          {pendingCount > 0 && (
            <Card
              title={
                <Space>
                  <WarningOutlined style={{ color: '#d97706' }} />
                  <span>Pending Early-Outs</span>
                  <Badge count={pendingCount} style={{ backgroundColor: '#d97706' }} />
                </Space>
              }
              bordered={false}
              className="shadow-sm mb-4"
              extra={
                <Link to="/early-leave" style={{ fontSize: 13 }}>
                  View all
                </Link>
              }
            >
              <List
                size="small"
                dataSource={earlyRequests.slice(0, 3)}
                renderItem={(r) => (
                  <List.Item
                    style={{ paddingLeft: 0, paddingRight: 0 }}
                    actions={[
                      <Link key="review" to="/early-leave" style={{ fontSize: 12 }}>
                        Review
                      </Link>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <span className="font-medium">
                          {r.full_name}{' '}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            ({r.employee_code})
                          </Text>
                        </span>
                      }
                      description={
                        <div>
                          <div className="text-xs text-gray-600">
                            Out at <Text strong>{r.requested_out_time}</Text>
                          </div>
                          <div
                            className="text-xs text-gray-500 mt-1"
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            "{r.reason}"
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
              {pendingCount > 3 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <Link to="/early-leave">
                    <Button block type="link" size="small">
                      +{pendingCount - 3} more
                    </Button>
                  </Link>
                </>
              )}
            </Card>
          )}

          <Card
            title="Current Settings"
            bordered={false}
            className="shadow-sm mb-4"
            extra={
              <Link to="/settings">
                <SettingOutlined />
              </Link>
            }
          >
            {settings ? (
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="Company">
                  {settings.company_name}
                </Descriptions.Item>
                <Descriptions.Item label="Work Hours">
                  {settings.work_start} – {settings.work_end}
                </Descriptions.Item>
                <Descriptions.Item label="Late After">
                  {settings.late_threshold_minutes} min
                </Descriptions.Item>
                <Descriptions.Item label="Network check">
                  {Number(settings.enforce_network) ? (
                    <Tag color="green">On</Tag>
                  ) : (
                    <Tag>Off</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="GPS check">
                  {Number(settings.enforce_location) ? (
                    <Tag color="green">On</Tag>
                  ) : (
                    <Tag>Off</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No settings"
              />
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Link to="/settings">
              <Button block icon={<SettingOutlined />}>
                Edit Settings
              </Button>
            </Link>
          </Card>

          <Card title="Quick Actions" bordered={false} className="shadow-sm">
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Link to="/employees">
                <Button block icon={<UserAddOutlined />}>
                  Manage Employees
                </Button>
              </Link>
              <Link to="/early-leave">
                <Button
                  block
                  icon={<WarningOutlined />}
                  danger={pendingCount > 0}
                >
                  Early-Out Requests
                  {pendingCount > 0 && (
                    <Badge count={pendingCount} style={{ marginLeft: 6 }} />
                  )}
                </Button>
              </Link>
              <Link to="/departments">
                <Button block icon={<ApartmentOutlined />}>
                  Departments & Roles
                </Button>
              </Link>
              <Link to="/reports">
                <Button block icon={<FileTextOutlined />}>
                  View Reports
                </Button>
              </Link>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}