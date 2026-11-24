import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Tag, Typography, Space, DatePicker, Select, Button, Grid, Empty,
  message, Image, Modal, Descriptions, Divider, ConfigProvider,
} from 'antd';
import {
  ReloadOutlined, ClockCircleOutlined, CalendarOutlined, EyeOutlined,
  EnvironmentOutlined, CameraOutlined, FileTextOutlined, HomeOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../api/axios';
import { assetUrl } from '../config';
import AttendanceRecordTag from '../components/AttendanceRecordTag';
import { attendanceClockOutLabel } from '../utils/attendanceRecordLabel';

dayjs.extend(isoWeek);

const { Text } = Typography;
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
  present: { accent: '#3f6b3a', bg: '#e6f0e3', label: 'Present' },
  late: { accent: '#b7791f', bg: '#fdf3e1', label: 'Late' },
  absent: { accent: '#b42318', bg: '#fdeceb', label: 'Absent' },
  'half-day': { accent: '#2563a8', bg: '#e8f0fa', label: 'Half day' },
  leave: { accent: '#6d4aa8', bg: '#f0eafa', label: 'Leave' },
};

const statusOptions = Object.entries(STATUS_META).map(([value, m]) => ({
  value,
  label: m.label,
}));

const QUICK_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30 days' },
];

// ═══════════ Brand styles (cocoa, matches Dashboard) ═══════════
const CSS = `
.ah-root {
  --cc-bean: #2a1810;
  --cc-roast: #4a2c1a;
  --cc-husk: #7a5236;
  --cc-gold: #d9a441;
  --cc-leaf: #3f6b3a;
  --cc-paper: #f3efea;
  --cc-line: #e6ded4;
  --cc-ink: #26170f;
  --cc-muted: #85705f;
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--cc-ink);
  background: var(--cc-paper);
  min-height: 100%;
  padding: 16px;
}
.ah-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.ah-serif { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; }

.ah-hero {
  position: relative; overflow: hidden; color: #fff;
  border-radius: 28px 28px 28px 8px; padding: 24px 26px;
  background:
    radial-gradient(700px 240px at 90% -20%, rgba(217,164,65,0.28), transparent 60%),
    linear-gradient(140deg, #2a1810 0%, #3b2214 55%, #4a2c1a 100%);
  box-shadow: 0 18px 40px -22px rgba(42,24,16,0.7);
  display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
}
.ah-hero-pods { position: absolute; right: 90px; top: -30px; opacity: 0.08; pointer-events: none; }
.ah-title { font-size: 28px; font-weight: 600; margin: 0; line-height: 1.15; position: relative; }
.ah-sub { color: rgba(255,255,255,0.72); font-size: 13px; margin-top: 4px; position: relative; }
.ah-refresh { position: relative; }

.ah-panel { background: #fff; border: 1px solid var(--cc-line); border-radius: 20px; padding: 18px 20px; }
.ah-filters { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px 24px; align-items: end; }
.ah-field-label { font-size: 12px; color: var(--cc-muted); margin-bottom: 6px; font-weight: 500; }
.ah-quick { display: flex; gap: 6px; flex-wrap: wrap; }
.ah-qbtn {
  border: 1px solid var(--cc-line); background: #faf7f3; color: var(--cc-roast);
  padding: 6px 14px; border-radius: 999px; font-size: 13px; cursor: pointer; font-weight: 500;
  transition: background 150ms, color 150ms, border-color 150ms;
}
.ah-qbtn:hover { border-color: var(--cc-husk); }
.ah-qbtn:focus-visible, .ah-stat:focus-visible { outline: 2px solid var(--cc-gold); outline-offset: 2px; }
.ah-qbtn.is-on { background: var(--cc-roast); color: #fff; border-color: var(--cc-roast); }

.ah-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.ah-stat {
  text-align: left; cursor: pointer; background: #fff; border: 1px solid var(--cc-line);
  border-radius: 16px; padding: 12px 14px; font: inherit; color: inherit;
  transition: border-color 150ms, box-shadow 150ms;
}
.ah-stat.is-on { border-color: var(--stat); box-shadow: 0 0 0 2px var(--stat) inset; }
.ah-stat-num { font-size: 26px; font-weight: 700; line-height: 1.1; color: var(--stat); }
.ah-stat-label { font-size: 12px; color: var(--cc-muted); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
.ah-stat-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--stat); }

.ah-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.ah-h { font-size: 18px; font-weight: 600; margin: 0; color: var(--cc-roast); }

.ah-rec {
  border: 1px solid var(--cc-line); border-left: 4px solid var(--accent);
  border-radius: 8px 16px 16px 8px; padding: 12px 14px; margin-bottom: 10px; background: #fff;
}
.ah-rec-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ah-rec-times { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #faf7f3; border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.ah-rec-label { font-size: 11px; color: var(--cc-muted); }
.ah-num { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 15px; margin-top: 2px; }

.ah-note-box { border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.6; word-break: break-word; }

@media (max-width: 860px) {
  .ah-filters { grid-template-columns: 1fr; }
  .ah-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .ah-root { padding: 10px; }
  .ah-hero { padding: 18px; border-radius: 22px 22px 22px 6px; }
  .ah-title { font-size: 22px; }
  .ah-panel { padding: 14px; border-radius: 16px; }
  .ah-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ah-root .ant-picker { width: 100%; }
}
.ant-picker-dropdown { max-width: 100vw; }
.ant-picker-dropdown .ant-picker-panel-container { max-width: calc(100vw - 16px); }
`;

