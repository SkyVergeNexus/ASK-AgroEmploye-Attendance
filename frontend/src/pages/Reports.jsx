import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, DatePicker, Select, Input,
  Row, Col, message, Grid, Badge, Tooltip, Image,
  Modal, Descriptions, Divider, Segmented, Avatar,
} from 'antd';
import {
  FileExcelOutlined, FilePdfOutlined, ReloadOutlined, SearchOutlined,
  FilterOutlined, TeamOutlined, CalendarOutlined, UserOutlined,
  EyeOutlined, EnvironmentOutlined, CameraOutlined, FileTextOutlined,
  HomeOutlined, WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';
import { assetUrl } from '../config';
import AttendanceRecordTag from '../components/AttendanceRecordTag';
import { attendanceClockOutLabel, attendanceRecordLabel } from '../utils/attendanceRecordLabel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const STATUS_META = {
  present: { accent: '#16a34a', bg: '#ecfdf5', label: 'Present', color: 'green' },
  late: { accent: '#d97706', bg: '#fffbeb', label: 'Late', color: 'gold' },
  absent: { accent: '#dc2626', bg: '#fef2f2', label: 'Absent', color: 'red' },
  leave: { accent: '#7c3aed', bg: '#f5f3ff', label: 'Leave', color: 'purple' },
};

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
];

const GUEST_STATUS_META = {
  assigned: { color: 'blue', label: 'Assigned' },
  accepted: { color: 'cyan', label: 'Accepted' },
  completed: { color: 'green', label: 'Completed' },
  cancelled: { color: 'red', label: 'Cancelled' },
};

