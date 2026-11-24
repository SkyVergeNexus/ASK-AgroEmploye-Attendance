import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, DatePicker, Select, Input,
  Row, Col, Grid, Badge, Image, Empty, Modal, Descriptions, Divider,
  Segmented, Avatar,
} from 'antd';
import {
  FileExcelOutlined, FilePdfOutlined, ReloadOutlined, SearchOutlined,
  FilterOutlined, TeamOutlined, CalendarOutlined, UserOutlined,
  EyeOutlined, EnvironmentOutlined, CameraOutlined, FileTextOutlined,
  HomeOutlined, WifiOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, UserAddOutlined, UserDeleteOutlined, BarChartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { assetUrl } from '../config';
import AttendanceRecordTag from '../components/AttendanceRecordTag';
import { attendanceClockOutLabel, attendanceRecordLabel } from '../utils/attendanceRecordLabel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const BRAND = '#065f46';
const BRAND_SOFT = '#ecfdf5';
const BORDER = '#e5e7eb';
const CARD = { border: `1px solid ${BORDER}`, borderRadius: 12 };

const STATUS_META = {
  present: { accent: '#16a34a', bg: '#ecfdf5', label: 'Present', color: 'green' },
  late: { accent: '#d97706', bg: '#fffbeb', label: 'Late', color: 'gold' },
  absent: { accent: '#dc2626', bg: '#fef2f2', label: 'Absent', color: 'red' },
  leave: { accent: '#7c3aed', bg: '#f5f3ff', label: 'Leave', color: 'purple' },
};

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }));

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const GUEST_STATUS_META = {
  assigned: { color: 'blue', label: 'Assigned' },
  accepted: { color: 'cyan', label: 'Accepted' },
  completed: { color: 'green', label: 'Completed' },
  cancelled: { color: 'red', label: 'Cancelled' },
};

const selectProps = { mode: 'multiple', allowClear: true, maxTagCount: 'responsive', style: { width: '100%' } };

/* ---------- Helpers ---------- */

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);

