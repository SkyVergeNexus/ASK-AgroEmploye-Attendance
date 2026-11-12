import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, DatePicker, Select, Input,
  Row, Col, Statistic, message, Grid, Empty, Badge, Tooltip,
} from 'antd';
import {
  FileExcelOutlined, ReloadOutlined, SearchOutlined, FilterOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, TeamOutlined,
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
  early: 'orange',
};

// Combined Status options — includes real statuses + early-out pseudo-statuses
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
  const today = dayjs();
  const [range, setRange] = useState([today, today]);
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
  const [quickRange, setQuickRange] = useState('today');

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
      to = dayjs().endOf('year');
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

  // Apply all filters — Status filter now also honours 'early' and 'on-time'
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    // Split status filter into real statuses vs. early pseudo-statuses
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

      // Real status filter (present/late/etc.)
      if (realStatuses.length && !realStatuses.includes(r.status)) return false;

      // Early pseudo-status logic
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
    return { total, present, late, absent };
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
      'In', 'Out', 'Status', 'Early Leave Reason',
    ];
    const csv = [headers.join(',')]
      .concat(
        filteredRows.map((r) =>
          [
            String(r.attendance_date).slice(0, 10),
            r.employee_code,
            `"${r.full_name}"`,
            r.gender || '',
            r.department_name || '',
            r.clock_in || '',
            r.clock_out || '',
            r.status,
            `"${(r.early_leave_reason || '').replace(/"/g, '""')}"`,
          ].join(',')
        )
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${range[0].format('YYYY-MM-DD')}_to_${range[1].format('YYYY-MM-DD')}.csv`;
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
      title: 'Gender',
      dataIndex: 'gender',
      key: 'gender',
      render: (v) => (v ? <Tag>{v}</Tag> : '—'),
    },
    {
      title: 'Department',
      dataIndex: 'department_name',
      key: 'department_name',
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
          {r.isEarly && (
            <Tooltip title={r.early_leave_reason || 'Early out'}>
              <Tag color="orange" style={{ marginLeft: 4 }}>early</Tag>
            </Tooltip>
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

  const renderMobileCard = (row) => (
    <Card key={row.id} size="small" className="shadow-sm mb-3">
      <div className="flex justify-between items-start gap-2 mb-2">
        <div>
          <div className="font-medium">{row.full_name}</div>
          <div className="text-xs text-gray-500">{row.employee_code}</div>
        </div>
        <Space size={4}>
          <Tag color={statusColor[row.status] || 'default'}>{row.status}</Tag>
          {row.isEarly && <Tag color="orange">early</Tag>}
        </Space>
      </div>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <div className="text-sm">
          <Text type="secondary">Date: </Text>{String(row.attendance_date).slice(0, 10)}
        </div>
        <div className="text-sm">
          <Text type="secondary">Dept: </Text>{row.department_name || '—'}
        </div>
        <div className="text-sm">
          <Text type="secondary">Gender: </Text>{row.gender || '—'}
        </div>
        <div className="text-sm">
          <Text type="secondary">In / Out: </Text>
          {row.clock_in || '—'} / {row.clock_out || '—'}
        </div>
        {row.isEarly && row.early_leave_reason && (
          <div className="text-xs text-gray-600 mt-1">
            <Text type="secondary">Early reason: </Text>{row.early_leave_reason}
          </div>
        )}
      </Space>
    </Card>
  );

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
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space wrap>
              <Text strong>Range:</Text>
              <RangePicker
                value={range}
                onChange={applyRange}
                allowClear={false}
              />
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

      {/* Stats — back to 4 cards */}
      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Records"
              value={stats.total}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
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
    </div>
  );
}