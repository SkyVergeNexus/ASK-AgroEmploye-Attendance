import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar, Badge, Button, Empty, List, Popover, Skeleton, Typography, message, theme,
} from 'antd';
import {
  BellOutlined, CheckOutlined, ClockCircleOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { formatRelativeTime, getNotificationMeta } from './notificationUtils.jsx';

const { Text } = Typography;

const POLL_INTERVAL = 30000;
const MAX_VISIBLE = 20;

export default function NotificationBell() {
  const { token } = theme.useToken();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const inFlightRef = useRef(false);
  const abortRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data } = await api.get('/notifications', { signal: controller.signal });
      setItems(data.items || []);
      setUnreadCount(Number(data.unread_count) || 0);
      setLoadError('');
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
      setLoadError(error.response?.data?.message || 'Unable to load notifications.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [loadNotifications]);

  const markRead = async (item) => {
    if (item.read_at) return true;
    const prevItems = items;
    const prevCount = unreadCount;
    setItems((cur) =>
      cur.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${item.id}/read`);
      return true;
    } catch (error) {
      setItems(prevItems);
      setUnreadCount(prevCount);
      message.error(error.response?.data?.message || 'Unable to mark notification as read.');
      return false;
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    const prevItems = items;
    const prevCount = unreadCount;
    const readAt = new Date().toISOString();
    setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at || readAt })));
    setUnreadCount(0);
    try {
      await api.put('/notifications/read-all');
    } catch (error) {
      setItems(prevItems);
      setUnreadCount(prevCount);
      message.error(error.response?.data?.message || 'Unable to mark notifications as read.');
    }
  };

  const openNotification = async (item) => {
    if (!(await markRead(item))) return;
    setOpen(false);
    if (item.target_path) navigate(item.target_path);
  };

  const visibleItems = useMemo(() => items.slice(0, MAX_VISIBLE), [items]);

  const panel = (
    <div style={{ width: 'min(400px, calc(100vw - 28px))' }}>
      <div
        style={{
          background: '#fff',
          padding: '15px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            size={36}
            style={{ background: '#ecfdf5', color: '#047857', fontSize: 16 }}
            icon={<BellOutlined />}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: '#172b24' }}>
              Notifications
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 3 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </div>
          </div>
        </div>
        <Button
          size="small"
          type="text"
          icon={<CheckOutlined />}
          disabled={!unreadCount || loading}
          onClick={markAllRead}
          style={{ color: unreadCount ? '#047857' : token.colorTextDisabled, fontSize: 12 }}
        >
          Mark all read
        </Button>
      </div>

      {loadError && (
        <div
          role="alert"
          style={{
            margin: '10px 12px 0',
            padding: '8px 10px',
            background: token.colorErrorBg,
            border: `1px solid ${token.colorErrorBorder}`,
            borderRadius: token.borderRadius,
            fontSize: 12,
            color: token.colorErrorText,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>{loadError}</span>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              aria-label="Retry loading notifications"
              onClick={loadNotifications}
            />
          </div>
        </div>
      )}

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && !items.length ? (
          <div style={{ padding: 12 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} active avatar paragraph={{ rows: 1 }} style={{ marginBottom: 6 }} />
            ))}
          </div>
        ) : (
          <List
            size="small"
            dataSource={visibleItems}
            locale={{
              emptyText: (
                <div style={{ padding: '28px 12px' }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    imageStyle={{ height: 48 }}
                    description={
                      <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                        You're all caught up
                      </span>
                    }
                  />
                </div>
              ),
            }}
            renderItem={(item) => {
              const meta = getNotificationMeta(item.event_type, item.title, item.message);
              const unread = !item.read_at;
              return (
                <List.Item
                  onClick={() => openNotification(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openNotification(item);
                    }
                  }}
                  role={item.target_path || unread ? 'button' : undefined}
                  tabIndex={item.target_path || unread ? 0 : -1}
                  style={{
                    cursor: item.target_path || unread ? 'pointer' : 'default',
                    background: unread ? '#f5fbf7' : '#fff',
                    padding: '12px 14px',
                    margin: 0,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    transition: 'background 120ms ease',
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge dot={unread} offset={[-2, 2]} color="#0f766e">
                        <Avatar
                          shape="square"
                          size={36}
                          style={{
                            background: meta.background,
                            color: meta.color,
                            border: `1px solid ${meta.color}22`,
                            borderRadius: 11,
                            fontSize: 15,
                          }}
                          icon={meta.icon}
                        />
                      </Badge>
                    }
                    title={
                      <Text
                        strong={unread}
                        ellipsis={{ tooltip: item.title }}
                        style={{
                          fontSize: 13,
                          color: unread ? token.colorText : token.colorTextSecondary,
                        }}
                      >
                        {item.title}
                      </Text>
                    }
                    description={
                      <>
                        {item.message && (
                          <div
                            style={{
                              fontSize: 12,
                              color: token.colorTextSecondary,
                              lineHeight: 1.5,
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              marginBottom: 4,
                            }}
                          >
                            {item.message}
                          </div>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <ClockCircleOutlined style={{ fontSize: 10, marginRight: 4 }} />
                          {formatRelativeTime(item.created_at)}
                        </Text>
                      </>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>

      <div
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '5px 8px',
          background: '#fafcfb',
        }}
      >
        <Button
          type="text"
          block
          size="small"
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
          style={{ fontSize: 12, color: '#047857', fontWeight: 600, height: 34 }}
        >
          View all notifications
          <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1100 }}>
      <Popover
        content={panel}
        trigger="click"
        placement="topRight"
        open={open}
        onOpenChange={setOpen}
        styles={{
          body: {
            padding: 0,
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid #e5eee9',
            boxShadow: '0 14px 38px rgba(15, 44, 32, 0.16)',
          },
        }}
        destroyTooltipOnHide={false}
      >
        <Badge count={unreadCount} overflowCount={99} offset={[-6, 6]} color="#0f766e">
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<BellOutlined style={{ fontSize: 20 }} />}
            aria-label={
              unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
            style={{
              width: 50,
              height: 50,
              color: '#047857',
              background: '#fff',
              border: '1px solid #d1fae5',
              boxShadow: '0 6px 20px rgba(15, 44, 32, 0.18)',
            }}
          />
        </Badge>
      </Popover>
    </div>
  );
}