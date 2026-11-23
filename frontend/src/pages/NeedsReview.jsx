import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Card, Table, Button, Typography, Space, Modal, message,
  Row, Col, Alert, Empty, Statistic, Badge, Avatar,
} from 'antd';
import {
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, PhoneOutlined,
  MailOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;

export default function NeedsReview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/needs-review');
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const resolve = async (row, decision) => {
    if (!row) return;
    setBusy(true);
    setResolvingId(row.id);
    try {
      await api.put(`/attendance/${row.id}/resolve-review`, {
        decision,
      });
      message.success(`Marked as ${decision}`);
      setViewing(null);
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to resolve');
    } finally {
      setBusy(false);
      setResolvingId(null);
    }
  };

  const columns = [
    {
      title: 'Decision',
      key: 'actions',
      width: 170,
      fixed: 'left',
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={busy && resolvingId === r.id}
            disabled={busy}
            onClick={() => resolve(r, 'present')}
          >
            Mark present
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            disabled={busy}
            onClick={() => resolve(r, 'absent')}
          >
            Mark absent
          </Button>
          <Button
            size="small"
            type="link"
            style={{ paddingInline: 0, height: 24 }}
            onClick={() => setViewing(r)}
          >
            Contact details
          </Button>
        </Space>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'attendance_date',
      key: 'attendance_date',
      width: 130,
      render: (v) => String(v).slice(0, 10),
      sorter: (a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Employee',
      key: 'employee',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={32} icon={<UserOutlined />} style={{ background: '#065f46', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.full_name}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {r.employee_code}{r.department ? ` · ${r.department}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Clocked in',
      dataIndex: 'clock_in',
      key: 'clock_in',
      width: 110,
      render: (v) => v || '—',
    },
    {
      title: 'Why it was flagged',
      dataIndex: 'review_note',
      key: 'review_note',
      render: (v) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v || 'Could not be verified at close of day'}
        </Text>
      ),
    },
  ];

  const summary = useMemo(() => ({
    count: rows.length,
    oldest: rows.length ? rows[rows.length - 1].attendance_date : null,
  }), [rows]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Missed Clock-Outs — Needs Review
          </Title>
          <Text type="secondary">
            Employees who never clocked out and could not be verified at close of day.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Call the employee first, then choose Mark present or Mark absent in the first column."
        description="Your choice is saved immediately. Do not record the reason in the system — the call is offline."
      />

      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Awaiting review"
              value={summary.count}
              prefix={<Badge status="warning" />}
              valueStyle={{ color: '#d97706', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Oldest"
              value={summary.oldest ? dayjs(summary.oldest).format('DD MMM YYYY') : '—'}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="Nothing to review — all caught up" /> }}
        />
      </Card>

      <Modal
        open={!!viewing}
        title="Resolve missed clock-out"
        onCancel={() => setViewing(null)}
        footer={
          <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setViewing(null)}>Close</Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              disabled={busy}
              onClick={() => resolve(viewing, 'absent')}
            >
              Mark absent
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={busy}
              onClick={() => resolve(viewing, 'present')}
            >
              Mark present
            </Button>
          </Space>
        }
        centered
        width={520}
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
      >
        {viewing && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar size={36} icon={<UserOutlined />} style={{ background: '#065f46' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{viewing.full_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {viewing.employee_code}
                    {viewing.department ? ` · ${viewing.department}` : ''}
                    {' · '}
                    {dayjs(viewing.attendance_date).format('DD MMM YYYY')}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
                <div>Clocked in at <strong>{viewing.clock_in || '—'}</strong></div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Flagged because: </Text>
                  <Text style={{ fontSize: 12 }}>
                    {viewing.review_note || 'Could not be verified at close of day'}
                  </Text>
                </div>
              </div>
            </Card>

            {(viewing.phone || viewing.email) && (
              <Alert
                type="info"
                showIcon
                icon={<PhoneOutlined />}
                message="Contact the employee before deciding"
                description={
                  <Space direction="vertical" size={2}>
                    {viewing.phone && (
                      <span>
                        <PhoneOutlined style={{ marginRight: 6 }} />
                        <strong>{viewing.phone}</strong>
                      </span>
                    )}
                    {viewing.email && (
                      <span>
                        <MailOutlined style={{ marginRight: 6 }} />
                        {viewing.email}
                      </span>
                    )}
                  </Space>
                }
              />
            )}

          </Space>
        )}
      </Modal>

    </div>
  );
}