import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Typography, Space, DatePicker, Row, Col, Statistic,
  Select, Button, Grid, Empty, message, Badge,
} from 'antd';
import {
  ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, CalendarOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../api/axios';

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
  present: { accent: '#16a34a', bg: '#ecfdf5', text: '#065f46' },
  late: { accent: '#d97706', bg: '#fffbeb', text: '#92400e' },
  absent: { accent: '#dc2626', bg: '#fef2f2', text: '#991b1b' },
  'half-day': { accent: '#1677ff', bg: '#eff6ff', text: '#1e40af' },
  leave: { accent: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6' },
};

const statusOptions = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'half-day', label: 'Half Day' },
  { value: 'leave', label: 'Leave' },
];

const STAT_META = [
  { key: 'total',   label: 'Records', color: '#1677ff', icon: <CalendarOutlined /> },
  { key: 'present', label: 'Present', color: '#16a34a', icon: <CheckCircleOutlined /> },
  { key: 'late',    label: 'Late',    color: '#d97706', icon: <ClockCircleOutlined /> },
  { key: 'absent',  label: 'Absent',  color: '#dc2626', icon: <CloseCircleOutlined /> },
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

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/my');
      const fromStr = from.format('YYYY-MM-DD');
      const toStr = to.format('YYYY-MM-DD');
      const within = (data || []).filter((r) => {
        const d = String(r.attendance_date).slice(0, 10);
        return d >= fromStr && d <= toStr;
      });
      setRows(within);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range[0], range[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const stats = useMemo(() => {
    const total = filtered.length;
    const present = filtered.filter((r) => r.status === 'present').length;
    const late = filtered.filter((r) => r.status === 'late').length;
    const absent = filtered.filter((r) => r.status === 'absent').length;
    return { total, present, late, absent };
  }, [filtered]);

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

  // ── Mobile record card ──────────────────────────────
  const renderMobileCard = (r) => {
    const meta = STATUS_META[r.status] || { accent: '#94a3b8', bg: '#f8fafc', text: '#475569' };

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
                {r.early_leave_reason ? 'Left early' : 'Full day'}
              </div>
            </div>
          </div>
          <Tag
            color={statusColor[r.status] || 'default'}
            style={{
              margin: 0, borderRadius: 10,
              textTransform: 'capitalize', flexShrink: 0,
              fontWeight: 600, fontSize: 11,
            }}
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
          </div>
        </div>

        {r.early_leave_reason && (
          <div
            style={{
              fontSize: 11, color: '#92400e',
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 8, padding: '8px 10px',
              marginTop: 8,
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            <strong>Reason:</strong> {r.early_leave_reason}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════ MOBILE LAYOUT (Ant Design preserved, clamped) ═══════════════
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
          .mobile-history .ant-picker {
            width: 100% !important;
          }
          .mobile-history .ant-select {
            width: 100% !important;
          }
          .mobile-history .ant-select-selector {
            width: 100% !important;
          }
          .mobile-history .ant-picker-input > input {
            font-size: 12px !important;
          }
          .mobile-history .ant-picker-range-separator {
            padding: 0 4px !important;
          }
          .mobile-history .ant-btn {
            min-width: 0;
          }
          /* Stack the range-picker calendar panels on mobile */
          .mobile-history ~ .ant-picker-dropdown .ant-picker-panels {
            flex-direction: column !important;
          }
          .ant-picker-dropdown {
            max-width: 100vw;
          }
          .ant-picker-dropdown .ant-picker-panel-container {
            max-width: calc(100vw - 16px);
          }
        `}</style>

        {/* Title row */}
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

        {/* ── Enhanced filter card (Ant Design) ── */}
        <Card
          bordered={false}
          style={{
            marginBottom: 14,
            borderRadius: 14,
            boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
          }}
          styles={{ body: { padding: 14 } }}
        >
          {/* Quick period chips — Ant Buttons, wrapped in grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 6,
              marginBottom: 12,
              width: '100%',
            }}
          >
            {QUICK_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="small"
                type={quickRange === opt.value ? 'primary' : 'default'}
                onClick={() => applyQuick(opt.value)}
                style={{
                  fontSize: 11,
                  padding: 0,
                  height: 32,
                  borderRadius: 8,
                  width: '100%',
                  minWidth: 0,
                  fontWeight: quickRange === opt.value ? 600 : 500,
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Ant RangePicker — full width, clamped */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
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

          {/* Ant Select multiple — full width, clamped */}
          <div>
            <div
              style={{
                fontSize: 10,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
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

        {/* Records list */}
        <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Text type="secondary">Loading records...</Text>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 28,
                boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
                textAlign: 'center',
              }}
            >
              <Empty description="No records in this range" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            filtered.map(renderMobileCard)
          )}
        </div>
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
              <Button
                size="small"
                type={quickRange === 'today' ? 'primary' : 'default'}
                onClick={() => applyQuick('today')}
              >
                Today
              </Button>
              <Button
                size="small"
                type={quickRange === 'week' ? 'primary' : 'default'}
                onClick={() => applyQuick('week')}
              >
                This Week
              </Button>
              <Button
                size="small"
                type={quickRange === 'month' ? 'primary' : 'default'}
                onClick={() => applyQuick('month')}
              >
                This Month
              </Button>
              <Button
                size="small"
                type={quickRange === 'last30' ? 'primary' : 'default'}
                onClick={() => applyQuick('last30')}
              >
                Last 30 days
              </Button>
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

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Records"
              value={stats.total}
              prefix={<CalendarOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Present"
              value={stats.present}
              prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Late"
              value={stats.late}
              prefix={<ClockCircleOutlined style={{ color: '#d97706' }} />}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Absent"
              value={stats.absent}
              prefix={<CloseCircleOutlined style={{ color: '#dc2626' }} />}
              valueStyle={{ color: '#dc2626' }}
            />
          </Card>
        </Col>
      </Row>

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
    </div>
  );
}