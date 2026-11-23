import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Typography, Space, DatePicker, Row, Col, Statistic,
  Select, Button, Grid, Empty, message, Badge, Image, Modal, Descriptions, Divider,
} from 'antd';
import {
  ReloadOutlined, ClockCircleOutlined, CalendarOutlined, EyeOutlined, EnvironmentOutlined,
  CameraOutlined, FileTextOutlined, HomeOutlined, WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../api/axios';
import { assetUrl } from '../config';
import AttendanceRecordTag from '../components/AttendanceRecordTag';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const statusColor = {
  present: 'green',
  late: 'gold',
  absent: 'red',
  'half-day': 'blue',
  leave: 'purple',
};

const STATUS_META = {
  present: { accent: '#16a34a', bg: '#ecfdf5', text: '#065f46', label: 'Present' },
  late: { accent: '#d97706', bg: '#fffbeb', text: '#92400e', label: 'Late' },
  absent: { accent: '#dc2626', bg: '#fef2f2', text: '#991b1b', label: 'Absent' },
  'half-day': { accent: '#1677ff', bg: '#eff6ff', text: '#1e40af', label: 'Half Day' },
  leave: { accent: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6', label: 'Leave' },
};

const statusOptions = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'half-day', label: 'Half Day' },
  { value: 'leave', label: 'Leave' },
];

const QUICK_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'last30', label: '30 days' },
];

