import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Grid, Input,
  Modal, Popconfirm, Row, Col, Space, Statistic, Table, Tag, Typography, message,
} from 'antd';
import {
  CalendarOutlined, CheckOutlined, ClockCircleOutlined, CloseOutlined,
  EyeOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const STATUS_COLORS = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};

function formatDate(value) {
  return value ? dayjs(value).format('DD MMM YYYY') : '—';
}

function formatDateTime(value) {
  return value ? dayjs(value).format('DD MMM YYYY · HH:mm') : '—';
}

export default function LeaveRequests({ admin = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [requestForm] = Form.useForm();
  const [decisionForm] = Form.useForm();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = admin
        ? await api.get('/leave-requests/admin')
        : await api.get('/leave-requests/mine');
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load absence requests');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRequest = async () => {
    try {
      const values = await requestForm.validateFields();
      setSubmitting(true);
      await api.post('/leave-requests', {
        start_date: values.dates[0].format('YYYY-MM-DD'),
        end_date: values.dates[1].format('YYYY-MM-DD'),
        reason: values.reason.trim(),
      });
      message.success('Your request has been sent to the admin for approval');
      setRequestOpen(false);
      requestForm.resetFields();
      load();
    } catch (err) {
      if (err?.response) {
        message.error(err.response?.data?.message || 'Failed to submit request');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (id) => {
    try {
      await api.delete(`/leave-requests/${id}`);
      message.success('Request cancelled');
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to cancel request');
    }
  };

  const decide = async (decision) => {
    if (!viewing) return;
    setDecisionBusy(true);
    try {
      const values = await decisionForm.validateFields();
      await api.put(`/leave-requests/${viewing.id}/decision`, {
        decision,
        admin_note: values.admin_note?.trim() || '',
      });
      message.success(decision === 'approved' ? 'Absence request approved' : 'Request rejected');
      setViewing(null);
      decisionForm.resetFields();
      load();
    } catch (err) {
      if (err?.response) {
        message.error(err.response?.data?.message || 'Failed to process request');
      }
    } finally {
      setDecisionBusy(false);
    }
  };

  const openDetails = (row) => {
    setViewing(row);
    decisionForm.setFieldsValue({ admin_note: row.admin_note || '' });
  };

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === 'pending').length,
    approved: rows.filter((row) => row.status === 'approved').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
  }), [rows]);

  // ══════════════════════════════════════════════════════════
  //  TABLE COLUMNS — no reason column, no horizontal scroll.
  // ══════════════════════════════════════════════════════════
  const columns = [
    ...(admin
      ? [
          {
            title: 'Employee',
            key: 'employee',
            render: (_, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {row.employee_code}
                  {row.department_name ? ` · ${row.department_name}` : ''}
                </Text>
              </div>
            ),
          },
        ]
      : []),
    {
      title: 'Dates requested',
      key: 'dates',
      render: (_, row) => {
        const days =
          dayjs(row.end_date).diff(dayjs(row.start_date), 'day') + 1;
        return (
          <div>
            <div>
              {formatDate(row.start_date)} – {formatDate(row.end_date)}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {days} day{days === 1 ? '' : 's'}
            </Text>
          </div>
        );
      },
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      render: formatDateTime,
      responsive: ['md'],
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => (
        <Tag color={STATUS_COLORS[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      width: admin ? 180 : 150,
      render: (_, row) => (
        <Space size={4}>
          <Button
            icon={<EyeOutlined />}
            size="small"
            onClick={() => openDetails(row)}
          >
            {!isMobile && 'View'}
          </Button>
          {admin && row.status === 'pending' && (
            <Button
              type="primary"
              size="small"
              icon={<SafetyCertificateOutlined />}
              onClick={() => openDetails(row)}
            >
              {!isMobile && 'Review'}
            </Button>
          )}
          {!admin && row.status === 'pending' && (
            <Popconfirm
              title="Cancel this absence request?"
              onConfirm={() => cancelRequest(row.id)}
              okText="Cancel request"
              cancelText="Keep request"
            >
              <Button danger size="small" icon={<CloseOutlined />}>
                {!isMobile && 'Cancel'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const pendingTotal = admin
    ? stats.pending
    : rows.filter((row) => row.status === 'pending').length;
  const approvedTotal = admin
    ? stats.approved
    : rows.filter((row) => row.status === 'approved').length;
  const visibleRows =
    admin && statusFilter !== 'all'
      ? rows.filter((row) => row.status === statusFilter)
      : rows;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            {admin ? 'Employee Absence Requests' : 'Request Time Off'}
          </Title>
          <Text type="secondary">
            {admin
              ? 'Review employee requests and record approved leave in attendance.'
              : 'Let your administrator know when you are unable to attend work.'}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          {!admin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setRequestOpen(true)}
            >
              Request absence
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title={admin ? 'Requests shown' : 'My requests'}
              value={stats.total}
              prefix={<CalendarOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Awaiting review"
              value={pendingTotal}
              prefix={<ClockCircleOutlined style={{ color: '#d97706' }} />}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Approved"
              value={approvedTotal}
              prefix={<CheckOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
      </Row>

      {admin && (
        <Card bordered={false} className="shadow-sm mb-4">
          <Space wrap>
            <Text strong>Show:</Text>
            {['pending', 'approved', 'rejected', 'all'].map((status) => (
              <Button
                key={status}
                type={statusFilter === status ? 'primary' : 'default'}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all'
                  ? 'All requests'
                  : status[0].toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </Space>
        </Card>
      )}

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visibleRows}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{
            emptyText: (
              <Empty
                description={
                  admin
                    ? 'No absence requests to show'
                    : 'You have not submitted an absence request'
                }
              />
            ),
          }}
        />
      </Card>

      {/* ── Submit request modal (employee) ── */}
      <Modal
        open={requestOpen}
        title="Submit an absence request"
        onCancel={() => setRequestOpen(false)}
        onOk={submitRequest}
        confirmLoading={submitting}
        okText="Send for approval"
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 600}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="Your request must be approved by an administrator."
          description="Once approved, the requested dates will be recorded as leave in your attendance history."
          style={{ marginBottom: 20 }}
        />
        <Form form={requestForm} layout="vertical" requiredMark="optional">
          <Form.Item
            label="Dates you will be absent"
            name="dates"
            rules={[{ required: true, message: 'Select the start and end dates' }]}
            extra="Requests must be for today or a future date and may cover up to 366 days."
          >
            <RangePicker
              style={{ width: '100%' }}
              format="DD MMM YYYY"
              disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
            />
          </Form.Item>
          <Form.Item
            label="Reason"
            name="reason"
            rules={[
              { required: true, whitespace: true, message: 'Please provide a reason' },
              { max: 2000, message: 'Reason must be 2000 characters or fewer' },
            ]}
          >
            <TextArea
              rows={4}
              maxLength={2000}
              showCount
              placeholder="Explain why you will be unable to attend work"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Detail / review modal (reason lives here) ── */}
      <Modal
        open={!!viewing}
        title={admin ? 'Review absence request' : 'Absence request details'}
        onCancel={() => setViewing(null)}
        footer={
          admin && viewing?.status === 'pending' ? (
            [
              <Button key="close" onClick={() => setViewing(null)}>
                Close
              </Button>,
              <Popconfirm
                key="reject"
                title="Reject this absence request?"
                description="The employee will see this decision."
                onConfirm={() => decide('rejected')}
                okText="Reject request"
                cancelText="Go back"
              >
                <Button danger loading={decisionBusy} icon={<CloseOutlined />}>
                  Reject
                </Button>
              </Popconfirm>,
              <Button
                key="approve"
                type="primary"
                loading={decisionBusy}
                icon={<CheckOutlined />}
                onClick={() => decide('approved')}
              >
                Approve
              </Button>,
            ]
          ) : (
            <Button onClick={() => setViewing(null)}>Close</Button>
          )
        }
        centered
        width={screens.lg ? 900 : 'calc(100vw - 24px)'}
      >
        {viewing && (
          <div
            style={{
              maxHeight: 'calc(100vh - 220px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <Descriptions
              title="Request details"
              column={isMobile ? 1 : 2}
              size="small"
              bordered
              labelStyle={{ width: 150, background: '#f8fafc', fontWeight: 600 }}
            >
              {admin && (
                <>
                  <Descriptions.Item label="Employee">
                    {viewing.full_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="Staff ID">
                    {viewing.employee_code}
                  </Descriptions.Item>
                  <Descriptions.Item label="Department">
                    {viewing.department_name || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email">
                    {viewing.email || '—'}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="Date range">
                {formatDate(viewing.start_date)} – {formatDate(viewing.end_date)}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {dayjs(viewing.end_date).diff(dayjs(viewing.start_date), 'day') + 1}{' '}
                day(s)
              </Descriptions.Item>
              <Descriptions.Item label="Submitted">
                {formatDateTime(viewing.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[viewing.status]}>
                  {viewing.status.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Reason" span={isMobile ? 1 : 2}>
                {viewing.reason ? (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      color: '#0f172a',
                    }}
                  >
                    {viewing.reason}
                  </div>
                ) : (
                  <Text type="secondary">No reason provided</Text>
                )}
              </Descriptions.Item>
              {viewing.decided_at && (
                <>
                  <Descriptions.Item label="Reviewed by">
                    {viewing.decided_by_name || 'Administrator'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Reviewed on">
                    {formatDateTime(viewing.decided_at)}
                  </Descriptions.Item>
                </>
              )}
              {viewing.admin_note && (
                <Descriptions.Item label="Admin note" span={isMobile ? 1 : 2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{viewing.admin_note}</div>
                </Descriptions.Item>
              )}
            </Descriptions>

            {admin && viewing.status === 'pending' && (
              <Form
                form={decisionForm}
                layout="vertical"
                style={{ marginTop: 16 }}
              >
                <Form.Item
                  label="Note to employee (optional)"
                  name="admin_note"
                  rules={[{ max: 2000, message: 'Note must be 2000 characters or fewer' }]}
                >
                  <TextArea
                    rows={3}
                    maxLength={2000}
                    showCount
                    placeholder="Add an explanation or instructions for the employee"
                  />
                </Form.Item>
              </Form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}