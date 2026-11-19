import {
  CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled,
  InfoCircleFilled, TeamOutlined, UserOutlined,
} from '@ant-design/icons';

export function formatRelativeTime(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function getNotificationMeta(eventType, title = '', message = '') {
  const type = String(eventType || '').toLowerCase();
  const content = `${title} ${message}`.toLowerCase();

  if (type.includes('decision')) {
    const rejected = /\b(reject|rejected|decline|declined|denied)\b/.test(content);
    return rejected
      ? { icon: <CloseCircleFilled />, color: '#b91c1c', background: '#fef2f2', label: 'Decision' }
      : { icon: <CheckCircleFilled />, color: '#047857', background: '#ecfdf5', label: 'Decision' };
  }
  if (type.includes('attendance')) {
    return { icon: <ClockCircleOutlined />, color: '#2563eb', background: '#eff6ff', label: 'Attendance' };
  }
  if (type.includes('guest')) {
    return { icon: <TeamOutlined />, color: '#0f766e', background: '#f0fdfa', label: 'Guest' };
  }
  if (type.includes('leave') || type.includes('request')) {
    return { icon: <CalendarOutlined />, color: '#b45309', background: '#fffbeb', label: 'Request' };
  }
  if (type.includes('employee') || type.includes('registration')) {
    return { icon: <UserOutlined />, color: '#4338ca', background: '#eef2ff', label: 'Staff' };
  }
  return { icon: <InfoCircleFilled />, color: '#0f766e', background: '#f0fdfa', label: 'Update' };
}