function computeStats(rows) {
  const total = rows.length;
  const count = (s) => rows.filter((r) => r.status === s).length;
  const present = count('present');
  const late = count('late');
  const absent = count('absent');
  const leave = count('leave');
  return {
    total, present, late, absent, leave,
    attendancePct: pct(present + late, total),
    absentPct: pct(absent, total),
    latePct: pct(late, total),
  };
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Prefix risky leading characters so spreadsheets do not run user text as a formula.
const csvSafe = (v) => {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

function downloadCsv(filename, headers, rows) {
  const cell = (v) => `"${csvSafe(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(cell).join(',')].concat(rows.map((r) => r.map(cell).join(','))).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- PDF generation ---------- */

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
  if (!win) { toast.error('Please allow popups to download PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/* ---------- Small presentational pieces ---------- */

function IconBadge({ icon, bg = BRAND_SOFT, color = BRAND, size = 36 }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 10, background: bg, color, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size / 2.1,
      }}
    >
      {icon}
    </span>
  );
}

function Stat({ icon, label, value, sub, bg, color }) {
  return (
    <div
      style={{
        flex: '1 1 170px', display: 'flex', gap: 12, alignItems: 'center',
        padding: '14px 16px', background: '#fff', ...CARD,
      }}
    >
      <IconBadge icon={icon} bg={bg} color={color} />
      <div style={{ minWidth: 0 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{label}</Text>
        <Text strong style={{ fontSize: 20, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
        {sub && <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{sub}</Text>}
      </div>
    </div>
  );
}

function Distribution({ stats }) {
  const parts = ['present', 'late', 'absent', 'leave']
    .map((k) => ({ k, n: stats[k], ...STATUS_META[k] }))
    .filter((p) => p.n > 0);

  return (
    <div style={{ padding: '14px 16px', background: '#fff', ...CARD, marginTop: 12 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: BORDER }}>
        {parts.map((p) => (
          <div
            key={p.k}
            title={`${p.label}: ${p.n} (${pct(p.n, stats.total)}%)`}
            style={{ width: `${pct(p.n, stats.total)}%`, background: p.accent }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10 }}>
        {parts.map((p) => (
          <Text key={p.k} style={{ fontSize: 12 }}>
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: p.accent, marginRight: 6,
              }}
            />
            {p.label} {p.n} <Text type="secondary" style={{ fontSize: 12 }}>({pct(p.n, stats.total)}%)</Text>
          </Text>
        ))}
      </div>
    </div>
  );
}

function ModalNote({ bg, border, color, children }) {
  return (
    <div
      style={{
        background: bg, border: `1px solid ${border}`, color, borderRadius: 10,
        padding: '12px 14px', fontSize: 13, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
    >
      {children}
    </div>
  );
}

const labelStyle = (width) => ({ label: { width, background: '#f8fafc', fontWeight: 600 } });

/* ---------- Main component ---------- */

export default function Reports() {
  const [mode, setMode] = useState('attendance');
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs().endOf('day')]);

  const [attendanceRows, setAttendanceRows] = useState([]);
  const [guestRows, setGuestRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

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

  // Lookup lists are optional extras for the filters, so a failure here stays quiet.
  const loadEmployees = useCallback(async () => {
    try { const { data } = await api.get('/employees'); setEmployees(data); } catch { /* ignore */ }
  }, []);
  const loadDepartments = useCallback(async () => {
    try { const { data } = await api.get('/departments'); setDepartments(data); } catch { /* ignore */ }
  }, []);
  const loadServices = useCallback(async () => {
    try { const { data } = await api.get('/services'); setServices(data); } catch { /* ignore */ }
  }, []);

  const loadAttendance = useCallback(async (from, to, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/attendance/all', {
        params: { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') },
      });
      setAttendanceRows(data);
      setLastUpdated(dayjs());
      setViewingAttendance((current) => {
        if (!current) return current;
        const latest = data.find((record) => record.id === current.id);
        if (!latest) return current;
        const changed = [
          'clock_out', 'status', 'auto_clocked_out', 'auto_clock_out_reason',
          'needs_review', 'review_note', 'after_close_tracking', 'admin_resolved',
          'admin_resolved_by', 'admin_resolved_at', 'admin_resolved_reason',
        ].some((key) => latest[key] !== current[key]);
        return changed ? { ...current, ...latest } : current;
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load attendance');
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
      setLastUpdated(dayjs());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load guests');
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

  // Refresh every minute, but only while this tab is visible.
  useEffect(() => {
    reload();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') reload(true);
    }, 60 * 1000);
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

  const attendanceStats = useMemo(() => computeStats(filteredAttendance), [filteredAttendance]);

  const singleEmployeeStats = useMemo(() => {
    if (employeeFilter.length !== 1) return null;
    const empId = employeeFilter[0];
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return null;
    return { employee: emp, ...computeStats(filteredAttendance.filter((r) => r.employee_id === empId)) };
  }, [employeeFilter, filteredAttendance, employees]);

  const guestStats = useMemo(() => {
    const assigned = filteredGuests.filter((g) => g.assigned_employee_id).length;
    return { total: filteredGuests.length, assigned, unassigned: filteredGuests.length - assigned };
  }, [filteredGuests]);

  const activeFilters = [
    search.trim(), statusFilter.length, employeeFilter.length,
    departmentFilter.length, genderFilter.length, guestServiceFilter.length,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch(''); setStatusFilter([]); setEmployeeFilter([]);
    setDepartmentFilter([]); setGenderFilter([]); setGuestServiceFilter([]);
  };

  const rangePresets = [
    { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
    { label: 'This week', value: [dayjs().startOf('week'), dayjs().endOf('day')] },
    { label: 'This month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
    {
      label: 'Last month',
      value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
    },
  ];

  const rangeLabel = `${range[0].format('YYYY-MM-DD')}_${range[1].format('YYYY-MM-DD')}`;

  const exportCSV = () => {
    if (mode === 'attendance') {
      downloadCsv(
        `attendance_${rangeLabel}.csv`,
        [
          'Date', 'Code', 'Name', 'Gender', 'Department', 'In', 'Out', 'Status',
          'Mode', 'Record', 'Admin decision', 'Reviewed at', 'Admin reason',
          'Auto clock-out reason', 'Note',
        ],
        filteredAttendance.map((r) => [
          String(r.attendance_date).slice(0, 10),
          r.employee_code, r.full_name, r.gender || '', r.department_name || '',
          r.clock_in || '', attendanceClockOutLabel(r), r.status, r.clock_in_mode || 'onsite',
          attendanceRecordLabel(r),
          r.admin_resolved ? (r.status === 'absent' ? 'Absent' : 'Present') : '',
          r.admin_resolved_at ? dayjs(r.admin_resolved_at).format('YYYY-MM-DD HH:mm:ss') : '',
          r.admin_resolved_reason || '',
          r.auto_clocked_out ? r.auto_clock_out_reason || 'Departure detected' : '',
          r.notes || '',
        ])
      );
    } else {
      downloadCsv(
        `guests_${rangeLabel}.csv`,
        ['Date', 'Guest', 'Phone', 'Gender', 'Service', 'Purpose', 'Assigned to', 'Status'],
        filteredGuests.map((g) => [
          dayjs(g.created_at).format('YYYY-MM-DD HH:mm'),
          g.full_name, g.phone || '', g.gender || '', g.service_name || '', g.purpose || '',
          g.assigned_employee_name || 'Unassigned',
          GUEST_STATUS_META[g.assignment_status]?.label || g.assignment_status || '',
        ])
      );
    }
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
          { title: 'Mode', render: (r) => (r.clock_in_mode === 'remote' ? 'Remote' : 'On-site') },
          { title: 'Record', render: attendanceRecordLabel },
          { title: 'Reviewed at', render: (r) => (r.admin_resolved_at ? dayjs(r.admin_resolved_at).format('DD MMM YYYY HH:mm') : '') },
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
          { label: 'Total guests', value: guestStats.total },
          { label: 'Assigned', value: guestStats.assigned },
          { label: 'Unassigned', value: guestStats.unassigned },
        ],
      }));
    }
  };

  /* ---------- Table columns ---------- */

  const attendanceColumns = [
    {
      title: 'Date', dataIndex: 'attendance_date', key: 'attendance_date', width: 120,
      sorter: (a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)),
      render: (v) => String(v).slice(0, 10), defaultSortOrder: 'descend',
    },
    {
      title: 'Employee', dataIndex: 'full_name', key: 'full_name',
      render: (text, row) => (
        <Space size={10}>
          <Avatar size={32} style={{ background: BRAND_SOFT, color: BRAND, fontWeight: 600 }}>
            {initials(text)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{text}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{row.employee_code}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Department', dataIndex: 'department_name', key: 'department_name',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
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
      title: '', key: 'actions', width: 90, align: 'right',
      render: (_, r) => (
        <Button type="primary" ghost size="small" icon={<EyeOutlined />} onClick={() => setViewingAttendance(r)}>
          View
        </Button>
      ),
    },
  ];

  const guestColumns = [
    {
      title: 'Date and time', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v) => dayjs(v).format('DD MMM YYYY, HH:mm'),
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Guest', dataIndex: 'full_name', key: 'full_name',
      render: (text, row) => (
        <Space size={10}>
          <Avatar size={32} style={{ background: BRAND_SOFT, color: BRAND, fontWeight: 600 }}>
            {initials(text)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{text}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{row.phone}</div>
          </div>
        </Space>
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
      title: 'Assigned to', key: 'assigned',
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
      title: '', key: 'actions', width: 90, align: 'right',
      render: (_, row) => (
        <Button type="primary" ghost size="small" icon={<EyeOutlined />} onClick={() => setViewingGuest(row)}>
          View
        </Button>
      ),
    },
  ];

  /* ---------- Modals ---------- */

  const renderAttendanceModal = () => {
    if (!viewingAttendance) return null;
    const r = viewingAttendance;
    const meta = STATUS_META[r.status] || { label: r.status };
    const isRemote = r.clock_in_mode === 'remote';
    const hasCoord = r.clock_in_lat != null && r.clock_in_lng != null;

    return (
      <Modal
        open
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
              background: isRemote ? '#faf5ff' : '#eff6ff',
              border: `1px solid ${isRemote ? '#e9d5ff' : '#bfdbfe'}`,
            }}
          >
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
          </div>

          <Descriptions column={2} size="small" bordered styles={labelStyle(120)}>
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
              <Descriptions column={1} size="small" bordered styles={labelStyle(140)}>
                <Descriptions.Item label={<><EnvironmentOutlined /> Work location</>}>
                  {r.remote_location || <Text type="secondary">Not recorded</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="GPS coordinates">
                  {hasCoord
                    ? <Text code style={{ fontSize: 12 }}>{r.clock_in_lat}, {r.clock_in_lng}</Text>
                    : <Text type="secondary">Not captured</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Nearby locality">
                  {!hasCoord ? <Text type="secondary">GPS not captured</Text>
                    : locationLookupLoading ? <Text type="secondary">Finding…</Text>
                    : locationLookupError ? <Text type="danger">{locationLookupError}</Text>
                    : nearbyLocality ? (
                      <div>
                        <Text strong>{nearbyLocality.name}, {nearbyLocality.countryCode}</Text>
                        <div>
                          <Text type="secondary">
                            Nearest mapped place · {nearbyLocality.distanceKm.toFixed(1)} km away
                          </Text>
                        </div>
                      </div>
                    ) : <Text type="secondary">No nearby locality found</Text>}
                </Descriptions.Item>
                <Descriptions.Item label={<><CameraOutlined /> Selfie</>}>
                  {r.remote_selfie ? (
                    <Image
                      src={assetUrl(r.remote_selfie)} alt="Selfie" width={160}
                      style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}
                    />
                  ) : <Text type="secondary">Not uploaded</Text>}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <Space size={6} style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: BRAND }} />
                  <Text strong>Tasks completed</Text>
                </Space>
                {r.tasks_completed
                  ? <ModalNote bg="#f8fafc" border={BORDER} color="inherit">{r.tasks_completed}</ModalNote>
                  : <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>Not submitted yet.</Text>}
              </div>
            </>
          )}

          {r.early_leave_reason && (
            <>
              <Divider style={{ margin: '4px 0' }}>Early leave</Divider>
              <ModalNote bg="#fffbeb" border="#fde68a" color="#92400e">
                <strong>Reason:</strong> {r.early_leave_reason}
              </ModalNote>
            </>
          )}

          <Text type="secondary" style={{ fontSize: 11 }}>
            Record #{r.id} · Logged on {String(r.created_at || '').slice(0, 19).replace('T', ' ')}
          </Text>
        </div>
      </Modal>
    );
  };

  const renderGuestModal = () => {
    if (!viewingGuest) return null;
    const g = viewingGuest;
    return (
      <Modal
        open
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
        <Descriptions column={1} size="small" bordered styles={labelStyle(140)}>
          <Descriptions.Item label="Full name">{g.full_name}</Descriptions.Item>
          <Descriptions.Item label="Phone">{g.phone}</Descriptions.Item>
          <Descriptions.Item label="Gender">{g.gender || '—'}</Descriptions.Item>
          <Descriptions.Item label="Service">{g.service_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Purpose">{g.purpose || '—'}</Descriptions.Item>
          <Descriptions.Item label="Notes">
            {g.notes
              ? <div style={{ whiteSpace: 'pre-wrap' }}>{g.notes}</div>
              : <Text type="secondary">None</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Assigned to">
            {g.assigned_employee_name ? (
              <Space>
                {g.assigned_employee_picture && (
                  <Avatar size={24} src={assetUrl(g.assigned_employee_picture)} />
                )}
                <span>{g.assigned_employee_name}</span>
                {g.assigned_employee_code && <Text type="secondary">({g.assigned_employee_code})</Text>}
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

  /* ---------- Render ---------- */

  const isAttendance = mode === 'attendance';
  const resultCount = isAttendance ? filteredAttendance.length : filteredGuests.length;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 48, height: 48, borderRadius: 12, background: BRAND, color: '#fff', fontSize: 22,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <BarChartOutlined />
          </span>
          <div>
            <Title level={3} style={{ margin: 0, color: BRAND }}>Reports</Title>
            <Text type="secondary">Attendance and guest analytics for any period</Text>
          </div>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={exportCSV} disabled={!resultCount}>
            {!isMobile && 'Export CSV'}
          </Button>
          <Button type="primary" icon={<FilePdfOutlined />} onClick={exportPdf} disabled={!resultCount}>
            {!isMobile ? 'Export PDF' : 'PDF'}
          </Button>
        </Space>
      </div>

      {/* Toolbar: mode, period, filters */}
      <Card variant="borderless" style={{ ...CARD, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Row gutter={[12, 12]} align="middle" justify="space-between">
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
          <Col xs={24} md={12} style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            <RangePicker
              value={range}
              presets={rangePresets}
              onChange={(v) => v && v[0] && v[1] && setRange(v)}
              allowClear={false}
              style={{ minWidth: 260, width: isMobile ? '100%' : undefined }}
            />
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0' }} />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={isAttendance ? 6 : 8}>
            <Input
              placeholder={isAttendance ? 'Search name or code' : 'Search guest, phone, service'}
              prefix={<SearchOutlined />} value={search}
              onChange={(e) => setSearch(e.target.value)} allowClear
            />
          </Col>

          {isAttendance ? (
            <>
              <Col xs={24} md={12} lg={6}>
                <Select {...selectProps} placeholder="Status" value={statusFilter}
                  onChange={setStatusFilter} options={STATUS_OPTIONS} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Select {...selectProps} placeholder="Department" value={departmentFilter}
                  onChange={setDepartmentFilter}
                  options={departments.map((d) => ({ value: d.name, label: d.name }))} />
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Select {...selectProps} placeholder="Gender" value={genderFilter}
                  onChange={setGenderFilter} options={GENDER_OPTIONS} />
              </Col>
              <Col xs={24} md={12} lg={12}>
                <Select {...selectProps} showSearch optionFilterProp="label" placeholder="Employee"
                  value={employeeFilter} onChange={setEmployeeFilter}
                  options={employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
              </Col>
            </>
          ) : (
            <Col xs={24} md={12} lg={8}>
              <Select {...selectProps} placeholder="Service" value={guestServiceFilter}
                onChange={setGuestServiceFilter}
                options={services.map((s) => ({ value: s.name, label: s.name }))} />
            </Col>
          )}

          <Col xs={24} lg={isAttendance ? 12 : 8} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            {activeFilters > 0 && (
              <Tag icon={<FilterOutlined />} color="green" style={{ margin: 0 }}>
                {activeFilters} filter{activeFilters === 1 ? '' : 's'} active
              </Tag>
            )}
            <Button type="link" onClick={clearFilters} disabled={!activeFilters} style={{ padding: 0 }}>
              Clear all
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Summary */}
      {isAttendance && attendanceStats.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Stat icon={<TeamOutlined />} label="Records" value={attendanceStats.total} />
            <Stat
              icon={<CheckCircleOutlined />} label="Attendance rate"
              value={`${attendanceStats.attendancePct}%`}
              bg="#ecfdf5" color="#16a34a"
            />
            <Stat
              icon={<ClockCircleOutlined />} label="Late" value={attendanceStats.late}
              sub={`${attendanceStats.latePct}%`} bg="#fffbeb" color="#d97706"
            />
            <Stat
              icon={<CloseCircleOutlined />} label="Absent" value={attendanceStats.absent}
              sub={`${attendanceStats.absentPct}%`} bg="#fef2f2" color="#dc2626"
            />
          </div>
          <Distribution stats={attendanceStats} />
        </div>
      )}

      {isAttendance && singleEmployeeStats && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px',
            padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 12, marginBottom: 16,
          }}
        >
          <Avatar size={36} style={{ background: BRAND, flexShrink: 0 }}>
            {initials(singleEmployeeStats.employee.full_name)}
          </Avatar>
          <div style={{ minWidth: 0, flex: '1 1 180px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              {singleEmployeeStats.employee.full_name}
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
                {singleEmployeeStats.employee.employee_code}
              </Text>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {singleEmployeeStats.total} record{singleEmployeeStats.total === 1 ? '' : 's'} in this period
            </div>
          </div>
          {[
            ['Attendance', singleEmployeeStats.attendancePct, '#16a34a'],
            ['Absent', singleEmployeeStats.absentPct, '#dc2626'],
            ['Late', singleEmployeeStats.latePct, '#d97706'],
          ].map(([label, value, color]) => (
            <div key={label}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
              <Text strong style={{ fontSize: 16, color }}>{value}%</Text>
            </div>
          ))}
        </div>
      )}

      {!isAttendance && guestStats.total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <Stat icon={<TeamOutlined />} label="Guests" value={guestStats.total} />
          <Stat icon={<UserAddOutlined />} label="Assigned" value={guestStats.assigned} bg="#ecfdf5" color="#16a34a" />
          <Stat icon={<UserDeleteOutlined />} label="Unassigned" value={guestStats.unassigned} bg="#fffbeb" color="#d97706" />
        </div>
      )}

      {/* Results */}
      <Card
        variant="borderless"
        style={CARD}
        title={
          <Space>
            <span>{isAttendance ? 'Attendance records' : 'Guest records'}</span>
            <Badge count={resultCount} showZero color={BRAND} overflowCount={9999} />
          </Space>
        }
        extra={
          lastUpdated && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Updated {lastUpdated.format('HH:mm:ss')}
            </Text>
          )
        }
      >
        <Table
          rowKey="id"
          columns={isAttendance ? attendanceColumns : guestColumns}
          dataSource={isAttendance ? filteredAttendance : filteredGuests}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} records` }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  activeFilters
                    ? 'No records match your filters. Try clearing some of them.'
                    : 'No records in this period. Try a different date range.'
                }
              />
            ),
          }}
        />
      </Card>

      {renderAttendanceModal()}
      {renderGuestModal()}
    </div>
  );
}