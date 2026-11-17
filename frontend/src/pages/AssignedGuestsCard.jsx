import { useEffect, useState } from 'react';
import { Card, List, Tag, Button, message, Empty, Badge, Space } from 'antd';
import { CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import api from '../api/axios';

const STATUS_COLOR = {
  assigned: 'cyan',
  accepted: 'blue',
  completed: 'green',
  cancelled: 'red',
};

export default function AssignedGuestsCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/guests/mine');
      setRows(data);
    } catch (e) {
      message.error(e.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const setStatus = async (id, status) => {
    try {
      await api.put(`/guests/${id}/status`, { status });
      message.success(`Marked ${status}`);
      load();
    } catch (e) {
      message.error(e.response?.data?.message || 'Failed');
    }
  };

  const assignedCount = rows.filter((r) => r.assignment_status === 'assigned').length;

  return (
    <Card
      title={
        <Space>
          <span>My Assigned Guests</span>
          {assignedCount > 0 && (
            <Badge count={assignedCount} style={{ backgroundColor: '#0891b2' }} />
          )}
        </Space>
      }
      extra={<Button size="small" onClick={load} loading={loading}>Refresh</Button>}
      bordered={false}
      className="shadow-sm"
    >
      {rows.length === 0 ? (
        <Empty description="No guests assigned to you yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={rows}
          renderItem={(g) => (
            <List.Item
              actions={[
                g.assignment_status === 'assigned' && (
                  <Button key="accept" type="primary" size="small" icon={<CheckOutlined />}
                    onClick={() => setStatus(g.id, 'accepted')}>
                    Confirm
                  </Button>
                ),
                g.assignment_status === 'accepted' && (
                  <Button key="done" size="small" onClick={() => setStatus(g.id, 'completed')}>
                    Complete
                  </Button>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <span>
                    {g.full_name}
                    <Tag color={STATUS_COLOR[g.assignment_status]} style={{ marginLeft: 8 }}>
                      {g.assignment_status}
                    </Tag>
                    <Tag color="cyan">{g.service_name}</Tag>
                  </span>
                }
                description={
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    <ClockCircleOutlined /> Assigned{' '}
                    {g.assigned_at ? new Date(g.assigned_at).toLocaleString() : '—'}
                    {g.phone && ` · ${g.phone}`}
                    {g.purpose && ` · ${g.purpose}`}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}