// ── Inline stat pill ────────────────────────────────────────
function StatPill({ label, value, color = '#0f172a' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{
        fontSize: 15, fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
      }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PDF generation
// ─────────────────────────────────────────────────────────────
function buildPdfHtml({ title, subtitle, columns, rows, summary }) {
  const esc = (v) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = columns.map((c) => `<th>${esc(c.title)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(c.render(r))}</td>`).join('')}</tr>`)
    .join('');
  const summaryHtml = summary
    ? `<div class="summary">${summary.map((s) => `<span><strong>${esc(s.label)}:</strong> ${esc(s.value)}</span>`).join('')}</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #065f46; }
  .subtitle { color: #64748b; font-size: 11px; margin-bottom: 14px; }
  .summary { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 14px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .summary span { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #065f46; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
  tr:nth-child(even) td { background: #f8fafc; }
  footer { margin-top: 18px; font-size: 10px; color: #94a3b8; text-align: center; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="subtitle">${esc(subtitle)}</div>
  ${summaryHtml}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <footer>Generated ${esc(new Date().toLocaleString())}</footer>
</body></html>`;
}

function openPdf(html) {
  const win = window.open('', '_blank');
  if (!win) { message.error('Please allow popups to download PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ─────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────
export default function Reports() {
  const [mode, setMode] = useState('attendance');
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs().endOf('day')]);

  const [attendanceRows, setAttendanceRows] = useState([]);
  const [guestRows, setGuestRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState([]);
  const [genderFilter, setGenderFilter] = useState([]);
  const [guestServiceFilter, setGuestServiceFilter] = useState([]);

  const [viewingAttendance, setViewingAttendance] = useState(null);
  const [viewingGuest, setViewingGuest] = useState(null);
  const [nearbyLocality, setNearbyLocality] = useState(null);
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState('');

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const loadEmployees = useCallback(async () => {
    try { const { data } = await api.get('/employees'); setEmployees(data); } catch {}
  }, []);
  const loadDepartments = useCallback(async () => {
    try { const { data } = await api.get('/departments'); setDepartments(data); } catch {}
  }, []);
  const loadServices = useCallback(async () => {
    try { const { data } = await api.get('/services'); setServices(data); } catch {}
  }, []);

  const loadAttendance = useCallback(async (from, to, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/attendance/all', {
        params: { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') },
      });
      setAttendanceRows(data);
      setViewingAttendance((current) => {
        if (!current) return current;
        const latest = data.find((record) => record.id === current.id);
        if (!latest) return current;
        const changed = [
          'clock_out',
          'status',
          'auto_clocked_out',
          'auto_clock_out_reason',
          'needs_review',
          'review_note',
          'after_close_tracking',
          'admin_resolved',
          'admin_resolved_by',
          'admin_resolved_at',
          'admin_resolved_reason',
        ].some((key) => latest[key] !== current[key]);
        return changed ? { ...current, ...latest } : current;
      });
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadGuests = useCallback(async (from, to, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/guests', {
        params: { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') },
      });
      setGuestRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load guests');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const reload = useCallback((silent = false) => {
    if (mode === 'attendance') loadAttendance(range[0], range[1], silent);
    else loadGuests(range[0], range[1], silent);
  }, [mode, range, loadAttendance, loadGuests]);

  useEffect(() => {
    loadEmployees(); loadDepartments(); loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(() => reload(true), 60 * 1000);
    return () => clearInterval(interval);
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setNearbyLocality(null);
    setLocationLookupError('');
    const v = viewingAttendance;
    if (!v || v.clock_in_lat == null || v.clock_in_lng == null) {
      setLocationLookupLoading(false);
      return () => { cancelled = true; };
    }
    setLocationLookupLoading(true);
    api.post('/attendance/reverse-geocode', { lat: v.clock_in_lat, lng: v.clock_in_lng })
      .then(({ data }) => { if (!cancelled) setNearbyLocality(data); })
      .catch((error) => {
        if (!cancelled) setLocationLookupError(
          error.response?.data?.message || 'Unable to find the nearest locality.'
        );
      })
      .finally(() => { if (!cancelled) setLocationLookupLoading(false); });
    return () => { cancelled = true; };
  }, [viewingAttendance]);

  const empMeta = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = { gender: e.gender || '', department_name: e.department_name || '' };
    });
    return map;
  }, [employees]);

  const enrichedAttendance = useMemo(
    () => attendanceRows.map((r) => {
      const meta = empMeta[r.employee_id] || {};
      return {
        ...r,
        gender: meta.gender || '',
        department_name: r.department || meta.department_name || '',
      };
    }),
    [attendanceRows, empMeta]
  );

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedAttendance.filter((r) => {
      if (q) {
        const hay = `${r.full_name || ''} ${r.employee_code || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (employeeFilter.length && !employeeFilter.includes(r.employee_id)) return false;
      if (departmentFilter.length && !departmentFilter.includes(r.department_name)) return false;
      if (genderFilter.length && !genderFilter.includes(r.gender)) return false;
      return true;
    });
  }, [enrichedAttendance, search, statusFilter, employeeFilter, departmentFilter, genderFilter]);

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guestRows.filter((g) => {
      if (q) {
        const hay = `${g.full_name || ''} ${g.phone || ''} ${g.service_name || ''} ${g.assigned_employee_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (guestServiceFilter.length && !guestServiceFilter.includes(g.service_name)) return false;
      return true;
    });
  }, [guestRows, search, guestServiceFilter]);

  const attendanceStats = useMemo(() => {
    const total = filteredAttendance.length;
    if (!total) return { total: 0, present: 0, late: 0, absent: 0, leave: 0, attendancePct: 0, absentPct: 0, latePct: 0 };
    const present = filteredAttendance.filter((r) => r.status === 'present').length;
    const late = filteredAttendance.filter((r) => r.status === 'late').length;
    const absent = filteredAttendance.filter((r) => r.status === 'absent').length;
    const leave = filteredAttendance.filter((r) => r.status === 'leave').length;
    const presentLike = present + late;
    return {
      total, present, late, absent, leave,
      attendancePct: Math.round((presentLike / total) * 1000) / 10,
      absentPct: Math.round((absent / total) * 1000) / 10,
      latePct: Math.round((late / total) * 1000) / 10,
    };
  }, [filteredAttendance]);

  const singleEmployeeStats = useMemo(() => {
    if (employeeFilter.length !== 1) return null;
    const empId = employeeFilter[0];
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return null;
    const rows = filteredAttendance.filter((r) => r.employee_id === empId);
    const total = rows.length;
    if (!total) return { employee: emp, total: 0, attendancePct: 0, absentPct: 0, latePct: 0 };
    const presentLike = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    return {
      employee: emp, total,
      attendancePct: Math.round((presentLike / total) * 1000) / 10,
      absentPct: Math.round((absent / total) * 1000) / 10,
      latePct: Math.round((late / total) * 1000) / 10,
    };
  }, [employeeFilter, filteredAttendance, employees]);

  const clearFilters = () => {
    setSearch(''); setStatusFilter([]); setEmployeeFilter([]);
    setDepartmentFilter([]); setGenderFilter([]); setGuestServiceFilter([]);
  };

  const exportCSV = () => {
    const headers = [
      'Date', 'Code', 'Name', 'Gender', 'Department', 'In', 'Out', 'Status',
      'Mode', 'Record', 'Admin decision', 'Reviewed at', 'Admin reason',
      'Auto clock-out reason', 'Note',
    ];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filteredAttendance.map((r) => [
      String(r.attendance_date).slice(0, 10),
      r.employee_code, r.full_name, r.gender || '', r.department_name || '',
      r.clock_in || '', attendanceClockOutLabel(r), r.status, r.clock_in_mode || 'onsite',
      attendanceRecordLabel(r),
      r.admin_resolved ? (r.status === 'absent' ? 'Absent' : 'Present') : '',
      r.admin_resolved_at ? dayjs(r.admin_resolved_at).format('YYYY-MM-DD HH:mm:ss') : '',
      r.admin_resolved_reason || '',
      r.auto_clocked_out ? r.auto_clock_out_reason || 'Departure detected' : '',
      r.notes || '',
    ].map(cell).join(','));
    const csv = [headers.join(',')].concat(rows).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${range[0].format('YYYY-MM-DD')}_${range[1].format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const subtitle = `${range[0].format('DD MMM YYYY')} → ${range[1].format('DD MMM YYYY')}`;

    if (mode === 'attendance') {
      openPdf(buildPdfHtml({
        title: 'Attendance Report',
        subtitle,
        columns: [
          { title: 'Date', render: (r) => String(r.attendance_date).slice(0, 10) },
          { title: 'Employee', render: (r) => `${r.full_name} (${r.employee_code})` },
          { title: 'Department', render: (r) => r.department_name || '—' },
          { title: 'In', render: (r) => r.clock_in || '—' },
          { title: 'Out', render: attendanceClockOutLabel },
          { title: 'Status', render: (r) => STATUS_META[r.status]?.label || r.status },
          { title: 'Mode', render: (r) => r.clock_in_mode === 'remote' ? 'Remote' : 'On-site' },
          { title: 'Record', render: attendanceRecordLabel },
          { title: 'Reviewed at', render: (r) => r.admin_resolved_at ? dayjs(r.admin_resolved_at).format('DD MMM YYYY HH:mm') : '' },
          { title: 'Admin reason', render: (r) => r.admin_resolved_reason || '' },
        ],
        rows: filteredAttendance,
        summary: [
          { label: 'Total', value: attendanceStats.total },
          { label: 'Present', value: attendanceStats.present },
          { label: 'Late', value: attendanceStats.late },
          { label: 'Absent', value: attendanceStats.absent },
          { label: 'Attendance %', value: `${attendanceStats.attendancePct}%` },
          { label: 'Absent %', value: `${attendanceStats.absentPct}%` },
        ],
      }));
    } else {
      openPdf(buildPdfHtml({
        title: 'Guest Report',
        subtitle,
        columns: [
          { title: 'Date', render: (g) => dayjs(g.created_at).format('DD MMM YYYY HH:mm') },
          { title: 'Guest', render: (g) => g.full_name },
          { title: 'Phone', render: (g) => g.phone || '—' },
          { title: 'Service', render: (g) => g.service_name || '—' },
          { title: 'Purpose', render: (g) => g.purpose || '—' },
          { title: 'Assigned To', render: (g) => g.assigned_employee_name || 'Unassigned' },
          { title: 'Status', render: (g) => GUEST_STATUS_META[g.assignment_status]?.label || g.assignment_status || '—' },
        ],
        rows: filteredGuests,
        summary: [
          { label: 'Total guests', value: filteredGuests.length },
          { label: 'Assigned', value: filteredGuests.filter((g) => g.assigned_employee_id).length },
          { label: 'Unassigned', value: filteredGuests.filter((g) => !g.assigned_employee_id).length },
        ],
      }));
    }
  };

  const attendanceColumns = [
    {
      title: 'Date', dataIndex: 'attendance_date', key: 'attendance_date',
      sorter: (a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)),
      render: (v) => String(v).slice(0, 10), defaultSortOrder: 'descend',
    },
    {
      title: 'Employee', dataIndex: 'full_name', key: 'full_name',
      render: (text, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{text}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{row.employee_code}</div>
        </div>
      ),
    },
    { title: 'Department', dataIndex: 'department_name', key: 'department_name', render: (v) => v || <Text type="secondary">—</Text> },
    {
      title: 'In / Out', key: 'times',
      render: (_, r) => (
        <Space size={4} wrap>
          <Text strong style={{ color: '#16a34a' }}>{r.clock_in || '—'}</Text>
          <Text type="secondary">→</Text>
          <Text strong style={{ color: r.clock_out ? '#d97706' : '#94a3b8' }}>{attendanceClockOutLabel(r)}</Text>
          <AttendanceRecordTag record={r} />
        </Space>
      ),
    },
    {
      title: 'Mode', dataIndex: 'clock_in_mode', key: 'clock_in_mode',
      render: (v) => <Tag color={v === 'remote' ? 'purple' : 'blue'}>{v === 'remote' ? 'Remote' : 'On-site'}</Tag>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v) => <Tag color={STATUS_META[v]?.color || 'default'}>{STATUS_META[v]?.label || v}</Tag>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'right',
      render: (_, r) => (
        <Button type="primary" ghost size="small" icon={<EyeOutlined />}
          onClick={() => setViewingAttendance(r)}>View</Button>
      ),
    },
  ];

  const guestColumns = [
    {
      title: 'Date & Time', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v) => dayjs(v).format('DD MMM YYYY, HH:mm'),
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Guest', dataIndex: 'full_name', key: 'full_name',
      render: (text, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{text}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{row.phone}</div>
        </div>
      ),
    },
    {
      title: 'Service', dataIndex: 'service_name', key: 'service_name',
      render: (v, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v || '—'}</div>
          {v === 'Other' && row.purpose && (
            <div style={{ fontSize: 11, color: '#64748b' }}>{row.purpose}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Assigned To', key: 'assigned',
      render: (_, row) =>
        row.assigned_employee_id ? (
          <div>
            <div style={{ fontWeight: 500, fontSize: 12 }}>
              {row.assigned_employee_name || `#${row.assigned_employee_id}`}
            </div>
            <Tag color={GUEST_STATUS_META[row.assignment_status]?.color || 'default'} style={{ fontSize: 10 }}>
              {GUEST_STATUS_META[row.assignment_status]?.label || row.assignment_status}
            </Tag>
          </div>
        ) : <Tag color="default">Unassigned</Tag>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'right',
      render: (_, row) => (
        <Button type="primary" ghost size="small" icon={<EyeOutlined />}
          onClick={() => setViewingGuest(row)}>View</Button>
      ),
    },
  ];

  const renderAttendanceModal = () => {
    if (!viewingAttendance) return null;
    const r = viewingAttendance;
    const meta = STATUS_META[r.status] || { label: r.status };
    const isRemote = r.clock_in_mode === 'remote';
    const hasCoord = r.clock_in_lat != null && r.clock_in_lng != null;

    return (
      <Modal
        open={!!viewingAttendance}
        onCancel={() => setViewingAttendance(null)}
        footer={<Button onClick={() => setViewingAttendance(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 640}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        title={
          <Space>
            <span>{r.full_name || 'Attendance record'}</span>
            <Tag color={STATUS_META[r.status]?.color || 'default'}>{meta.label}</Tag>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card size="small" bordered={false}
            style={{
              background: isRemote ? '#faf5ff' : '#eff6ff',
              border: `1px solid ${isRemote ? '#e9d5ff' : '#bfdbfe'}`,
              borderRadius: 12,
            }}>
            <Space size={10} align="center">
              {r.status === 'leave'
                ? <CalendarOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
                : isRemote
                  ? <HomeOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
                  : <WifiOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {r.status === 'leave' ? 'Approved leave' : isRemote ? 'Remote work day' : 'On-site work day'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.employee_code} · {String(r.attendance_date).slice(0, 10)}
                </Text>
              </div>
            </Space>
          </Card>

          <Descriptions column={2} size="small" bordered
            labelStyle={{ width: 120, background: '#f8fafc', fontWeight: 600 }}>
            <Descriptions.Item label="Clock in">
              <Text strong style={{ color: '#16a34a' }}>{r.clock_in || '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Clock out">
              <Text strong style={{ color: r.clock_out ? '#d97706' : '#94a3b8' }}>{attendanceClockOutLabel(r)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_META[r.status]?.color || 'default'}>{meta.label}</Tag>
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
            {r.admin_resolved && (
              <>
                <Descriptions.Item label="Reviewed at">
                  {r.admin_resolved_at
                    ? dayjs(r.admin_resolved_at).format('DD MMM YYYY, HH:mm')
                    : 'Not recorded'}
                </Descriptions.Item>
                <Descriptions.Item label="Admin reason" span={2}>
                  {r.admin_resolved_reason || <Text type="secondary">Not provided</Text>}
                </Descriptions.Item>
              </>
            )}
            {r.needs_review && (
              <Descriptions.Item label="Review note" span={2}>
                {r.review_note || 'Presence could not be verified at closing'}
              </Descriptions.Item>
            )}
            {r.auto_clocked_out && (
              <Descriptions.Item label="Auto clock-out detail" span={2}>
                {r.auto_clock_out_reason || 'Departure was detected after closing'}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Department" span={2}>
              {r.department_name || <Text type="secondary">Not assigned</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Gender">
              {r.gender ? <Tag>{r.gender}</Tag> : <Text type="secondary">—</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Employee code"><Text code>{r.employee_code}</Text></Descriptions.Item>
          </Descriptions>

          {isRemote && (
            <>
              <Divider style={{ margin: '4px 0' }}>Remote activity</Divider>
              <Descriptions column={1} size="small" bordered
                labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}>
                <Descriptions.Item label={<><EnvironmentOutlined /> Work location</>}>
                  {r.remote_location || <Text type="secondary">Not recorded</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="GPS coordinates">
                  {hasCoord ? <Text code style={{ fontSize: 12 }}>{r.clock_in_lat}, {r.clock_in_lng}</Text>
                    : <Text type="secondary">Not captured</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Nearby locality">
                  {!hasCoord ? <Text type="secondary">GPS not captured</Text>
                    : locationLookupLoading ? <Text type="secondary">Finding…</Text>
                    : locationLookupError ? <Text type="danger">{locationLookupError}</Text>
                    : nearbyLocality ? (
                      <Space direction="vertical" size={0}>
                        <Text strong>{nearbyLocality.name}, {nearbyLocality.countryCode}</Text>
                        <Text type="secondary">Nearest mapped place · {nearbyLocality.distanceKm.toFixed(1)} km away</Text>
                      </Space>
                    ) : <Text type="secondary">No nearby locality found</Text>}
                </Descriptions.Item>
                <Descriptions.Item label={<><CameraOutlined /> Selfie</>}>
                  {r.remote_selfie ? (
                    <Image src={assetUrl(r.remote_selfie)} alt="Selfie"
                      width={160} style={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  ) : <Text type="secondary">Not uploaded</Text>}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <Space size={6} style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: '#065f46' }} />
                  <Text strong>Tasks completed</Text>
                </Space>
                {r.tasks_completed ? (
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '12px 14px', fontSize: 13,
                    lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{r.tasks_completed}</div>
                ) : <Text type="secondary" style={{ fontSize: 13 }}>Not submitted yet.</Text>}
              </div>
            </>
          )}

          {r.early_leave_reason && (
            <>
              <Divider style={{ margin: '4px 0' }}>Early leave</Divider>
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 10, padding: '12px 14px',
                fontSize: 13, lineHeight: 1.6, color: '#92400e',
              }}>
                <strong>Reason:</strong> {r.early_leave_reason}
              </div>
            </>
          )}

          <Text type="secondary" style={{ fontSize: 11 }}>
            Record #{r.id} · Logged on {String(r.created_at || '').slice(0, 19).replace('T', ' ')}
          </Text>
        </Space>
      </Modal>
    );
  };

  const renderGuestModal = () => {
    if (!viewingGuest) return null;
    const g = viewingGuest;
    return (
      <Modal
        open={!!viewingGuest}
        onCancel={() => setViewingGuest(null)}
        footer={<Button onClick={() => setViewingGuest(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        title={
          <Space>
            <UserOutlined />
            <span>{g.full_name}</span>
            {g.assignment_status && (
              <Tag color={GUEST_STATUS_META[g.assignment_status]?.color || 'default'}>
                {GUEST_STATUS_META[g.assignment_status]?.label || g.assignment_status}
              </Tag>
            )}
          </Space>
        }
      >
        <Descriptions column={1} size="small" bordered
          labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}>
          <Descriptions.Item label="Full name">{g.full_name}</Descriptions.Item>
          <Descriptions.Item label="Phone">{g.phone}</Descriptions.Item>
          <Descriptions.Item label="Gender">{g.gender || '—'}</Descriptions.Item>
          <Descriptions.Item label="Service">{g.service_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Purpose">{g.purpose || '—'}</Descriptions.Item>
          <Descriptions.Item label="Notes">
            {g.notes ? <div style={{ whiteSpace: 'pre-wrap' }}>{g.notes}</div>
              : <Text type="secondary">None</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Assigned to">
            {g.assigned_employee_name ? (
              <Space>
                {g.assigned_employee_picture && (
                  <Avatar size={24} src={assetUrl(g.assigned_employee_picture)} />
                )}
                <span>{g.assigned_employee_name}</span>
                {g.assigned_employee_code && (
                  <Text type="secondary">({g.assigned_employee_code})</Text>
                )}
              </Space>
            ) : <Tag color="default">Unassigned</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Signed in">
            {dayjs(g.created_at).format('dddd, DD MMM YYYY · HH:mm')}
          </Descriptions.Item>
          {g.completed_at && (
            <Descriptions.Item label="Completed">
              {dayjs(g.completed_at).format('DD MMM YYYY · HH:mm')}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Modal>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>Reports</Title>
          <Text type="secondary">Attendance and guest analytics for any period</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          <Button
            icon={<FileExcelOutlined />} onClick={exportCSV}
            disabled={mode !== 'attendance' || !filteredAttendance.length}
          >
            {!isMobile && 'CSV'}
          </Button>
          <Button
            type="primary" icon={<FilePdfOutlined />} onClick={exportPdf}
            disabled={mode === 'attendance' ? !filteredAttendance.length : !filteredGuests.length}
          >
            {!isMobile ? 'Export PDF' : 'PDF'}
          </Button>
        </Space>
      </div>

      {/* Mode + Range */}
      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={12}>
            <Segmented
              block={isMobile}
              value={mode}
              onChange={(v) => { setMode(v); clearFilters(); }}
              options={[
                { label: 'Attendance', value: 'attendance', icon: <TeamOutlined /> },
                { label: 'Guests', value: 'guests', icon: <UserOutlined /> },
              ]}
            />
          </Col>
          <Col xs={24} md={12}>
            <Space wrap style={{ justifyContent: isMobile ? 'flex-start' : 'flex-end', width: '100%' }}>
              <Text strong>Period:</Text>
              <RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange(v)} allowClear={false} style={{ minWidth: 260 }} />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Filters */}
      <Card
        title={<Space><FilterOutlined /><span>Filters</span></Space>}
        bordered={false} className="shadow-sm mb-4"
        extra={<Button type="link" onClick={clearFilters}>Clear all</Button>}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={6}>
            <Input
              placeholder={mode === 'attendance' ? 'Search name or code' : 'Search guest, phone, service'}
              prefix={<SearchOutlined />} value={search}
              onChange={(e) => setSearch(e.target.value)} allowClear
            />
          </Col>

          {mode === 'attendance' ? (
            <>
              <Col xs={24} md={12} lg={6}>
                <Select mode="multiple" placeholder="Status" value={statusFilter} onChange={setStatusFilter}
                  options={STATUS_OPTIONS} allowClear maxTagCount="responsive" style={{ width: '100%' }} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Select mode="multiple" placeholder="Department" value={departmentFilter} onChange={setDepartmentFilter}
                  allowClear maxTagCount="responsive" style={{ width: '100%' }}
                  options={departments.map((d) => ({ value: d.name, label: d.name }))} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Select mode="multiple" placeholder="Gender" value={genderFilter} onChange={setGenderFilter}
                  allowClear maxTagCount="responsive" style={{ width: '100%' }}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Select mode="multiple" placeholder="Employee" value={employeeFilter} onChange={setEmployeeFilter}
                  allowClear maxTagCount="responsive" showSearch optionFilterProp="label" style={{ width: '100%' }}
                  options={employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
              </Col>
            </>
          ) : (
            <Col xs={24} md={12} lg={8}>
              <Select mode="multiple" placeholder="Service" value={guestServiceFilter} onChange={setGuestServiceFilter}
                allowClear maxTagCount="responsive" style={{ width: '100%' }}
                options={services.map((s) => ({ value: s.name, label: s.name }))} />
            </Col>
          )}
        </Row>
      </Card>

      {/* ── Summary strip (replaces KPI cards) ── */}
      {mode === 'attendance' && attendanceStats.total > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
          padding: '10px 14px', background: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16,
        }}>
          <StatPill label="Records" value={attendanceStats.total} color="#065f46" />
          <StatPill label="Present" value={attendanceStats.present} color="#16a34a" />
          <StatPill label="Late" value={attendanceStats.late} color="#d97706" />
          <StatPill label="Absent" value={attendanceStats.absent} color="#dc2626" />
          <Divider type="vertical" style={{ height: 24, margin: '0 4px' }} />
          <StatPill label="Attendance" value={`${attendanceStats.attendancePct}%`} color="#16a34a" />
          <StatPill label="Absent rate" value={`${attendanceStats.absentPct}%`} color="#dc2626" />
        </div>
      )}

      {singleEmployeeStats && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
          padding: '10px 14px', background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 16,
        }}>
          <Avatar size={28} style={{ background: '#065f46', flexShrink: 0 }}>
            {(singleEmployeeStats.employee.full_name || '?')[0]}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              {singleEmployeeStats.employee.full_name}
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                {singleEmployeeStats.employee.employee_code}
              </Text>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {singleEmployeeStats.total} record{singleEmployeeStats.total === 1 ? '' : 's'} in range
            </div>
          </div>
          <Divider type="vertical" style={{ height: 28, margin: '0 6px' }} />
          <StatPill label="Attendance" value={`${singleEmployeeStats.attendancePct}%`} color="#16a34a" />
          <StatPill label="Absent" value={`${singleEmployeeStats.absentPct}%`} color="#dc2626" />
          <StatPill label="Late" value={`${singleEmployeeStats.latePct}%`} color="#d97706" />
        </div>
      )}

      {mode === 'guests' && filteredGuests.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
          padding: '10px 14px', background: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16,
        }}>
          <StatPill label="Guests" value={filteredGuests.length} color="#065f46" />
          <StatPill label="Assigned" value={filteredGuests.filter((g) => g.assigned_employee_id).length} color="#16a34a" />
          <StatPill label="Unassigned" value={filteredGuests.filter((g) => !g.assigned_employee_id).length} color="#d97706" />
        </div>
      )}

      {/* Results table */}
      <Card
        bordered={false} className="shadow-sm"
        title={
          <Space>
            <span>{mode === 'attendance' ? 'Attendance records' : 'Guest records'}</span>
            <Badge count={mode === 'attendance' ? filteredAttendance.length : filteredGuests.length} showZero color="#065f46" />
          </Space>
        }
      >
        {mode === 'attendance' ? (
          <Table
            rowKey="id" columns={attendanceColumns} dataSource={filteredAttendance}
            loading={loading} pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: 'max-content' }} locale={{ emptyText: 'No records match the filters' }}
          />
        ) : (
          <Table
            rowKey="id" columns={guestColumns} dataSource={filteredGuests}
            loading={loading} pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: 'max-content' }} locale={{ emptyText: 'No guest records match the filters' }}
          />
        )}
      </Card>

      {renderAttendanceModal()}
      {renderGuestModal()}
    </div>
  );
}