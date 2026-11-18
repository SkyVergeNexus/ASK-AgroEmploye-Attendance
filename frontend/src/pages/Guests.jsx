import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Avatar, Card, Table, Tag, Button, Typography, Space, Row, Col, Statistic,
  DatePicker, Input, Grid, message, Popconfirm, Empty, Modal, Descriptions,
  Select, Alert, Spin,
} from 'antd';
import {
  UserOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, DeleteOutlined,
  CalendarOutlined, TeamOutlined, AppstoreOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';
import { assetUrl } from '../config';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const genderColor = { male: 'blue', female: 'magenta', other: 'purple' };

const STATUS_COLOR = {
  assigned: 'cyan',
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

  // Reassign modal state
  const [reassigning, setReassigning] = useState(null);
  const [reassignEmployeeId, setReassignEmployeeId] = useState(null);
  const [reassigningBusy, setReassigningBusy] = useState(false);
  const [suggestedEmployees, setSuggestedEmployees] = useState([]);
  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

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

  const openReassign = async (row) => {
    setReassigning(row);
    setReassignEmployeeId(row.assigned_employee_id || null);
    setSuggestedEmployees([]);
    setSuggestionMessage('');
    setSuggestionsLoading(true);
    try {
      const { data } = await api.get(`/guests/${row.id}/suggestions`);
      setSuggestedEmployees(data.employees || []);
      setSuggestionMessage(data.message || '');
      const bestMatch = data.employees?.find((employee) => employee.profile_match);
      const currentEmployeeMatches = data.employees?.some(
        (employee) => Number(employee.id) === Number(row.assigned_employee_id)
      );
      if (!currentEmployeeMatches) {
        setReassignEmployeeId(bestMatch?.id || null);
      }
    } catch (err) {
      setSuggestionMessage(err.response?.data?.message || 'Failed to load staff suggestions');
      message.error(err.response?.data?.message || 'Failed to load staff suggestions');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const doReassign = async () => {
    if (!suggestedEmployees.some(
      (employee) => Number(employee.id) === Number(reassignEmployeeId)
    )) {
      message.error('Choose an employee who matches this service profile');
      return;
    }
    setReassigningBusy(true);
    try {
      const { data } = await api.put(`/guests/${reassigning.id}/reassign`, {
        employee_id: reassignEmployeeId,
      });
      if (data.guest) {
        setViewing((current) =>
          current?.id === data.guest.id ? { ...current, ...data.guest } : current
        );
      }
      message.success(
        reassigning.assigned_employee_id
          ? 'Employee assignment updated'
          : 'Employee assigned to guest'
      );
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
            {row.purpose && (
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
        {r.purpose && (
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
        footer={
          <Space>
            <Button onClick={() => setViewing(null)}>Close</Button>
            <Button
              type="primary"
              icon={<UserSwitchOutlined />}
              onClick={() => openReassign(r)}
            >
              {r.assigned_employee_id ? 'Change employee' : 'Assign employee'}
            </Button>
          </Space>
        }
        centered
        width={screens.lg ? 900 : 'calc(100vw - 24px)'}
        title={
          <Space>
            <UserOutlined />
            <span>{r.full_name}</span>
            {r.gender && <Tag color={genderColor[r.gender]}>{r.gender}</Tag>}
          </Space>
        }
      >
        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 }}>
          <Descriptions
            title="Guest information"
            column={isMobile ? 1 : 2}
            size="small"
            bordered
            labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
          >
            <Descriptions.Item label="Guest record">#{r.id}</Descriptions.Item>
            <Descriptions.Item label="Full name">{r.full_name}</Descriptions.Item>
            <Descriptions.Item label="Phone">{r.phone}</Descriptions.Item>
            <Descriptions.Item label="Gender">{r.gender || '—'}</Descriptions.Item>
            <Descriptions.Item label="Service">{r.service_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Signed in">
              {dayjs(r.created_at).format('dddd, DD MMM YYYY · HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Purpose" span={isMobile ? 1 : 2}>
              {r.purpose || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Notes" span={isMobile ? 1 : 2}>
              {r.notes ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>
              ) : (
                <Text type="secondary">None</Text>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions
            title="Employee assignment"
            column={isMobile ? 1 : 2}
            size="small"
            bordered
            style={{ marginTop: 16 }}
            labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
          >
            <Descriptions.Item label="Employee" span={isMobile ? 1 : 2}>
              {r.assigned_employee_id ? (
                <Space>
                  <Avatar
                    src={assetUrl(r.assigned_employee_picture) || undefined}
                    icon={<UserOutlined />}
                  />
                  <Text strong>{r.assigned_employee_name || `#${r.assigned_employee_id}`}</Text>
                </Space>
              ) : (
                <Tag color="default">Not assigned</Tag>
              )}
            </Descriptions.Item>
            {r.assigned_employee_id && (
              <>
                <Descriptions.Item label="Employee ID">
                  {r.assigned_employee_code || `#${r.assigned_employee_id}`}
                </Descriptions.Item>
                <Descriptions.Item label="Department / role">
                  {[r.assigned_employee_department, r.assigned_employee_role]
                    .filter(Boolean)
                    .join(' · ') || 'Not specified'}
                </Descriptions.Item>
                <Descriptions.Item label="Employee phone">
                  {r.assigned_employee_phone || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Employee email">
                  {r.assigned_employee_email || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Assignment status">
                  {statusTag(r.assignment_status)}
                </Descriptions.Item>
                <Descriptions.Item label="Assigned on">
                  {r.assigned_at
                    ? dayjs(r.assigned_at).format('dddd, DD MMM YYYY · HH:mm')
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Assigned by">
                  {r.assigned_by_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Attended on">
                  {r.completed_at
                    ? dayjs(r.completed_at).format('dddd, DD MMM YYYY · HH:mm')
                    : r.assignment_status === 'completed'
                      ? 'Completed (time unavailable)'
                      : 'Not yet completed'}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </div>
      </Modal>
    );
  };

  const renderReassignModal = () => (
    <Modal
      open={!!reassigning}
      title={`${reassigning?.assigned_employee_id ? 'Change staff for' : 'Assign staff to'} ${reassigning?.full_name || ''}`}
      onCancel={() => {
        setReassigning(null);
        setReassignEmployeeId(null);
      }}
      onOk={doReassign}
      confirmLoading={reassigningBusy}
      okButtonProps={{
        disabled: suggestionsLoading || !suggestedEmployees.some(
          (employee) => Number(employee.id) === Number(reassignEmployeeId)
        ),
      }}
      okText={reassigning?.assigned_employee_id ? 'Update assignment' : 'Assign staff'}
      centered
      width={isMobile ? 'calc(100vw - 24px)' : 600}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Choose a profile-matched employee. The assignment will be recorded immediately and the employee can confirm it.
      </Text>
      {suggestionsLoading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>
      ) : suggestedEmployees.some((employee) => employee.profile_match) ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Best profile match: ${suggestedEmployees.find((employee) => employee.profile_match).full_name}`}
          description="Recommendations are ranked by department and role fit, then by current guest workload."
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="No matching staff recommendation"
          description={suggestionMessage || 'Available active staff are listed below by workload. You can still assign this guest to any suitable employee.'}
        />
      )}
      {suggestedEmployees
        .filter((employee) => employee.profile_match)
        .slice(0, 3)
        .map((employee, index) => (
          <Card
            key={employee.id}
            size="small"
            style={{
              marginBottom: 8,
              borderColor: reassignEmployeeId === employee.id ? '#15803d' : '#e2e8f0',
              background: reassignEmployeeId === employee.id ? '#f0fdf4' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <Text strong>{employee.full_name}</Text>
                {index === 0 && <Tag color="green" style={{ marginLeft: 8 }}>Top match</Tag>}
                {employee.is_service_contact && <Tag color="blue">Service contact</Tag>}
                <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                  {[employee.department_name, employee.role_name].filter(Boolean).join(' · ') || 'Profile details unavailable'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                  {employee.match_reason} · {employee.open_guests_today} open guest{employee.open_guests_today === 1 ? '' : 's'} today
                </div>
              </div>
              <Button
                size="small"
                type={reassignEmployeeId === employee.id ? 'primary' : 'default'}
                onClick={() => setReassignEmployeeId(employee.id)}
              >
                {reassignEmployeeId === employee.id ? 'Selected' : 'Choose'}
              </Button>
            </div>
          </Card>
        ))}
      <Select
        style={{ width: '100%' }}
        placeholder="Choose a service-matched employee"
        value={reassignEmployeeId || undefined}
        onChange={setReassignEmployeeId}
        disabled={suggestionsLoading || suggestedEmployees.length === 0}
        showSearch
        optionFilterProp="label"
        options={suggestedEmployees.map((employee) => ({
          value: employee.id,
          label: `${employee.full_name} (${employee.employee_code}) · ${employee.department_name || 'No department'}${employee.role_name ? ` · ${employee.role_name}` : ''}${employee.is_service_contact ? ' · Service contact' : ''}`,
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