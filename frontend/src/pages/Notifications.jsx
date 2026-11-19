import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Avatar, Button, Card, Col, Empty, List, Pagination, Row, Space,
  Statistic, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  BellOutlined, CheckOutlined, ClockCircleOutlined, MailOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { formatRelativeTime, getNotificationMeta } from '../components/notificationUtils.jsx';

const { Text, Title } = Typography;
const PAGE_SIZE = 15;

function formatExactTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/notifications', {
        params: {
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          unread: filter === 'unread' ? 'true' : undefined,
        },
      });
      setItems(data.items || []);
      setTotalCount(Number(data.total_count) || 0);
      setFilteredCount(Number(data.filtered_count) || 0);
      setUnreadCount(Number(data.unread_count) || 0);
    } catch (error) {
      setLoadError(error.response?.data?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    const timer = window.setTimeout(loadNotifications, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  const markRead = async (item) => {
    if (item.read_at) return true;
    setBusyId(item.id);
    try {
      await api.put(`/notifications/${item.id}/read`);
      const nextFilteredCount = Math.max(0, filteredCount - 1);
      if (filter === 'unread' && page > Math.max(1, Math.ceil(nextFilteredCount / PAGE_SIZE))) {
        setFilteredCount(nextFilteredCount);
        setPage(Math.max(1, Math.ceil(nextFilteredCount / PAGE_SIZE)));
      } else {
        await loadNotifications();
      }
      return true;
    } catch (error) {
      message.error(error.response?.data?.message || 'Unable to mark notification as read.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openNotification = async (item) => {
    if (!(await markRead(item))) return;
    if (item.target_path) navigate(item.target_path);
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    setMarkingAll(true);
    try {
      await api.put('/notifications/read-all');
      message.success('All notifications marked as read.');
      if (page !== 1) {
        setPage(1);
      } else {
        await loadNotifications();
      }
    } catch (error) {
      message.error(error.response?.data?.message || 'Unable to mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const setActiveFilter = (nextFilter) => {
    if (filter === nextFilter) return;
    setFilter(nextFilter);
    setPage(1);
  };

  const readCount = Math.max(0, totalCount - unreadCount);
  const firstItem = filteredCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(page * PAGE_SIZE, filteredCount);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <Space align="start" size={16}>
          <Avatar
            shape="square"
            size={52}
            icon={<BellOutlined />}
            style={{
              background: '#ecfdf5',
              color: '#047857',
              border: '1px solid #d1fae5',
              borderRadius: 14,
              fontSize: 22,
            }}
          />
          <div>
            <Text
              style={{
                color: '#047857',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Your inbox
            </Text>
            <Title level={2} style={{ margin: '2px 0 3px', color: '#102a22' }}>
              Notifications
            </Title>
            <Text type="secondary">Important updates about your account and workplace.</Text>
          </div>
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadNotifications} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={markAllRead}
            disabled={!unreadCount}
            loading={markingAll}
            style={{ background: '#047857' }}
          >
            Mark all as read
          </Button>
        </Space>
      </div>

      <Row gutter={[14, 14]} style={{ marginBottom: 22 }}>
        {[
          { title: 'All notifications', value: totalCount, color: '#047857', icon: <BellOutlined /> },
          { title: 'Unread', value: unreadCount, color: '#b45309', icon: <MailOutlined /> },
          { title: 'Read', value: readCount, color: '#475569', icon: <CheckOutlined /> },
        ].map((stat) => (
          <Col key={stat.title} xs={24} sm={8}>
            <Card
              size="small"
              style={{ height: '100%', borderColor: '#e5eee9', borderRadius: 12 }}
              styles={{ body: { padding: '16px 18px' } }}
            >
              <Statistic
                title={<Text type="secondary">{stat.title}</Text>}
                value={stat.value}
                prefix={<span style={{ color: stat.color, marginRight: 4 }}>{stat.icon}</span>}
                valueStyle={{ color: '#102a22', fontSize: 25, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        styles={{ body: { padding: 0 } }}
        style={{ borderColor: '#e5eee9', borderRadius: 14, overflow: 'hidden' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            padding: '16px 20px',
            borderBottom: '1px solid #edf2ef',
          }}
        >
          <div>
            <Text strong style={{ color: '#102a22', fontSize: 15 }}>Recent activity</Text>
            <div style={{ marginTop: 3 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {filteredCount ? `Showing ${firstItem}–${lastItem} of ${filteredCount}` : 'Your latest updates will appear here.'}
              </Text>
            </div>
          </div>
          <Space size={6}>
            <Button
              type={filter === 'all' ? 'primary' : 'text'}
              onClick={() => setActiveFilter('all')}
              style={filter === 'all' ? { background: '#047857' } : undefined}
            >
              All
            </Button>
            <Button
              type={filter === 'unread' ? 'primary' : 'text'}
              onClick={() => setActiveFilter('unread')}
              style={filter === 'unread' ? { background: '#047857' } : undefined}
            >
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </Button>
          </Space>
        </div>

        {loadError && (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button size="small" onClick={loadNotifications}>Try again</Button>}
            style={{ margin: 16 }}
          />
        )}

        <List
          loading={loading}
          dataSource={items}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={filter === 'unread' ? 'You have no unread notifications.' : 'No notifications yet.'}
                style={{ padding: '34px 12px' }}
              />
            ),
          }}
          renderItem={(item) => {
            const meta = getNotificationMeta(item.event_type, item.title, item.message);
            const actionable = Boolean(item.target_path || !item.read_at);
            return (
              <List.Item
                onClick={actionable ? () => openNotification(item) : undefined}
                onKeyDown={actionable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openNotification(item);
                  }
                } : undefined}
                role={actionable ? 'button' : undefined}
                tabIndex={actionable ? 0 : undefined}
                style={{
                  padding: '18px 20px',
                  cursor: actionable ? 'pointer' : 'default',
                  background: item.read_at ? '#fff' : '#f5fbf7',
                  transition: 'background 150ms ease',
                }}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      shape="square"
                      size={42}
                      icon={meta.icon}
                      style={{
                        background: meta.background,
                        color: meta.color,
                        border: `1px solid ${meta.color}22`,
                        borderRadius: 12,
                        fontSize: 17,
                      }}
                    />
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text strong={!item.read_at} style={{ color: '#172b24' }}>{item.title}</Text>
                      {!item.read_at && <Tag color="green" style={{ marginInlineEnd: 0 }}>New</Tag>}
                    </div>
                  }
                  description={
                    <div style={{ marginTop: 4 }}>
                      {item.message && (
                        <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55, marginBottom: 7 }}>
                          {item.message}
                        </div>
                      )}
                      <Space size={6}>
                        <ClockCircleOutlined style={{ fontSize: 11 }} />
                        <Tooltip title={formatExactTime(item.created_at)}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatRelativeTime(item.created_at)}
                          </Text>
                        </Tooltip>
                        <Tag bordered={false} style={{ marginInlineStart: 4, color: meta.color, background: meta.background }}>
                          {meta.label}
                        </Tag>
                      </Space>
                    </div>
                  }
                />
                {!item.read_at && (
                  <Tooltip title="Mark as read">
                    <Button
                      type="text"
                      aria-label={`Mark ${item.title} as read`}
                      icon={<CheckOutlined />}
                      loading={busyId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        markRead(item);
                      }}
                      style={{ color: '#047857' }}
                    />
                  </Tooltip>
                )}
              </List.Item>
            );
          }}
        />

        {filteredCount > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #edf2ef' }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={filteredCount}
              onChange={setPage}
              showSizeChanger={false}
              showTotal={(total, range) => `${range[0]}–${range[1]} of ${total}`}
              size="small"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
