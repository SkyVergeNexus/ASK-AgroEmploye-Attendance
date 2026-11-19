import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Empty, List, Popover, Space, Spin, Tooltip, Typography, message,
} from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const { Text } = Typography;

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.items || []);
      setUnreadCount(Number(data.unread_count) || 0);
      setLoadError('');
    } catch (error) {
      setLoadError(error.response?.data?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadNotifications, 0);
    const timer = window.setInterval(() => loadNotifications(), 30000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  const markRead = async (item) => {
    if (item.read_at) return true;
    try {
      await api.put(`/notifications/${item.id}/read`);
      setItems((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, read_at: new Date().toISOString() }
            : notification
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      return true;
    } catch (error) {
      message.error(error.response?.data?.message || 'Unable to mark notification as read.');
      return false;
    }
  };

  const openNotification = async (item) => {
    if (!(await markRead(item))) return;
    setOpen(false);
    if (item.target_path) navigate(item.target_path);
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((notification) => ({ ...notification, read_at: notification.read_at || readAt }))
      );
      setUnreadCount(0);
    } catch (error) {
      message.error(error.response?.data?.message || 'Unable to mark notifications as read.');
    }
  };

  const content = (
    <div style={{ width: 'min(360px, calc(100vw - 40px))' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text strong>Notifications</Text>
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          disabled={!unreadCount}
          onClick={markAllRead}
        >
          Mark all read
        </Button>
      </Space>

      {loadError && (
        <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
          {loadError}
        </Text>
      )}

      <Spin spinning={loading}>
        {items.length ? (
          <List
            size="small"
            dataSource={items}
            style={{ maxHeight: 360, overflowY: 'auto' }}
            renderItem={(item) => (
              <List.Item
                onClick={() => openNotification(item)}
                style={{
                  cursor: item.target_path ? 'pointer' : 'default',
                  background: item.read_at ? undefined : '#f0fdf4',
                  padding: '10px 8px',
                }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong={!item.read_at}>{item.title}</Text>
                  <Text>{item.message}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : !loading && !loadError ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications yet" />
        ) : null}
      </Spin>
    </div>
  );

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1100 }}>
      <Popover
        content={content}
        trigger="click"
        placement="topRight"
        open={open}
        onOpenChange={setOpen}
      >
        <Tooltip title="Notifications">
          <Badge count={unreadCount} overflowCount={99} offset={[-2, 2]}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<BellOutlined />}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              style={{ width: 52, height: 52, boxShadow: '0 4px 14px rgba(0,0,0,.2)' }}
            />
          </Badge>
        </Tooltip>
      </Popover>
    </div>
  );
}
