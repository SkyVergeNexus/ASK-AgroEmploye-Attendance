import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Card, Table, Button, Typography, Space, Modal, message,
  Row, Col, Alert, Empty, Statistic, Badge, Avatar, Input, Spin, Timeline,
} from 'antd';
import {
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, PhoneOutlined,
  MailOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;

const FALLBACK_REASON = 'Did not clock out within 24 hours of clock-in';

export default function NeedsReview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [presenceEvents, setPresenceEvents] = useState([]);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState('');

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

  useEffect(() => {
    if (!viewing) {
      setPresenceEvents([]);
      setDecisionReason('');
      return undefined;
    }
    let active = true;
    setPresenceLoading(true);
    api.get(`/attendance/presence/${viewing.id}/events`)
      .then(({ data }) => { if (active) setPresenceEvents(data); })
      .catch((err) => {
        if (active) message.error(err.response?.data?.message || 'Failed to load presence history');
      })
      .finally(() => { if (active) setPresenceLoading(false); });
    return () => { active = false; };
  }, [viewing]);

  const resolve = async (decision) => {
    if (!viewing) return;
    setBusy(true);
    try {
      await api.put(`/attendance/${viewing.id}/resolve-review`, {
        decision,
        reason: decisionReason.trim() || null,
      });
      message.success(`Marked as ${decision}`);
      setViewing(null);
      setConfirming(null);
      setDecisionReason('');
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to resolve');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: '',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Button
          size="small"
          type="primary"
          ghost
          onClick={() => setViewing(r)}
        >
          Review
        </Button>
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
      width: 170,
      render: (v, r) => {
        if (!v) return '—';
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {String(r.attendance_date).slice(0, 10)}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Why it was flagged',
      dataIndex: 'auto_clock_out_reason',
      key: 'auto_clock_out_reason',
      render: (v) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v || FALLBACK_REASON}
        </Text>
      ),
    },
  ];

  const summary = useMemo(() => {
    const oldest = rows.reduce((min, r) => {
      const d = String(r.attendance_date).slice(0, 10);
      return !min || d < min ? d : min;
    }, null);
    return { count: rows.length, oldest };
  }, [rows]);

  const flaggedAt = viewing
    ? dayjs(`${String(viewing.attendance_date).slice(0, 10)}T${viewing.clock_in || '00:00:00'}`)
        .add(24, 'hour')
        .format('DD MMM YYYY, HH:mm')
    : null;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Missed Clock-Outs — Needs Review
          </Title>
          <Text type="secondary">
            On-site employees who never clocked out within 24 hours of clock-in.
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
        message="Review before marking Present or Absent"
        description="These employees did not clock out within 24 hours of clock-in. Check any presence history below, contact the employee offline if needed, and record an optional note explaining your decision."
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
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="Nothing to review — all caught up" /> }}
        />
      </Card>

      <Modal
        open={!!viewing}
        title="Resolve missed clock-out"
        onCancel={() => { setViewing(null); setConfirming(null); }}
        footer={
          <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setViewing(null); setConfirming(null); }}>Cancel</Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              disabled={busy}
              onClick={() => setConfirming('absent')}
            >
              Mark absent
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={busy}
              onClick={() => setConfirming('present')}
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
                <div>
                  Clocked in at <strong>{viewing.clock_in || '—'}</strong> on{' '}
                  <strong>{dayjs(viewing.attendance_date).format('DD MMM YYYY')}</strong>
                </div>
                {flaggedAt && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Flagged after 24h with no clock-out — since {flaggedAt}
                    </Text>
                  </div>
                )}
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Reason: </Text>
                  <Text style={{ fontSize: 12 }}>
                    {viewing.auto_clock_out_reason || FALLBACK_REASON}
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

            <Card size="small" title="Recorded presence events">
              {presenceLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <Spin />
                </div>
              ) : presenceEvents.length ? (
                <Timeline
                  items={presenceEvents.map((event) => {
                    const eventLabel = event.event_type === 'departure'
                      ? 'Left the monitored area'
                      : event.event_type === 'return'
                        ? 'Returned to the monitored area'
                        : 'Presence first verified';
                    const gpsLabel = event.gps_inside == null
                      ? 'GPS unavailable'
                      : Number(event.gps_inside) ? 'GPS inside' : 'GPS outside';
                    const networkLabel = event.network_inside == null
                      ? 'Office network unavailable'
                      : Number(event.network_inside) ? 'Office network matched' : 'Office network did not match';
                    return {
                      color: event.event_type === 'departure' ? 'orange' : 'green',
                      children: (
                        <div>
                          <Text strong>{eventLabel}</Text>
                          <div>{dayjs(event.event_at).format('DD MMM YYYY, HH:mm:ss')}</div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {gpsLabel} · {networkLabel}
                          </Text>
                          {event.latitude != null && event.longitude != null && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                GPS: {Number(event.latitude).toFixed(5)}, {Number(event.longitude).toFixed(5)}
                              </Text>
                            </div>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                <Text type="secondary">
                  No boundary events were recorded — the employee app may have been closed before the 24h window elapsed.
                </Text>
              )}
            </Card>
          </Space>
        )}
      </Modal>

      <Modal
        open={!!confirming}
        title="Confirm attendance decision"
        centered
        okText={confirming === 'absent' ? 'Confirm absent' : 'Confirm present'}
        cancelText="Go back"
        confirmLoading={busy}
        onCancel={() => setConfirming(null)}
        onOk={() => resolve(confirming)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text>
            Confirm marking {viewing?.full_name || 'this employee'} as {confirming}.
            The decision and timestamp will be recorded in attendance history.
          </Text>
          <Input.TextArea
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            placeholder="Reason (optional)"
            maxLength={2000}
            autoSize={{ minRows: 3, maxRows: 6 }}
            showCount
          />
        </Space>
      </Modal>
    </div>
  );
}