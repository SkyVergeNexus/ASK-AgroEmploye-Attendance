import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Card, Statistic, Row, Col, Table, Tag, Button, Typography, Space, Badge,
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
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

const statusColor = {
  present: 'green',
  late: 'gold',
  absent: 'red',
  'half-day': 'blue',
  leave: 'purple',
};

// Use LOCAL date (not UTC) so today's key matches the server's date
const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AdminDashboard() {
  const [dayKey, setDayKey] = useState(getTodayKey());
  const [stats, setStats] = useState({
    total: 0, present: 0, late: 0, absent: 0, pending_early_leaves: 0,
  });
  const [todayRows, setTodayRows] = useState([]);
  const [earlyRequests, setEarlyRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async (dateKey) => {
    setLoading(true);
    try {
      const [statsRes, todayRes, settingsRes, earlyRes] = await Promise.all([
        api.get('/attendance/stats'),
        api.get('/attendance/all', { params: { from: dateKey, to: dateKey } }),
        api.get('/settings'),
        api.get('/attendance/early-leave/all', { params: { status: 'pending' } }),
      ]);

      const onlyToday = (todayRes.data || []).filter((r) => {
        const rowDate = String(r.attendance_date).slice(0, 10);
        return rowDate === dateKey;
      });

      setStats(statsRes.data);
      setTodayRows(onlyToday);
      setSettings(settingsRes.data);
      setEarlyRequests(earlyRes.data || []);
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
        setTodayRows([]);
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

  const displayRows = useMemo(() => {
    return todayRows.filter(
      (r) => String(r.attendance_date).slice(0, 10) === dayKey
    );
  }, [todayRows, dayKey]);

  const columns = [
    {
      title: 'Employee',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text, row) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-xs text-gray-500">{row.employee_code}</div>
        </div>
      ),
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (v) => v || '—',
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

  const pendingCount = earlyRequests.length;

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
          <Card
            title={
              <Space>
                <span>Today's Attendance</span>
                <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                  {dayKey}
                </Text>
              </Space>
            }
            bordered={false}
            className="shadow-sm"
            extra={
              <Text type="secondary">
                {displayRows.length} record{displayRows.length === 1 ? '' : 's'}
              </Text>
            }
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={displayRows}
              loading={loading}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'No one has clocked in today yet' }}
            />
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