const antTheme = {
  token: {
    colorPrimary: '#4a2c1a',
    colorSuccess: '#3f6b3a',
    colorWarning: '#b7791f',
    colorError: '#b42318',
    borderRadius: 10,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

function HeroPods() {
  return (
    <div className="ah-hero-pods" aria-hidden="true">
      <svg width="220" height="170" viewBox="0 0 320 240" fill="none">
        <g fill="#fff">
          <path d="M70 20c40 20 60 58 60 88s-20 70-60 88c-40-18-60-58-60-88S30 40 70 20z" />
          <path d="M200 60c30 15 45 44 45 66s-15 52-45 66c-30-14-45-44-45-66s15-51 45-66z" />
        </g>
      </svg>
    </div>
  );
}

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

  const counts = useMemo(() => {
    const c = {};
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const toggleStatus = (key) =>
    setStatusFilter((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const columns = [
    {
      title: 'Date',
      dataIndex: 'attendance_date',
      key: 'attendance_date',
      render: (v) => <Text strong>{String(v).slice(0, 10)}</Text>,
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
      // FIX: first argument must be `v` (the cell value), not `_`
      render: (v, r) => (
        <Space size={4}>
          {v || <Text type="secondary">{attendanceClockOutLabel(r)}</Text>}
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
        <Tag color={v === 'remote' ? 'purple' : 'blue'} style={{ borderRadius: 999 }}>
          {v === 'remote' ? 'Remote' : 'On-site'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => (
        <Tag color={statusColor[v] || 'default'} style={{ borderRadius: 999 }}>
          {STATUS_META[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'right',
      render: (_, r) => (
        <Button type="primary" ghost size="small" icon={<EyeOutlined />} onClick={() => setViewing(r)}>
          View
        </Button>
      ),
    },
  ];

  // ── Mobile card ──
  const renderMobileCard = (r) => {
    const meta = STATUS_META[r.status] || { accent: '#85705f', bg: '#f3efea', label: r.status };
    const isRemote = r.clock_in_mode === 'remote';

    return (
      <div key={r.id} className="ah-rec" style={{ '--accent': meta.accent }}>
        <div className="ah-rec-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 10, background: meta.bg, color: meta.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
              }}
            >
              <ClockCircleOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{String(r.attendance_date).slice(0, 10)}</div>
              <div style={{ fontSize: 12, color: '#85705f' }}>
                {r.status === 'leave'
                  ? 'Approved leave'
                  : `${isRemote ? 'Remote' : 'On-site'}, ${r.early_leave_reason ? 'left early' : 'full day'}`}
              </div>
            </div>
          </div>
          <Tag color={statusColor[r.status] || 'default'} style={{ margin: 0, borderRadius: 999, flexShrink: 0 }}>
            {meta.label}
          </Tag>
        </div>

        <div className="ah-rec-times">
          <div>
            <div className="ah-rec-label">Clock in</div>
            <div className="ah-num" style={{ color: '#2f5230' }}>{r.clock_in || '—'}</div>
          </div>
          <div>
            <div className="ah-rec-label">Clock out</div>
            <div className="ah-num" style={{ color: r.clock_out ? '#4a2c1a' : '#b3a595' }}>
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
          style={{ marginTop: 10 }}
        >
          View details
        </Button>
      </div>
    );
  };

  // ── Detail modal ──
  const renderDetailModal = () => {
    if (!viewing) return null;
    const r = viewing;
    const meta = STATUS_META[r.status] || { label: r.status, accent: '#85705f' };
    const isRemote = r.clock_in_mode === 'remote';
    const hasCoord = r.clock_in_lat != null && r.clock_in_lng != null;

    const items = [
      {
        key: 'in',
        label: 'Clock in',
        children: <Text strong style={{ color: '#2f5230' }}>{r.clock_in || '—'}</Text>,
      },
      {
        key: 'out',
        label: 'Clock out',
        children: (
          <Text strong style={{ color: r.clock_out ? '#4a2c1a' : '#b3a595' }}>
            {attendanceClockOutLabel(r)}
          </Text>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        children: (
          <Tag color={statusColor[r.status] || 'default'} style={{ borderRadius: 999 }}>
            {meta.label}
          </Tag>
        ),
      },
      {
        key: 'mode',
        label: 'Mode',
        children: (
          <Tag color={r.status === 'leave' || isRemote ? 'purple' : 'blue'} style={{ borderRadius: 999 }}>
            {r.status === 'leave' ? 'Leave' : isRemote ? 'Remote' : 'On-site'}
          </Tag>
        ),
      },
      {
        key: 'record',
        label: 'Record',
        span: 2,
        children: (
          <>
            <AttendanceRecordTag record={r} />
            {!r.admin_resolved && !r.auto_clocked_out && !r.needs_review && 'Employee clock-out'}
          </>
        ),
      },
    ];

    if (r.admin_resolved) {
      items.push(
        {
          key: 'reviewed',
          label: 'Reviewed at',
          span: 2,
          children: r.admin_resolved_at
            ? dayjs(r.admin_resolved_at).format('DD MMM YYYY, HH:mm')
            : 'Not recorded',
        },
        {
          key: 'admin-reason',
          label: 'Admin reason',
          span: 2,
          children: r.admin_resolved_reason || <Text type="secondary">Not provided</Text>,
        }
      );
    }
    if (r.needs_review) {
      items.push({
        key: 'review',
        label: 'Review note',
        span: 2,
        children: r.review_note || 'Presence could not be verified at closing',
      });
    }
    if (r.auto_clocked_out) {
      items.push({
        key: 'auto',
        label: 'Auto clock-out',
        span: 2,
        children: r.auto_clock_out_reason || 'Departure was detected after closing',
      });
    }
    if (r.status === 'leave') {
      items.push({
        key: 'leave-note',
        label: 'Note',
        span: 2,
        children: r.notes || 'Approved leave',
      });
    }

    const labelStyle = { width: 130, background: '#faf7f3', fontWeight: 600 };

    return (
      <Modal
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 640}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        title={
          <Space>
            <span className="ah-serif" style={{ fontSize: 17, fontWeight: 600 }}>Attendance details</span>
            <Tag color={statusColor[r.status] || 'default'} style={{ borderRadius: 999 }}>
              {meta.label}
            </Tag>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 14,
              background: isRemote ? '#f0eafa' : '#f5f9f3',
              border: `1px solid ${isRemote ? '#ddd0f2' : '#cfe0c9'}`,
            }}
          >
            {r.status === 'leave' ? (
              <CalendarOutlined style={{ fontSize: 20, color: '#6d4aa8' }} />
            ) : isRemote ? (
              <HomeOutlined style={{ fontSize: 20, color: '#6d4aa8' }} />
            ) : (
              <WifiOutlined style={{ fontSize: 20, color: '#3f6b3a' }} />
            )}
            <div>
              <div style={{ fontWeight: 700 }}>
                {r.status === 'leave' ? 'Approved leave' : isRemote ? 'Remote work day' : 'On-site work day'}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {String(r.attendance_date).slice(0, 10)}
              </Text>
            </div>
          </div>

          <Descriptions
            column={2}
            size="small"
            bordered
            items={items}
            styles={{ label: labelStyle }}
          />

          {isRemote && (
            <>
              <Divider style={{ margin: '4px 0' }}>Remote activity</Divider>

              <Descriptions
                column={1}
                size="small"
                bordered
                styles={{ label: { ...labelStyle, width: 160 } }}
                items={[
                  {
                    key: 'loc',
                    label: <><EnvironmentOutlined /> Work location</>,
                    children: r.remote_location || <Text type="secondary">Not recorded</Text>,
                  },
                  {
                    key: 'gps',
                    label: 'GPS coordinates',
                    children: hasCoord ? (
                      <Text code style={{ fontSize: 12 }}>{r.clock_in_lat}, {r.clock_in_lng}</Text>
                    ) : (
                      <Text type="secondary">Not captured</Text>
                    ),
                  },
                  {
                    key: 'selfie',
                    label: <><CameraOutlined /> Selfie</>,
                    children: r.remote_selfie ? (
                      <Image
                        src={assetUrl(r.remote_selfie)}
                        alt="Remote clock-in selfie"
                        width={160}
                        style={{ borderRadius: 10, border: '1px solid #e6ded4' }}
                      />
                    ) : (
                      <Text type="secondary">Not uploaded</Text>
                    ),
                  },
                ]}
              />

              <div>
                <Space size={6} style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: '#4a2c1a' }} />
                  <Text strong>Tasks completed</Text>
                </Space>
                {r.tasks_completed ? (
                  <div
                    className="ah-note-box"
                    style={{
                      background: '#faf7f3', border: '1px solid #e6ded4',
                      whiteSpace: 'pre-wrap', lineHeight: 1.7,
                    }}
                  >
                    {r.tasks_completed}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>Not submitted yet.</Text>
                )}
              </div>
            </>
          )}

          {r.early_leave_reason && (
            <>
              <Divider style={{ margin: '4px 0' }}>Early leave</Divider>
              <div
                className="ah-note-box"
                style={{ background: '#fdf3e1', border: '1px solid #f1dcae', color: '#7a4a12' }}
              >
                <strong>Reason:</strong> {r.early_leave_reason}
              </div>
            </>
          )}

          <Text type="secondary" style={{ fontSize: 11 }}>
            Record ID #{r.id}, logged on {String(r.created_at || '').slice(0, 19).replace('T', ' ')}
          </Text>
        </Space>
      </Modal>
    );
  };

  const rangeLabel = `${range[0].format('DD MMM')} to ${range[1].format('DD MMM YYYY')}`;

  return (
    <ConfigProvider theme={antTheme}>
      <div className="ah-root">
        <style>{CSS}</style>

        <div className="ah-wrap">
          {/* Header */}
          <header className="ah-hero">
            <HeroPods />
            <div>
              <h1 className="ah-title ah-serif">My attendance</h1>
              <div className="ah-sub">
                {rows.length} record{rows.length === 1 ? '' : 's'} from {rangeLabel}
              </div>
            </div>
            <Button
              className="ah-refresh"
              icon={<ReloadOutlined />}
              onClick={() => load(range[0], range[1])}
              loading={loading}
            >
              Refresh
            </Button>
          </header>

          {/* Filters */}
          <section className="ah-panel ah-filters">
            <div>
              <div className="ah-field-label">Period</div>
              <div className="ah-quick">
                {QUICK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`ah-qbtn${quickRange === opt.value ? ' is-on' : ''}`}
                    onClick={() => applyQuick(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="ah-field-label">Custom dates</div>
              <RangePicker
                value={range}
                onChange={applyRange}
                allowClear={false}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="ah-field-label">Status</div>
              <Select
                mode="multiple"
                placeholder="Any status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                allowClear
                style={{ width: '100%', maxWidth: isMobile ? '100%' : 420 }}
                maxTagCount="responsive"
              />
            </div>
          </section>

          {/* Status counts (tap to filter) */}
          <section className="ah-stats" aria-label="Records by status">
            {Object.entries(STATUS_META).map(([key, m]) => (
              <button
                key={key}
                type="button"
                className={`ah-stat${statusFilter.includes(key) ? ' is-on' : ''}`}
                style={{ '--stat': m.accent }}
                onClick={() => toggleStatus(key)}
                aria-pressed={statusFilter.includes(key)}
              >
                <div className="ah-stat-num ah-serif">{counts[key] || 0}</div>
                <div className="ah-stat-label">
                  <span className="ah-stat-dot" />
                  {m.label}
                </div>
              </button>
            ))}
          </section>

          {/* Records */}
          <section className="ah-panel">
            <div className="ah-panel-head">
              <h2 className="ah-h ah-serif">Records</h2>
              <Space>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Showing {filtered.length}
                </Text>
                {statusFilter.length > 0 && (
                  <Button type="link" size="small" onClick={() => setStatusFilter([])} style={{ padding: 0 }}>
                    Clear filter
                  </Button>
                )}
              </Space>
            </div>

            {isMobile ? (
              loading ? (
                <div style={{ textAlign: 'center', padding: 28 }}>
                  <Text type="secondary">Loading records…</Text>
                </div>
              ) : filtered.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No records in this range. Try a wider period."
                />
              ) : (
                filtered.map(renderMobileCard)
              )
            ) : (
              <Table
                rowKey="id"
                columns={columns}
                dataSource={filtered}
                loading={loading}
                pagination={{ pageSize: 12, showSizeChanger: true }}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: 'No records in this range. Try a wider period.' }}
              />
            )}
          </section>
        </div>

        {renderDetailModal()}
      </div>
    </ConfigProvider>
  );
}