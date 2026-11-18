import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, DatePicker, Select, Input,
  Row, Col, Statistic, message, Grid, Empty, Badge, Tooltip, Image,
  Modal, Descriptions, Divider,
} from 'antd';
import {
  FileExcelOutlined, ReloadOutlined, SearchOutlined, FilterOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, TeamOutlined, CalendarOutlined,
  EyeOutlined, EnvironmentOutlined, CameraOutlined, FileTextOutlined,
  HomeOutlined, WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../api/axios';
import { assetUrl } from '../config';

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
  early: 'orange',
};

const STATUS_META = {
  present: { accent: '#16a34a', bg: '#ecfdf5', label: 'Present' },
  late: { accent: '#d97706', bg: '#fffbeb', label: 'Late' },
  absent: { accent: '#dc2626', bg: '#fef2f2', label: 'Absent' },
  'half-day': { accent: '#1677ff', bg: '#eff6ff', label: 'Half Day' },
  leave: { accent: '#7c3aed', bg: '#f5f3ff', label: 'Leave' },
};

const statusOptions = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'half-day', label: 'Half Day' },
  { value: 'leave', label: 'Leave' },
  { value: 'early', label: 'Early out' },
  { value: 'on-time', label: 'On time / no early' },
];

export default function Reports() {
  // ═══════════ DEFAULT RANGE: start of current year → today ═══════════
  // This ensures the page loads ALL records for the year by default,
  // not just today's. User can narrow down with the RangePicker.
  const [range, setRange] = useState([
    dayjs().startOf('year'),
    dayjs().endOf('day'),
  ]);

  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState([]);
  const [genderFilter, setGenderFilter] = useState([]);
  const [quickRange, setQuickRange] = useState('year');   // matches default range

  // Detail modal
  const [viewing, setViewing] = useState(null);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await api.get('/employees');
      setEmployees(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const { data } = await api.get('/departments');
      setDepartments(data);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/all', {
        params: {
          from: from.format('YYYY-MM-DD'),
          to: to.format('YYYY-MM-DD'),
        },
      });
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadDepartments();
    load(range[0], range[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyQuickRange = (key) => {
    setQuickRange(key);
    let from, to;
    if (key === 'today') {
      from = to = dayjs();
    } else if (key === 'yesterday') {
      from = to = dayjs().subtract(1, 'day');
    } else if (key === 'week') {
      from = dayjs().startOf('isoWeek');
      to = dayjs().endOf('isoWeek');
    } else if (key === 'month') {
      from = dayjs().startOf('month');
      to = dayjs().endOf('month');
    } else if (key === 'year') {
      from = dayjs().startOf('year');
      to = dayjs().endOf('day');
    } else if (key === 'all') {
      // Fetch EVERYTHING the backend has — no date filter
      setRange([null, null]);
      loadAllRecords();
      return;
    } else {
      return;
    }
    setRange([from, to]);
    load(from, to);
  };

  // ── Load all records with no date filter ──
  const loadAllRecords = useCallback(async () => {
    setLoading(true);
    try {
      // The backend accepts from/to as optional — passing neither returns
      // every attendance row in the database.
      const { data } = await api.get('/attendance/all', { params: {} });
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  const applyRange = (values) => {
    if (!values || values.length !== 2) return;
    setRange(values);
    setQuickRange('custom');
    load(values[0], values[1]);
  };

  const empMeta = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = {
        gender: e.gender || '',
        department_name: e.department_name || '',
      };
    });
    return map;
  }, [employees]);

  const enrichedRows = useMemo(() => {
    return rows.map((r) => {
      const meta = empMeta[r.employee_id] || {};
      return {
        ...r,
        gender: meta.gender || '',
        department_name: r.department || meta.department_name || '',
        isEarly: Boolean(r.early_leave_reason),
      };
    });
  }, [rows, empMeta]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const realStatuses = statusFilter.filter(
      (v) => v !== 'early' && v !== 'on-time'
    );
    const wantsEarly = statusFilter.includes('early');
    const wantsOnTime = statusFilter.includes('on-time');

    return enrichedRows.filter((r) => {
      if (q) {
        const hay =
          (r.full_name || '').toLowerCase() +
          ' ' +
          (r.employee_code || '').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (realStatuses.length && !realStatuses.includes(r.status)) return false;

      if (wantsEarly || wantsOnTime) {
        const matchesEarly = wantsEarly && r.isEarly;
        const matchesOnTime = wantsOnTime && !r.isEarly;
        if (!matchesEarly && !matchesOnTime) return false;
      }

      if (employeeFilter.length && !employeeFilter.includes(r.employee_id)) return false;
      if (
        departmentFilter.length &&
        !departmentFilter.includes(r.department_name)
      )
        return false;
      if (genderFilter.length && !genderFilter.includes(r.gender)) return false;

      return true;
    });
  }, [
    enrichedRows,
    search,
    statusFilter,
    employeeFilter,
    departmentFilter,
    genderFilter,
  ]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const present = filteredRows.filter((r) => r.status === 'present').length;
    const late = filteredRows.filter((r) => r.status === 'late').length;
    const absent = filteredRows.filter((r) => r.status === 'absent').length;
    const leave = filteredRows.filter((r) => r.status === 'leave').length;
    return { total, present, late, absent, leave };
  }, [filteredRows]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setEmployeeFilter([]);
    setDepartmentFilter([]);
    setGenderFilter([]);
  };

  const exportCSV = () => {
    const headers = [
      'Date', 'Code', 'Name', 'Gender', 'Department',
      'In', 'Out', 'Status', 'Attendance Note', 'Early Leave Reason', 'Clock-in Mode',
      'Remote Location', 'Clock-in Latitude', 'Clock-in Longitude',
      'Remote Selfie', 'Tasks Completed',
    ];
    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(',')]
      .concat(
        filteredRows.map((r) =>
          [
            String(r.attendance_date).slice(0, 10),
            r.employee_code,
            r.full_name,
            r.gender || '',
            r.department_name || '',
            r.clock_in || '',
            r.clock_out || '',
            r.status,
            r.notes || '',
            r.early_leave_reason || '',
            r.clock_in_mode || 'onsite',
            r.remote_location || '',
            r.clock_in_lat ?? '',
            r.clock_in_lng ?? '',
            assetUrl(r.remote_selfie) || '',
            r.tasks_completed || '',
          ].map(csvCell).join(',')
        )
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = range[0] && range[1]
      ? `${range[0].format('YYYY-MM-DD')}_to_${range[1].format('YYYY-MM-DD')}`
      : 'all_records';
    a.download = `attendance_${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'attendance_date',
      key: 'attendance_date',
      sorter: (a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)),
      render: (v) => String(v).slice(0, 10),
      defaultSortOrder: 'descend',
    },
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
      title: 'In / Out',
      key: 'times',
      render: (_, r) => (
        <Space size={4} wrap>
          <Text strong style={{ color: '#16a34a' }}>{r.clock_in || '—'}</Text>
          <Text type="secondary">→</Text>
          <Text strong style={{ color: r.clock_out ? '#d97706' : '#94a3b8' }}>
            {r.clock_out || '—'}
          </Text>
          {r.isEarly && (
            <Tooltip title={r.early_leave_reason || 'Early out'}>
              <Tag color="orange" style={{ marginLeft: 4 }}>early</Tag>
            </Tooltip>
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

  const renderMobileCard = (row) => {
    const meta = STATUS_META[row.status] || { accent: '#94a3b8', bg: '#f8fafc', label: row.status };
    const isRemote = row.clock_in_mode === 'remote';

    return (
      <div
        key={row.id}
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
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
              {row.full_name || '—'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {row.employee_code} · {String(row.attendance_date).slice(0, 10)}
            </div>
          </div>
          <Tag
            color={statusColor[row.status] || 'default'}
            style={{ margin: 0, borderRadius: 10, textTransform: 'capitalize', flexShrink: 0, fontWeight: 600, fontSize: 11 }}
          >
            {STATUS_META[row.status]?.label || row.status}
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
              {row.clock_in || '—'}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 10 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
              Clock Out
            </div>
            <div
              style={{
                fontSize: 15, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums',
                color: row.clock_out ? '#d97706' : '#94a3b8',
              }}
            >
              {row.clock_out || '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Tag color={isRemote ? 'purple' : 'blue'} style={{ margin: 0 }}>
            {isRemote ? 'Remote' : 'On-site'}
          </Tag>
          {row.department_name && (
            <Tag style={{ margin: 0 }}>{row.department_name}</Tag>
          )}
          {row.isEarly && <Tag color="orange" style={{ margin: 0 }}>early</Tag>}
        </div>

        <Button
          block
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewing(row)}
          style={{ marginTop: 10, borderRadius: 8 }}
        >
          View details
        </Button>
      </div>
    );
  };

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
        width={isMobile ? 'calc(100vw - 24px)' : 640}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        title={
          <Space>
            <span>{r.full_name || 'Attendance record'}</span>
            <Tag color={statusColor[r.status] || 'default'}>{meta.label}</Tag>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
                  {r.employee_code} · {String(r.attendance_date).slice(0, 10)}
                </Text>
              </div>
            </Space>
          </Card>

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
              <Tag color={statusColor[r.status] || 'default'}>{meta.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Mode">
              <Tag color={r.status === 'leave' || isRemote ? 'purple' : 'blue'}>
                {r.status === 'leave' ? 'Leave' : isRemote ? 'Remote' : 'On-site'}
              </Tag>
            </Descriptions.Item>
            {r.status === 'leave' && (
              <Descriptions.Item label="Attendance note" span={2}>
                {r.notes || 'Approved leave'}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Department" span={2}>
              {r.department_name || <Text type="secondary">Not assigned</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Gender">
              {r.gender ? <Tag>{r.gender}</Tag> : <Text type="secondary">—</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Employee code">
              <Text code>{r.employee_code}</Text>
            </Descriptions.Item>
          </Descriptions>

          {isRemote && (
            <>
              <Divider style={{ margin: '4px 0' }}>Remote activity</Divider>

              <Descriptions
                column={1}
                size="small"
                bordered
                labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
              >
                <Descriptions.Item label={<><EnvironmentOutlined /> Location</>}>
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
                <Descriptions.Item label={<><CameraOutlined /> Selfie</>}>
                  {r.remote_selfie ? (
                    <Image
                      src={assetUrl(r.remote_selfie)}
                      alt={`${r.full_name || 'Employee'} remote selfie`}
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

          <Text type="secondary" style={{ fontSize: 11 }}>
            Record ID #{r.id} · Logged on {String(r.created_at || '').slice(0, 19).replace('T', ' ')}
          </Text>
        </Space>
      </Modal>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Attendance Reports
          </Title>
          <Text type="secondary">
            Filter, view, and export attendance records for any period
          </Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => load(range[0], range[1])} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={exportCSV}
            disabled={!filteredRows.length}
          >
            {!isMobile && 'Export CSV'}
          </Button>
        </Space>
      </div>

      {/* Quick period + range */}
      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={12}>
            <Space wrap>
              <Text strong>Quick:</Text>
              <Button size="small" type={quickRange === 'today' ? 'primary' : 'default'} onClick={() => applyQuickRange('today')}>Today</Button>
              <Button size="small" type={quickRange === 'yesterday' ? 'primary' : 'default'} onClick={() => applyQuickRange('yesterday')}>Yesterday</Button>
              <Button size="small" type={quickRange === 'week' ? 'primary' : 'default'} onClick={() => applyQuickRange('week')}>This Week</Button>
              <Button size="small" type={quickRange === 'month' ? 'primary' : 'default'} onClick={() => applyQuickRange('month')}>This Month</Button>
              <Button size="small" type={quickRange === 'year' ? 'primary' : 'default'} onClick={() => applyQuickRange('year')}>This Year</Button>
              <Button size="small" type={quickRange === 'all' ? 'primary' : 'default'} onClick={() => applyQuickRange('all')}>All</Button>
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space wrap>
              <Text strong>Range:</Text>
              <RangePicker value={range[0] && range[1] ? range : null} onChange={applyRange} allowClear={false} />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Filters */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>Filters</span>
          </Space>
        }
        bordered={false}
        className="shadow-sm mb-4"
        extra={<Button type="link" onClick={clearFilters}>Clear all</Button>}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={6}>
            <Input
              placeholder="Search name or code"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Select
              mode="multiple"
              placeholder="Status (incl. early out)"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              allowClear
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Select
              mode="multiple"
              placeholder="Department"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              allowClear
              maxTagCount="responsive"
              style={{ width: '100%' }}
              options={departments.map((d) => ({ value: d.name, label: d.name }))}
            />
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Select
              mode="multiple"
              placeholder="Gender"
              value={genderFilter}
              onChange={setGenderFilter}
              allowClear
              maxTagCount="responsive"
              style={{ width: '100%' }}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Select
              mode="multiple"
              placeholder="Employee"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              allowClear
              maxTagCount="responsive"
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.full_name} (${e.employee_code})`,
              }))}
            />
          </Col>
        </Row>
      </Card>

      {/* Stats */}
      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Records" value={stats.total} prefix={<TeamOutlined style={{ color: '#1677ff' }} />} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Present" value={stats.present} prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Late" value={stats.late} prefix={<ClockCircleOutlined style={{ color: '#d97706' }} />} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Absent" value={stats.absent} prefix={<CloseCircleOutlined style={{ color: '#dc2626' }} />} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Leave" value={stats.leave} prefix={<CalendarOutlined style={{ color: '#7c3aed' }} />} valueStyle={{ color: '#7c3aed' }} />
          </Card>
        </Col>
      </Row>

      {/* Results */}
      <Card
        bordered={false}
        className="shadow-sm"
        title={
          <Space>
            <span>Results</span>
            <Badge count={filteredRows.length} showZero color="#065f46" />
          </Space>
        }
      >
        {isMobile ? (
          filteredRows.length === 0 ? (
            <Empty description="No records match the filters" />
          ) : (
            <div>{filteredRows.map(renderMobileCard)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No records match the filters' }}
          />
        )}
      </Card>

      {renderDetailModal()}
    </div>
  );
}