import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Row, Col, Statistic,
  DatePicker, Input, Grid, message, Popconfirm, Empty, Modal, Descriptions,
  Select,
} from 'antd';
import {
  UserOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, DeleteOutlined,
  CalendarOutlined, TeamOutlined, AppstoreOutlined, UserSwitchOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const genderColor = { male: 'blue', female: 'magenta', other: 'purple' };

const STATUS_COLOR = {
  pending: 'orange',
  accepted: 'blue',
  completed: 'green',
  cancelled: 'red',
};

const statusTag = (s) =>
  s ? <Tag color={STATUS_COLOR[s] || 'default'} style={{ fontSize: 10 }}>{s}</Tag> : null;

export default function Guests() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({
    total: 0, today: 0, week: 0, unassigned_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [employees, setEmployees] = useState([]);

  // Reassign modal state
  const [reassigning, setReassigning] = useState(null);
  const [reassignEmployeeId, setReassignEmployeeId] = useState(null);
  const [reassigningBusy, setReassigningBusy] = useState(false);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/guests/stats');
      setStats(data);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (range?.[0]) params.from = range[0].format('YYYY-MM-DD');
      if (range?.[1]) params.to = range[1].format('YYYY-MM-DD');
      const { data } = await api.get('/guests', { params });
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, [search, range]);

  useEffect(() => {
    load();
    loadStats();
    // Load active employees once for the reassign picker
    api
      .get('/employees')
      .then((r) => setEmployees(r.data.filter((e) => e.is_active && e.is_approved)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [search, range, load]);

  const remove = async (id) => {
    try {
      await api.delete('/guests/' + id);
      message.success('Guest record deleted');
      load();
      loadStats();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const openReassign = (row) => {
    setReassigning(row);
    setReassignEmployeeId(row.assigned_employee_id || null);
  };

  const doReassign = async () => {
    if (!reassignEmployeeId) {
      message.error('Pick an employee first');
      return;
    }
    setReassigningBusy(true);
    try {
      await api.put(`/guests/${reassigning.id}/reassign`, {
        employee_id: reassignEmployeeId,
      });
      message.success('Reassigned');
      setReassigning(null);
      setReassignEmployeeId(null);
      load();
      loadStats();
    } catch (err) {
      message.error(err.response?.data?.message || 'Reassign failed');
    } finally {
      setReassigningBusy(false);
    }
  };

  // ── Assigned To cell (shared by table + mobile) ──
  const renderAssignment = (row) =>
    row.assigned_employee_id ? (
      <div>
        <div style={{ fontWeight: 500, fontSize: 13 }}>
          {row.assigned_employee_name || `#${row.assigned_employee_id}`}
        </div>
        {row.assigned_employee_code && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {row.assigned_employee_code}
          </div>
        )}
        {statusTag(row.assignment_status)}
      </div>
    ) : (
      <Tag color="default">Unassigned</Tag>
    );

  const columns = useMemo(
    () => [
      {
        title: 'Date & Time',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 160,
        render: (v) => dayjs(v).format('DD MMM YYYY, HH:mm'),
        sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
        defaultSortOrder: 'descend',
      },
      {
        title: 'Guest',
        dataIndex: 'full_name',
        key: 'full_name',
        render: (text, row) => (
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500">{row.phone}</div>
          </div>
        ),
      },
      {
        title: 'Service',
        key: 'service',
        render: (_, row) => (
          <div>
            <div style={{ fontWeight: 500 }}>{row.service_name || '—'}</div>
            {row.service_name === 'Other' && row.purpose && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {row.purpose}
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Assigned To',
        key: 'assigned',
        width: 180,
        render: (_, row) => renderAssignment(row),
      },
      {
        title: 'Gender',
        dataIndex: 'gender',
        key: 'gender',
        width: 90,
        render: (v) => (v ? <Tag color={genderColor[v] || 'default'}>{v}</Tag> : '—'),
      },
      {
        title: '',
        key: 'actions',
        width: 150,
        align: 'right',
        render: (_, row) => (
          <Space size={4}>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setViewing(row)}
            />
            <Button
              size="small"
              icon={<UserSwitchOutlined />}
              onClick={() => openReassign(row)}
              title="Reassign"
            />
            <Popconfirm
              title="Delete this guest record?"
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(row.id)}
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const renderMobileCard = (r) => (
    <div
      key={r.id}
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderLeft: '4px solid #7c3aed',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {r.full_name}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {r.phone} · {dayjs(r.created_at).format('DD MMM, HH:mm')}
          </div>
        </div>
        {r.gender && <Tag color={genderColor[r.gender] || 'default'}>{r.gender}</Tag>}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: '8px 10px',
          background: '#f8fafc',
          borderRadius: 8,
          fontSize: 12,
          color: '#334155',
          wordBreak: 'break-word',
        }}
      >
        <strong>Service:</strong> {r.service_name || '—'}
        {r.service_name === 'Other' && r.purpose && (
          <div style={{ marginTop: 4 }}>
            <strong>Purpose:</strong> {r.purpose}
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          <strong>Assigned:</strong> {renderAssignment(r)}
        </div>
      </div>

      <Space style={{ marginTop: 10 }} size={6} wrap>
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(r)}>
          View
        </Button>
        <Button size="small" icon={<UserSwitchOutlined />} onClick={() => openReassign(r)}>
          Reassign
        </Button>
        <Popconfirm
          title="Delete this guest record?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove(r.id)}
        >
          <Button danger size="small" icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>
      </Space>
    </div>
  );

  const renderDetail = () => {
    if (!viewing) return null;
    const r = viewing;
    return (
      <Modal
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        title={
          <Space>
            <UserOutlined />
            <span>{r.full_name}</span>
            {r.gender && <Tag color={genderColor[r.gender]}>{r.gender}</Tag>}
          </Space>
        }
      >
        <Descriptions
          column={1}
          size="small"
          bordered
          labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
        >
          <Descriptions.Item label="Full Name">{r.full_name}</Descriptions.Item>
          <Descriptions.Item label="Phone">{r.phone}</Descriptions.Item>
          <Descriptions.Item label="Gender">{r.gender || '—'}</Descriptions.Item>
          <Descriptions.Item label="Service">
            {r.service_name || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Purpose">{r.purpose}</Descriptions.Item>
          <Descriptions.Item label="Notes">
            {r.notes ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>
            ) : (
              <Text type="secondary">None</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Assigned To">
            {r.assigned_employee_id ? (
              <Space direction="vertical" size={2}>
                <span>
                  {r.assigned_employee_name || `#${r.assigned_employee_id}`}
                  {r.assigned_employee_code ? ` (${r.assigned_employee_code})` : ''}
                </span>
                {statusTag(r.assignment_status)}
                {r.assigned_at && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    <ClockCircleOutlined /> {dayjs(r.assigned_at).format('DD MMM YYYY · HH:mm')}
                  </span>
                )}
              </Space>
            ) : (
              <Space>
                <Tag color="default">Unassigned</Tag>
                <Button size="small" type="link" onClick={() => { setViewing(null); openReassign(r); }}>
                  Reassign
                </Button>
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Signed in">
            {dayjs(r.created_at).format('dddd, DD MMM YYYY · HH:mm')}
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    );
  };

  const renderReassignModal = () => (
    <Modal
      open={!!reassigning}
      title={`Reassign guest: ${reassigning?.full_name || ''}`}
      onCancel={() => {
        setReassigning(null);
        setReassignEmployeeId(null);
      }}
      onOk={doReassign}
      confirmLoading={reassigningBusy}
      okText="Reassign"
      centered
      width={isMobile ? 'calc(100vw - 24px)' : 440}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        The guest will be marked <Tag color="orange" style={{ fontSize: 10 }}>pending</Tag> for the chosen employee.
      </Text>
      <Select
        style={{ width: '100%' }}
        placeholder="Pick an employee…"
        value={reassignEmployeeId || undefined}
        onChange={setReassignEmployeeId}
        showSearch
        optionFilterProp="label"
        options={employees.map((e) => ({
          value: e.id,
          label: `${e.full_name} (${e.employee_code})${e.department_name ? ' · ' + e.department_name : ''}`,
        }))}
      />
    </Modal>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Guests / Visitors
          </Title>
          <Text type="secondary">
            Walk-in guest registrations from the login page
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            load();
            loadStats();
          }}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total" value={stats.total} prefix={<TeamOutlined style={{ color: '#1677ff' }} />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Today"
              value={stats.today}
              prefix={<CalendarOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="This week"
              value={stats.week}
              prefix={<AppstoreOutlined style={{ color: '#7c3aed' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card
            bordered={false}
            className="shadow-sm"
            style={
              stats.unassigned_today > 0
                ? { border: '1px solid #f59e0b', background: '#fffbeb' }
                : undefined
            }
          >
            <Statistic
              title="Unassigned (today)"
              value={stats.unassigned_today || 0}
              prefix={<UserSwitchOutlined style={{ color: '#d97706' }} />}
              valueStyle={{
                color: stats.unassigned_today > 0 ? '#d97706' : '#94a3b8',
              }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Input
              placeholder="Search name, phone, service, handler"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={12}>
            <RangePicker
              value={range}
              onChange={setRange}
              allowClear
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      <Card bordered={false} className="shadow-sm">
        {isMobile ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary">Loading...</Text>
            </div>
          ) : rows.length === 0 ? (
            <Empty description="No guests have signed in yet" />
          ) : (
            <div>{rows.map(renderMobileCard)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No guests have signed in yet' }}
          />
        )}
      </Card>

      {renderDetail()}
      {renderReassignModal()}
    </div>
  );
}