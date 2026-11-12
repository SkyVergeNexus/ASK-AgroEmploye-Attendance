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

const statusOptions = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'half-day', label: 'Half Day' },
  { value: 'leave', label: 'Leave' },
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
      // Monday → Sunday (ISO week)
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

  const exportCSV = () => {
    const headers = ['Date', 'Clock In', 'Clock Out', 'Status', 'Early Leave Reason'];
    const csv = [headers.join(',')]
      .concat(
        filtered.map((r) =>
          [
            String(r.attendance_date).slice(0, 10),
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
    a.download = `my_attendance_${range[0].format('YYYY-MM-DD')}_to_${range[1].format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const renderMobileCard = (r) => (
    <Card key={r.id} size="small" className="shadow-sm mb-3">
      <div className="flex justify-between items-start gap-2 mb-2">
        <Text strong>{String(r.attendance_date).slice(0, 10)}</Text>
        <Tag color={statusColor[r.status] || 'default'}>{r.status}</Tag>
      </div>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <div className="text-sm">
          <Text type="secondary">Clock In: </Text>{r.clock_in || '—'}
        </div>
        <div className="text-sm">
          <Text type="secondary">Clock Out: </Text>{r.clock_out || '—'}
          {r.early_leave_reason && <Tag color="orange" className="ml-2">early</Tag>}
        </div>
        {r.early_leave_reason && (
          <div className="text-xs text-gray-500 mt-1">
            Reason: {r.early_leave_reason}
          </div>
        )}
      </Space>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            My Attendance History
          </Title>
          <Text type="secondary">
            Filter by date range or status, and export your records
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(range[0], range[1])}
            loading={loading}
          >
            {!isMobile && 'Refresh'}
          </Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={exportCSV}
            disabled={!filtered.length}
          >
            {!isMobile && 'Export CSV'}
          </Button>
        </Space>
      </div>

      {/* Range selector */}
      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={12}>
            <Space wrap>
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

      {/* Status filter */}
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

      {/* Stats */}
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

      {/* Results */}
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
        {isMobile ? (
          loading ? (
            <Text type="secondary">Loading...</Text>
          ) : filtered.length === 0 ? (
            <Empty description="No records in this range" />
          ) : (
            <div>{filtered.map(renderMobileCard)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            loading={loading}
            pagination={{ pageSize: 12, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No records in this range' }}
          />
        )}
      </Card>
    </div>
  );
}