export default function AttendanceHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [quickRange, setQuickRange] = useState('month');
  const [statusFilter, setStatusFilter] = useState([]);
  const [viewing, setViewing] = useState(null);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async (from, to, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/attendance/my');
      const fromStr = from.format('YYYY-MM-DD');
      const toStr = to.format('YYYY-MM-DD');
      const within = (data || []).filter((r) => {
        const d = String(r.attendance_date).slice(0, 10);
        return d >= fromStr && d <= toStr;
      });
      setRows(within);
      setViewing((current) => current
        ? within.find((record) => record.id === current.id) || current
        : current);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load history');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range[0], range[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(
      () => load(range[0], range[1], { silent: true }),
      60 * 1000
    );
    return () => clearInterval(interval);
  }, [load, range]);

  const applyQuick = (key) => {
    setQuickRange(key);
    let from, to;
    if (key === 'today') {
      from = to = dayjs();
    } else if (key === 'week') {
      from = dayjs().startOf('isoWeek');
      to = dayjs().endOf('isoWeek');
    } else if (key === 'month') {
      from = dayjs().startOf('month');
      to = dayjs().endOf('month');
    } else if (key === 'last30') {
      from = dayjs().subtract(29, 'day');
      to = dayjs();
    } else {
      return;
    }
    setRange([from, to]);
    load(from, to);
  };

  const applyRange = (values) => {
    if (!values || values.length !== 2) return;
    setRange(values);
    setQuickRange('custom');
    load(values[0], values[1]);
  };

  const filtered = useMemo(() => {
    if (!statusFilter.length) return rows;
    return rows.filter((r) => statusFilter.includes(r.status));
  }, [rows, statusFilter]);

  const showSummary = quickRange !== 'month' || statusFilter.length > 0;
  const summaryTitle = statusFilter.length === 1
    ? STATUS_META[statusFilter[0]]?.label || statusFilter[0]
    : 'Matching records';

  // 5 core columns only — everything else moves to the detail modal
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
          <AttendanceRecordTag record={r} />
          {r.early_leave_reason && (
            <Tag color="orange" style={{ marginLeft: 4 }}>early</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Mode',
      dataIndex: 'clock_in_mode',
      key: 'clock_in_mode',
      render: (v) => (
        <Tag color={v === 'remote' ? 'purple' : 'blue'}>
          {v === 'remote' ? 'Remote' : 'On-site'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => (
        <Tag color={statusColor[v] || 'default'}>
          {STATUS_META[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, r) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewing(r)}
        >
          View
        </Button>
      ),
    },
  ];

  // ── Mobile compact card — 5 fields + View button ──
  const renderMobileCard = (r) => {
    const meta = STATUS_META[r.status] || {
      accent: '#94a3b8', bg: '#f8fafc', text: '#475569', label: r.status,
    };
    const isRemote = r.clock_in_mode === 'remote';

    return (
      <div
        key={r.id}
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderLeft: `4px solid ${meta.accent}`,
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 10,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: meta.bg, color: meta.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, flexShrink: 0,
              }}
            >
              <ClockCircleOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                {String(r.attendance_date).slice(0, 10)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {r.status === 'leave'
                  ? 'Approved leave'
                  : `${isRemote ? 'Remote' : 'On-site'} · ${r.early_leave_reason ? 'Left early' : 'Full day'}`}
              </div>
            </div>
          </div>
          <Tag
            color={statusColor[r.status] || 'default'}
            style={{ margin: 0, borderRadius: 10, textTransform: 'capitalize', flexShrink: 0, fontWeight: 600, fontSize: 11 }}
          >
            {meta.label}
          </Tag>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            background: '#f8fafc',
            borderRadius: 10,
            padding: '10px 12px',
            marginTop: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
              Clock In
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {r.clock_in || '—'}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 10 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
              Clock Out
            </div>
            <div
              style={{
                fontSize: 15, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums',
                color: r.clock_out ? '#d97706' : '#94a3b8',
              }}
            >
              {r.clock_out || '—'}
            </div>
            <AttendanceRecordTag record={r} />
          </div>
        </div>

        <Button
          block
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewing(r)}
          style={{ marginTop: 10, borderRadius: 8 }}
        >
          View details
        </Button>
      </div>
    );
  };

  // ── Detail modal — full activity for one day ──
  const renderDetailModal = () => {
    if (!viewing) return null;
    const r = viewing;
    const meta = STATUS_META[r.status] || { label: r.status, accent: '#94a3b8' };
    const isRemote = r.clock_in_mode === 'remote';
    const hasCoord = r.clock_in_lat != null && r.clock_in_lng != null;

    return (
      <Modal
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 620}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        title={
          <Space>
            <span>Attendance details</span>
            <Tag color={statusColor[r.status] || 'default'} style={{ marginLeft: 6 }}>
              {meta.label}
            </Tag>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Summary card */}
          <Card
            size="small"
            bordered={false}
            style={{
              background: isRemote ? '#faf5ff' : '#eff6ff',
              border: `1px solid ${isRemote ? '#e9d5ff' : '#bfdbfe'}`,
              borderRadius: 12,
            }}
          >
            <Space size={10} align="center">
              {r.status === 'leave' ? (
                <CalendarOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
              ) : isRemote ? (
                <HomeOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
              ) : (
                <WifiOutlined style={{ fontSize: 20, color: '#1677ff' }} />
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  {r.status === 'leave' ? 'Approved leave' : isRemote ? 'Remote work day' : 'On-site work day'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {String(r.attendance_date).slice(0, 10)}
                </Text>
              </div>
            </Space>
          </Card>

          {/* Time block */}
          <Descriptions
            column={2}
            size="small"
            bordered
            labelStyle={{ width: 120, background: '#f8fafc', fontWeight: 600 }}
          >
            <Descriptions.Item label="Clock in">
              <Text strong style={{ color: '#16a34a' }}>{r.clock_in || '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Clock out">
              <Text strong style={{ color: r.clock_out ? '#d97706' : '#94a3b8' }}>
                {r.clock_out || '—'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColor[r.status] || 'default'}>
                {meta.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Mode">
              <Tag color={r.status === 'leave' || isRemote ? 'purple' : 'blue'}>
                {r.status === 'leave' ? 'Leave' : isRemote ? 'Remote' : 'On-site'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Record">
              <AttendanceRecordTag record={r} />
              {!r.admin_resolved && !r.auto_clocked_out && !r.needs_review && 'Employee clock-out'}
            </Descriptions.Item>
            {r.status === 'leave' && (
              <Descriptions.Item label="Attendance note" span={2}>
                {r.notes || 'Approved leave'}
              </Descriptions.Item>
            )}
          </Descriptions>

          {/* Remote-specific block */}
          {isRemote && (
            <>
              <Divider style={{ margin: '4px 0' }}>Remote activity</Divider>

              <Descriptions
                column={1}
                size="small"
                bordered
                labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
              >
                <Descriptions.Item
                  label={<><EnvironmentOutlined /> Reported work location</>}
                >
                  {r.remote_location || <Text type="secondary">Not recorded</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="GPS coordinates">
                  {hasCoord ? (
                    <Text code style={{ fontSize: 12 }}>
                      {r.clock_in_lat}, {r.clock_in_lng}
                    </Text>
                  ) : (
                    <Text type="secondary">Not captured</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><CameraOutlined /> Selfie</>}
                >
                  {r.remote_selfie ? (
                    <Image
                      src={assetUrl(r.remote_selfie)}
                      alt="Remote clock-in selfie"
                      width={160}
                      style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  ) : (
                    <Text type="secondary">Not uploaded</Text>
                  )}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <Space size={6} style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: '#065f46' }} />
                  <Text strong>Tasks completed</Text>
                </Space>
                {r.tasks_completed ? (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 13,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#0f172a',
                    }}
                  >
                    {r.tasks_completed}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Not submitted yet.
                  </Text>
                )}
              </div>
            </>
          )}

          {/* Early leave block */}
          {r.early_leave_reason && (
            <>
              <Divider style={{ margin: '4px 0' }}>Early leave</Divider>
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 10,
                  padding: '12px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#92400e',
                  wordBreak: 'break-word',
                }}
              >
                <strong>Reason:</strong> {r.early_leave_reason}
              </div>
            </>
          )}

          {/* Audit footnote */}
          <Text type="secondary" style={{ fontSize: 11 }}>
            Record ID #{r.id} · Logged on {String(r.created_at || '').slice(0, 19).replace('T', ' ')}
          </Text>
        </Space>
      </Modal>
    );
  };

  // ═══════════════ MOBILE LAYOUT ═══════════════
  if (isMobile) {
    return (
      <div
        className="mobile-history"
        style={{
          padding: '14px 10px',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          overflowX: 'hidden',
        }}
      >
        <style>{`
          .mobile-history .ant-card,
          .mobile-history .ant-card-body,
          .mobile-history .ant-picker,
          .mobile-history .ant-select,
          .mobile-history .ant-select-selector,
          .mobile-history .ant-picker-input,
          .mobile-history .ant-empty {
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          .mobile-history .ant-picker { width: 100% !important; }
          .mobile-history .ant-select { width: 100% !important; }
          .mobile-history .ant-select-selector { width: 100% !important; }
          .mobile-history .ant-picker-input > input { font-size: 12px !important; }
          .mobile-history .ant-picker-range-separator { padding: 0 4px !important; }
          .mobile-history .ant-btn { min-width: 0; }
          .mobile-history ~ .ant-picker-dropdown .ant-picker-panels { flex-direction: column !important; }
          .ant-picker-dropdown { max-width: 100vw; }
          .ant-picker-dropdown .ant-picker-panel-container { max-width: calc(100vw - 16px); }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <Title level={4} style={{ margin: 0, color: '#065f46', fontSize: 18, lineHeight: 1.2 }}>
              Attendance History
            </Title>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {filtered.length} record{filtered.length === 1 ? '' : 's'} · {range[0].format('DD MMM')} – {range[1].format('DD MMM')}
            </Text>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(range[0], range[1])}
            loading={loading}
            size="small"
            style={{ flexShrink: 0 }}
          />
        </div>

        <Card
          bordered={false}
          style={{ marginBottom: 14, borderRadius: 14, boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }}
          styles={{ body: { padding: 14 } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 12, width: '100%' }}>
            {QUICK_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="small"
                type={quickRange === opt.value ? 'primary' : 'default'}
                onClick={() => applyQuick(opt.value)}
                style={{
                  fontSize: 11, padding: 0, height: 32, borderRadius: 8,
                  width: '100%', minWidth: 0,
                  fontWeight: quickRange === opt.value ? 600 : 500,
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
              Custom Range
            </div>
            <RangePicker
              value={range}
              onChange={applyRange}
              allowClear={false}
              size="small"
              style={{ width: '100%', maxWidth: '100%' }}
              popupClassName="mobile-range-popup"
            />
          </div>

          <div>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
              Status
            </div>
            <Select
              mode="multiple"
              placeholder="Any status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              allowClear
              size="small"
              style={{ width: '100%', maxWidth: '100%' }}
              maxTagCount="responsive"
              popupClassName="mobile-select-popup"
            />
          </div>
        </Card>

        {showSummary && (
          <Card
            bordered={false}
            style={{ marginBottom: 14, borderRadius: 14, boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }}
          >
            <Statistic
              title={summaryTitle}
              value={filtered.length}
              prefix={<CalendarOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        )}

        <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Text type="secondary">Loading records...</Text>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 10px rgba(15,23,42,0.06)', textAlign: 'center' }}>
              <Empty description="No records in this range" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            filtered.map(renderMobileCard)
          )}
        </div>

        {renderDetailModal()}
      </div>
    );
  }

  // ═══════════════ DESKTOP LAYOUT ═══════════════
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            My Attendance History
          </Title>
          <Text type="secondary">
            Filter by date range or status to review your records
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => load(range[0], range[1])}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={12}>
            <Space wrap size={6}>
              <Text strong>Quick:</Text>
              <Button size="small" type={quickRange === 'today' ? 'primary' : 'default'} onClick={() => applyQuick('today')}>Today</Button>
              <Button size="small" type={quickRange === 'week' ? 'primary' : 'default'} onClick={() => applyQuick('week')}>This Week</Button>
              <Button size="small" type={quickRange === 'month' ? 'primary' : 'default'} onClick={() => applyQuick('month')}>This Month</Button>
              <Button size="small" type={quickRange === 'last30' ? 'primary' : 'default'} onClick={() => applyQuick('last30')}>Last 30 days</Button>
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space wrap>
              <Text strong>Range:</Text>
              <RangePicker value={range} onChange={applyRange} allowClear={false} />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bordered={false} className="shadow-sm mb-4">
        <Space wrap>
          <CalendarOutlined />
          <Text strong>Status:</Text>
          <Select
            mode="multiple"
            placeholder="Any status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            allowClear
            style={{ minWidth: 260 }}
            maxTagCount="responsive"
          />
          {statusFilter.length > 0 && (
            <Button type="link" size="small" onClick={() => setStatusFilter([])}>
              Clear
            </Button>
          )}
        </Space>
      </Card>

      {showSummary && (
        <Row gutter={[16, 16]} className="mb-4">
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card bordered={false} className="shadow-sm">
              <Statistic
                title={summaryTitle}
                value={filtered.length}
                prefix={<CalendarOutlined style={{ color: '#1677ff' }} />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        bordered={false}
        className="shadow-sm"
        title={
          <Space>
            <span>Records</span>
            <Badge count={filtered.length} showZero color="#065f46" />
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No records in this range' }}
        />
      </Card>

      {renderDetailModal()}
    </div>
  );
}