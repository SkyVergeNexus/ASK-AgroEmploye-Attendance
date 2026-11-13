import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Modal, Input, Tabs, Badge,
  message, Grid, Empty, Alert, Avatar, Divider,
} from 'antd';
import {
  ReloadOutlined, CheckOutlined, CloseOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const statusColor = { pending: 'gold', approved: 'green', rejected: 'red' };

export default function EarlyLeaveRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

  // View modal state
  const [viewing, setViewing] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/early-leave/all');
      setRows(data || []);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openView = (row) => {
    setViewing(row);
    setAdminNote(row.admin_note || '');
  };

  const closeView = () => {
    setViewing(null);
    setAdminNote('');
  };

  const submitDecision = async (approve) => {
    if (!viewing) return;
    setSaving(true);
    try {
      await api.put(
        `/attendance/early-leave/${viewing.id}/decide`,
        { approve, admin_note: adminNote.trim() || null }
      );
      message.success(approve ? 'Request approved' : 'Request rejected');
      closeView();
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Columns (no Reason column) ──────────────────────────
  const columns = [
    {
      title: 'Employee',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (t, r) => (
        <Space>
          <Avatar
            size={36}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#065f46' }}
          />
          <div>
            <div className="font-medium">{t}</div>
            <div className="text-xs text-gray-500">{r.employee_code}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Requested Out',
      dataIndex: 'requested_out_time',
      key: 'requested_out_time',
      width: 130,
      render: (v) => (
        <Space size={4}>
          <ClockCircleOutlined style={{ color: '#d97706' }} />
          <Text strong>{v || '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v) => <Tag color={statusColor[v]}>{v}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'right',
      render: (_, row) => (
        <Button
          type="primary"
          size="small"
          ghost
          icon={<EyeOutlined />}
          onClick={() => openView(row)}
        >
          View
        </Button>
      ),
    },
  ];

  const pending = rows.filter((r) => r.status === 'pending');
  const approved = rows.filter((r) => r.status === 'approved');
  const rejected = rows.filter((r) => r.status === 'rejected');

  const renderTable = (data, emptyText) => (
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

  // ── Modal footer ────────────────────────────────────────
  const modalFooter = () => {
    if (!viewing) return null;
    if (viewing.status === 'pending') {
      return (
        <Space>
          <Button onClick={closeView}>Close</Button>
          <Button
            danger
            icon={<CloseOutlined />}
            loading={saving}
            onClick={() => submitDecision(false)}
          >
            Reject
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={saving}
            onClick={() => submitDecision(true)}
          >
            Approve
          </Button>
        </Space>
      );
    }
    return <Button onClick={closeView}>Close</Button>;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Early Clock-Out Requests
          </Title>
          <Text type="secondary">
            Review employee requests to leave before closing time
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {!isMobile && 'Refresh'}
        </Button>
      </div>

      {/* Pending alert */}
      {pending.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: 16 }}
          message={`${pending.length} request${pending.length === 1 ? '' : 's'} awaiting your decision`}
          description="Employees cannot clock out early until you approve their request."
        />
      )}

      {/* Tabs + tables */}
      <Card bordered={false} className="shadow-sm">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'pending',
              label: (
                <span>
                  Pending <Badge count={pending.length} showZero color="#d97706" />
                </span>
              ),
              children:
                pending.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No pending requests"
                  />
                ) : (
                  renderTable(pending, 'No pending requests')
                ),
            },
            {
              key: 'approved',
              label: (
                <span>
                  Approved{' '}
                  <Badge count={approved.length} showZero color="#16a34a" />
                </span>
              ),
              children:
                approved.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No approved requests yet"
                  />
                ) : (
                  renderTable(approved, 'No approved requests')
                ),
            },
            {
              key: 'rejected',
              label: (
                <span>
                  Rejected{' '}
                  <Badge count={rejected.length} showZero color="#dc2626" />
                </span>
              ),
              children:
                rejected.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No rejected requests yet"
                  />
                ) : (
                  renderTable(rejected, 'No rejected requests')
                ),
            },
          ]}
        />
      </Card>

      {/* Detail modal */}
      <Modal
        open={!!viewing}
        title={
          viewing && (
            <Space>
              <Avatar
                icon={<UserOutlined />}
                style={{ backgroundColor: '#065f46' }}
              />
              <span>Request from {viewing.full_name}</span>
              <Tag color={statusColor[viewing.status]}>{viewing.status}</Tag>
            </Space>
          )
        }
        onCancel={closeView}
        footer={modalFooter()}
        centered
        width={560}
        destroyOnClose
      >
        {viewing && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Header message */}
            <Alert
              type={
                viewing.status === 'pending'
                  ? 'warning'
                  : viewing.status === 'approved'
                  ? 'success'
                  : 'error'
              }
              showIcon
              message={
                viewing.status === 'pending'
                  ? `Request from ${viewing.full_name} to leave early`
                  : viewing.status === 'approved'
                  ? 'Request was approved'
                  : 'Request was rejected'
              }
              description={
                viewing.status === 'pending'
                  ? 'You can approve or reject this request below.'
                  : viewing.decided_at
                  ? `Decided ${dayjs(viewing.decided_at).format('YYYY-MM-DD HH:mm')}`
                  : undefined
              }
            />

            {/* Employee block */}
            <div>
              <Text type="secondary">Employee</Text>
              <div>
                <Text strong>{viewing.full_name}</Text>{' '}
                <Text type="secondary">({viewing.employee_code})</Text>
              </div>
            </div>

            {/* Requested out */}
            <div>
              <Text type="secondary">Requested clock-out time</Text>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#d97706' }}>
                {viewing.requested_out_time}
              </div>
            </div>

            {/* Reason block — only visible in modal now */}
            <div>
              <Text type="secondary">Reason given by employee</Text>
              <div
                style={{
                  marginTop: 4,
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {viewing.reason}
              </div>
            </div>

            {/* Submitted */}
            <div>
              <Text type="secondary">Submitted</Text>
              <div>
                {dayjs(viewing.created_at).format('YYYY-MM-DD HH:mm')}
              </div>
            </div>

            {viewing.status === 'pending' && (
              <>
                <Divider style={{ margin: 0 }} />
                <div>
                  <Text type="secondary">Note to employee (optional)</Text>
                  <TextArea
                    rows={3}
                    style={{ marginTop: 4 }}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="e.g. Approved, take care. / Please finish your shift."
                    maxLength={500}
                    showCount
                  />
                </div>
              </>
            )}

            {viewing.status !== 'pending' && viewing.admin_note && (
              <>
                <Divider style={{ margin: 0 }} />
                <div>
                  <Text type="secondary">Your note</Text>
                  <div
                    style={{
                      marginTop: 4,
                      padding: '8px 12px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    {viewing.admin_note}
                  </div>
                </div>
              </>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}