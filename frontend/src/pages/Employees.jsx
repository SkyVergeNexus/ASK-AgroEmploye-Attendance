import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Modal, Form, Input, Select,
  message, Tabs, Badge, Row, Col, Statistic, Grid, Avatar, Divider, Descriptions,
} from 'antd';
import {
  UserAddOutlined, CheckOutlined, CloseOutlined, DeleteOutlined,
  ReloadOutlined, SearchOutlined, EyeOutlined, UserOutlined, MailOutlined,
  PhoneOutlined, ApartmentOutlined, SafetyOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';
import { assetUrl } from '../config';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const APPROVAL_STATUS_META = {
  pending: { color: 'orange', label: 'Pending' },
  approved: { color: 'green', label: 'Approved' },
  rejected: { color: 'red', label: 'Rejected' },
  revoked: { color: 'volcano', label: 'Revoked' },
};

function getApprovalStatus(employee) {
  return employee.approval_status || (Number(employee.is_approved) ? 'approved' : 'pending');
}

export default function Employees() {
  const [list, setList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('approved');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // View modal state
  const [viewing, setViewing] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [form] = Form.useForm();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setList(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load employees');
    } finally {
      setLoading(false);
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

  useEffect(() => {
    load();
    loadDepartments();
  }, [load, loadDepartments]);

  const onDepartmentChange = async (deptId) => {
    form.setFieldValue('role_id', undefined);
    if (!deptId) {
      setRoles([]);
      return;
    }
    try {
      const { data } = await api.get('/departments/' + deptId + '/roles');
      setRoles(data);
    } catch {
      setRoles([]);
    }
  };

  const openAdd = () => {
    form.resetFields();
    form.setFieldsValue({ system_role: 'employee' });
    setRoles([]);
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.post('/employees', values);
      message.success('Employee added');
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.response) message.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const openView = (row) => {
    setViewing(row);
  };

  const closeView = () => {
    setViewing(null);
  };

  const remove = async (id) => {
    setActionLoading(true);
    try {
      await api.delete('/employees/' + id);
      message.success('Employee deleted');
      closeView();
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  };

  const decideApproval = async (id, decision) => {
    setActionLoading(true);
    try {
      const { data } = await api.put('/employees/' + id + '/approve', { decision });
      message.success(data.message || 'Employee status updated');
      setViewing((v) => (
        v && v.id === id
          ? {
              ...v,
              is_approved: decision === 'approve' ? 1 : 0,
              approval_status: decision === 'approve'
                ? 'approved'
                : decision === 'reject'
                  ? 'rejected'
                  : 'revoked',
            }
          : v
      ));
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDelete = (id) => {
    Modal.confirm({
      title: 'Delete this employee?',
      content: 'This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => remove(id),
    });
  };

  const filtered = list.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.full_name?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.employee_code?.toLowerCase().includes(q)
    );
  });

  const pending = filtered.filter((e) => getApprovalStatus(e) === 'pending');
  const approved = filtered.filter((e) => getApprovalStatus(e) === 'approved');
  const rejectedOrRevoked = filtered.filter((e) =>
    ['rejected', 'revoked'].includes(getApprovalStatus(e))
  );

  const columns = [
    {
      title: 'Employee',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text, row) => (
        <Space>
          <Avatar
            src={assetUrl(row.profile_picture)}
            icon={!row.profile_picture ? <UserOutlined /> : null}
            style={{
              backgroundColor: row.profile_picture ? undefined : '#065f46',
            }}
          />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500">{row.employee_code}</div>
          </div>
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Department',
      dataIndex: 'department_name',
      key: 'department_name',
      render: (v) => v || '—',
    },
    {
      title: 'Role',
      dataIndex: 'role_name',
      key: 'role_name',
      render: (v) => v || '—',
    },
    {
      title: 'Status',
      dataIndex: 'is_approved',
      key: 'is_approved',
      render: (_, row) => {
        const status = APPROVAL_STATUS_META[getApprovalStatus(row)];
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, row) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openView(row)}
        >
          View
        </Button>
      ),
    },
  ];

  // Mobile card renderer
  const renderMobileCard = (row) => (
    <Card
      key={row.id}
      size="small"
      className="shadow-sm mb-3"
      title={
        <Space>
          <Avatar
            src={assetUrl(row.profile_picture)}
            icon={!row.profile_picture ? <UserOutlined /> : null}
            style={{
              backgroundColor: row.profile_picture ? undefined : '#065f46',
            }}
          />
          <div>
            <div className="font-medium">{row.full_name}</div>
            <div className="text-xs text-gray-500">{row.employee_code}</div>
          </div>
        </Space>
      }
      extra={
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openView(row)}
        >
          View
        </Button>
      }
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <div className="text-sm">
          <Text type="secondary">Email: </Text>
          {row.email}
        </div>
        <div className="text-sm">
          <Text type="secondary">Department: </Text>
          {row.department_name || '—'}
        </div>
        <div className="text-sm">
          <Text type="secondary">Role: </Text>
          {row.role_name || '—'}
        </div>
        <Space size={8} wrap>
          <Tag color={row.system_role === 'admin' ? 'gold' : 'blue'}>
            {row.system_role === 'admin' ? 'Admin' : 'Employee'}
          </Tag>
          <Tag color={APPROVAL_STATUS_META[getApprovalStatus(row)].color}>
            {APPROVAL_STATUS_META[getApprovalStatus(row)].label}
          </Tag>
        </Space>
      </Space>
    </Card>
  );

  const renderList = (data, emptyText) => {
    if (isMobile) {
      if (loading) return <div className="text-center p-6"><Text type="secondary">Loading...</Text></div>;
      if (!data.length) return <div className="text-center p-6"><Text type="secondary">{emptyText}</Text></div>;
      return <div>{data.map(renderMobileCard)}</div>;
    }
    return (
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText }}
      />
    );
  };

  // Footer for the view modal — actions depend on status
  const viewFooter = () => {
    if (!viewing) return null;
    const approvalStatus = getApprovalStatus(viewing);
    return (
      <Space>
        <Button onClick={closeView}>Close</Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          loading={actionLoading}
          onClick={() => confirmDelete(viewing.id)}
        >
          Delete
        </Button>
        {approvalStatus === 'approved' ? (
          <Button
            icon={<CloseOutlined />}
            loading={actionLoading}
            onClick={() => decideApproval(viewing.id, 'revoke')}
          >
            Revoke approval
          </Button>
        ) : approvalStatus === 'pending' ? (
          <>
            <Button
              danger
              icon={<CloseOutlined />}
              loading={actionLoading}
              onClick={() => decideApproval(viewing.id, 'reject')}
            >
              Reject registration
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={actionLoading}
              onClick={() => decideApproval(viewing.id, 'approve')}
            >
              Approve
            </Button>
          </>
        ) : (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={actionLoading}
            onClick={() => decideApproval(viewing.id, 'approve')}
          >
            Approve again
          </Button>
        )}
      </Space>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Employees
          </Title>
          <Text type="secondary">
            Manage staff accounts and approve pending registrations
          </Text>
        </div>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search name / email / code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: isMobile ? 180 : 260 }}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          <Button type="primary" icon={<UserAddOutlined />} onClick={openAdd}>
            {!isMobile && 'Add Employee'}
          </Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={6}>
          <Card variant="borderless" className="shadow-sm">
            <Statistic title="Total Employees" value={list.length} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card variant="borderless" className="shadow-sm">
            <Statistic
              title="Approved"
              value={list.filter((e) => getApprovalStatus(e) === 'approved').length}
              styles={{ content: { color: '#16a34a' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card variant="borderless" className="shadow-sm">
            <Statistic
              title="Pending Approval"
              value={list.filter((e) => getApprovalStatus(e) === 'pending').length}
              styles={{ content: { color: '#d97706' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card variant="borderless" className="shadow-sm">
            <Statistic
              title="Rejected / Revoked"
              value={list.filter((e) => ['rejected', 'revoked'].includes(getApprovalStatus(e))).length}
              styles={{ content: { color: '#dc2626' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Card variant="borderless" className="shadow-sm">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'approved',
              label: (
                <span>
                  Approved{' '}
                  <Badge count={approved.length} showZero color="#16a34a" />
                </span>
              ),
              children: renderList(approved, 'No approved employees yet'),
            },
            {
              key: 'pending',
              label: (
                <span>
                  Pending{' '}
                  <Badge count={pending.length} showZero color="#d97706" />
                </span>
              ),
              children: renderList(pending, 'No pending registrations'),
            },
            {
              key: 'declined',
              label: (
                <span>
                  Rejected / revoked{' '}
                  <Badge count={rejectedOrRevoked.length} showZero color="#dc2626" />
                </span>
              ),
              children: renderList(rejectedOrRevoked, 'No rejected or revoked accounts'),
            },
          ]}
        />
      </Card>

      {/* Add modal */}
      <Modal
        title="Add Employee"
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Save"
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ system_role: 'employee' }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Staff ID"
                name="employee_code"
                rules={[{ required: true, message: 'Staff ID is required' }]}
              >
                <Input placeholder="ASK-002" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Full Name"
                name="full_name"
                rules={[{ required: true, message: 'Name is required' }]}
              >
                <Input placeholder="Jane Doe" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, message: 'Email is required' },
                  { type: 'email', message: 'Enter a valid email' },
                ]}
              >
                <Input placeholder="jane@askagro.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Password is required' }]}
              >
                <Input.Password placeholder="Temp password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Phone" name="phone">
                <Input placeholder="+254..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Gender"
                name="gender"
                rules={[{ required: true, message: 'Select gender' }]}
              >
                <Select placeholder="Choose...">
                  <Option value="male">Male</Option>
                  <Option value="female">Female</Option>
                  <Option value="other">Other</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Department"
                name="department_id"
                rules={[{ required: true, message: 'Select department' }]}
              >
                <Select placeholder="Choose..." onChange={onDepartmentChange} allowClear>
                  {departments.map((d) => (
                    <Option key={d.id} value={d.id}>{d.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Role"
                name="role_id"
                rules={[{ required: true, message: 'Select role' }]}
              >
                <Select
                  placeholder={roles.length ? 'Choose...' : 'Pick department first'}
                  disabled={!roles.length}
                  allowClear
                >
                  {roles.map((r) => (
                    <Option key={r.id} value={r.id}>{r.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="System Role" name="system_role">
                <Select>
                  <Option value="employee">Employee (login)</Option>
                  <Option value="admin">Admin (login)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* View employee modal */}
      <Modal
        open={!!viewing}
        onCancel={closeView}
        footer={viewFooter()}
        centered
        width={screens.lg ? 900 : 'calc(100vw - 24px)'}
        destroyOnClose
        title={
          viewing && (
            <Space>
              <Avatar
                size={40}
                src={assetUrl(viewing.profile_picture)}
                icon={!viewing.profile_picture ? <UserOutlined /> : null}
                style={{
                  backgroundColor: viewing.profile_picture ? undefined : '#065f46',
                }}
              />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {viewing.full_name}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {viewing.employee_code}
                </Text>
              </div>
              <Tag
                color={APPROVAL_STATUS_META[getApprovalStatus(viewing)].color}
                style={{ marginLeft: 8 }}
              >
                {APPROVAL_STATUS_META[getApprovalStatus(viewing)].label}
              </Tag>
            </Space>
          )
        }
      >
        {viewing && (
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 }}>
            {/* Identity / contact block */}
            <Card size="small" variant="borderless" style={{ background: '#f8fafc' }}>
              <Descriptions
                column={isMobile ? 1 : 2}
                size="small"
                colon={false}
                labelStyle={{ width: 130 }}
              >
                <Descriptions.Item
                  label={<><MailOutlined /> Email</>}
                >
                  {viewing.email}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><PhoneOutlined /> Phone</>}
                >
                  {viewing.phone || '—'}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><UserOutlined /> Gender</>}
                >
                  {viewing.gender || '—'}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><ApartmentOutlined /> Department</>}
                >
                  {viewing.department_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><SafetyOutlined /> Role</>}
                >
                  {viewing.role_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><SafetyOutlined /> System</>}
                >
                  <Tag color={viewing.system_role === 'admin' ? 'gold' : 'blue'}>
                    {viewing.system_role === 'admin' ? 'Admin' : 'Employee'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item
                  label={<><ClockCircleOutlined /> Status</>}
                >
                  <Tag color={APPROVAL_STATUS_META[getApprovalStatus(viewing)].color}>
                    {APPROVAL_STATUS_META[getApprovalStatus(viewing)].label}
                  </Tag>
                </Descriptions.Item>
                {viewing.created_at && (
                  <Descriptions.Item label="Joined" span={isMobile ? 1 : 2}>
                    {dayjs(viewing.created_at).format('YYYY-MM-DD HH:mm')}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            <Divider style={{ margin: 0 }} />

            {/* Extra detail — admin can decide here */}
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Use the actions below to approve, reject, revoke, or delete this employee.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}