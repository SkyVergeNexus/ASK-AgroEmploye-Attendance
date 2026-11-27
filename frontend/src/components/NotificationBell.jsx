import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar, Badge, Button, Empty, Popover, Segmented, Skeleton, Typography, theme,
} from 'antd';
import {
  BellOutlined, CheckOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatRelativeTime, getNotificationMeta } from './notificationUtils.jsx';

const { Text } = Typography;

const POLL_INTERVAL = 30000;
const MAX_VISIBLE = 20;
const BRAND = '#047857';
const ACCENT = '#0f766e';
const GROUPS = ['Today', 'Yesterday', 'Earlier'];

function groupLabel(value) {
  const d = dayjs(value);
  if (!d.isValid()) return 'Earlier';
  const now = dayjs();
  if (d.isSame(now, 'day')) return 'Today';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  return 'Earlier';
}

const css = `
  .nb-row { background: #fff; transition: background 120ms ease; }
  .nb-row.nb-unread { background: #f5fbf7; }
  .nb-row.nb-actionable { cursor: pointer; }
  .nb-row.nb-actionable:hover { background: #eaf6ef; }
  .nb-row:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: -2px; }
`;

function NotificationRow({ item, onOpen, borderColor, textColor, mutedColor }) {
  const meta = getNotificationMeta(item.event_type, item.title, item.message);
  const unread = !item.read_at;
  const actionable = unread || !!item.target_path;

  return (
    <div
      className={`nb-row${unread ? ' nb-unread' : ''}${actionable ? ' nb-actionable' : ''}`}
      role={actionable ? 'button' : undefined}
      tabIndex={actionable ? 0 : -1}
      onClick={() => actionable && onOpen(item)}
      onKeyDown={(e) => {
        if (actionable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(item);
        }
      }}
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px 12px 11px',
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${unread ? ACCENT : 'transparent'}`,
      }}
    >
      <Avatar
        shape="square"
        size={36}
        style={{
          background: meta.background,
          color: meta.color,
          border: `1px solid ${meta.color}22`,
          borderRadius: 11,
          fontSize: 15,
          flexShrink: 0,
        }}
        icon={meta.icon}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Text
            strong={unread}
            ellipsis={{ tooltip: item.title }}
            style={{ fontSize: 13, color: unread ? textColor : mutedColor, minWidth: 0 }}
          >
            {item.title}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatRelativeTime(item.created_at)}
          </Text>
        </div>
        {item.message && (
          <div
            style={{
              fontSize: 12,
              color: mutedColor,
              lineHeight: 1.5,
              marginTop: 2,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {item.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const { token } = theme.useToken();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const inFlightRef = useRef(false);
  const abortRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
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
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_INTERVAL);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      abortRef.current?.abort();
    };
  }, [loadNotifications]);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next) loadNotifications();
  };

  const markRead = async (item) => {
    if (item.read_at) return true;
    setItems((cur) =>
      cur.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${item.id}/read`);
      return true;
    } catch (error) {
      setItems((cur) => cur.map((n) => (n.id === item.id ? { ...n, read_at: null } : n)));
      setUnreadCount((c) => c + 1);
      toast.error(error.response?.data?.message || 'Unable to mark notification as read.');
      return false;
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    const unreadIds = new Set(items.filter((n) => !n.read_at).map((n) => n.id));
    const readAt = new Date().toISOString();
    setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at || readAt })));
    setUnreadCount(0);
    try {
      await api.put('/notifications/read-all');
    } catch (error) {
      setItems((cur) => cur.map((n) => (unreadIds.has(n.id) ? { ...n, read_at: null } : n)));
      toast.error(error.response?.data?.message || 'Unable to mark notifications as read.');
      loadNotifications();
    }
  };

  const openNotification = async (item) => {
    if (!(await markRead(item))) return;
    if (item.target_path) {
      setOpen(false);
      navigate(item.target_path);
    }
  };

  const filtered = useMemo(
    () => (filter === 'unread' ? items.filter((n) => !n.read_at) : items),
    [items, filter]
  );
  const visibleItems = useMemo(() => filtered.slice(0, MAX_VISIBLE), [filtered]);

  const grouped = useMemo(() => {
    const map = { Today: [], Yesterday: [], Earlier: [] };
    visibleItems.forEach((n) => map[groupLabel(n.created_at)].push(n));
    return GROUPS.filter((g) => map[g].length).map((g) => ({ label: g, rows: map[g] }));
  }, [visibleItems]);

  const panel = (
    <div style={{ width: 'min(400px, calc(100vw - 28px))' }}>
      <style>{css}</style>

      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              size={36}
              style={{ background: '#ecfdf5', color: BRAND, fontSize: 16 }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              type="text"
              size="small"
              aria-label="Refresh notifications"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={loadNotifications}
              disabled={refreshing}
              style={{ color: token.colorTextSecondary }}
            />
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined />}
              disabled={!unreadCount || loading}
              onClick={markAllRead}
              style={{ color: unreadCount ? BRAND : token.colorTextDisabled, fontSize: 12 }}
            >
              Mark all read
            </Button>
          </div>
        </div>

        <Segmented
          block
          size="small"
          value={filter}
          onChange={setFilter}
          style={{ marginTop: 12 }}
          options={[
            { label: 'All', value: 'all' },
            { label: unreadCount ? `Unread (${unreadCount})` : 'Unread', value: 'unread' },
          ]}
        />
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{loadError}</span>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label="Retry loading notifications"
            onClick={loadNotifications}
          />
        </div>
      )}

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && !items.length ? (
          <div style={{ padding: 12 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} active avatar paragraph={{ rows: 1 }} style={{ marginBottom: 6 }} />
            ))}
          </div>
        ) : grouped.length ? (
          grouped.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: token.colorTextSecondary,
                  background: '#f8fafb',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                {group.label}
              </div>
              {group.rows.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={openNotification}
                  borderColor={token.colorBorderSecondary}
                  textColor={token.colorText}
                  mutedColor={token.colorTextSecondary}
                />
              ))}
            </div>
          ))
        ) : (
          <div style={{ padding: '28px 12px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              styles={{ image: { height: 48 } }}
              description={
                <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                  {filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
                </span>
              }
            />
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '5px 8px',
          background: '#fafcfb',
        }}
      >
        {filtered.length > MAX_VISIBLE && (
          <div style={{ textAlign: 'center', fontSize: 11, color: token.colorTextSecondary, padding: '4px 0 2px' }}>
            Showing the latest {MAX_VISIBLE} of {filtered.length}
          </div>
        )}
        <Button
          type="text"
          block
          size="small"
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
          style={{ fontSize: 12, color: BRAND, fontWeight: 600, height: 34 }}
        >
          View all notifications
          <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        zIndex: 1100,
      }}
    >
      <Popover
        content={panel}
        trigger="click"
        placement="topRight"
        open={open}
        onOpenChange={handleOpenChange}
        styles={{
          body: {
            padding: 0,
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid #e5eee9',
            boxShadow: '0 14px 38px rgba(15, 44, 32, 0.16)',
          },
        }}
      >
        <Badge count={unreadCount} overflowCount={99} offset={[-6, 6]} color={ACCENT}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<BellOutlined style={{ fontSize: 20 }} />}
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={open}
            style={{
              width: 50,
              height: 50,
              color: BRAND,
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