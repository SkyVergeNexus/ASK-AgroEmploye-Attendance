import {
  BellOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  InfoCircleFilled,
  InfoCircleOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';

export const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'system', label: 'System' },
];

const AVATAR_PALETTE = [
  '#047857',
  '#1d4ed8',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#0f766e',
  '#4338ca',
  '#3f6212',
];

export function avatarColor(name = '') {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (text.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

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

const CATEGORY_META_MAP = {
  attendance: {
    label: 'Attendance',
    color: '#047857',
    background: '#ecfdf5',
    icon: <ClockCircleOutlined />,
  },
  leave: {
    label: 'Leave',
    color: '#1d4ed8',
    background: '#eff6ff',
    icon: <CalendarOutlined />,
  },
  approval: {
    label: 'Approval',
    color: '#15803d',
    background: '#f0fdf4',
    icon: <CheckCircleOutlined />,
  },
  alert: {
    label: 'Alert',
    color: '#b45309',
    background: '#fffbeb',
    icon: <WarningOutlined />,
  },
  account: {
    label: 'Account',
    color: '#6d28d9',
    background: '#f5f3ff',
    icon: <UserOutlined />,
  },
  system: {
    label: 'System',
    color: '#334155',
    background: '#f1f5f9',
    icon: <InfoCircleOutlined />,
  },
};

const DEFAULT_CATEGORY_META = {
  label: 'Update',
  color: '#047857',
  background: '#ecfdf5',
  icon: <BellOutlined />,
};

export function getCategoryMeta(category) {
  const key = String(category || '').toLowerCase().trim();
  if (!key) return DEFAULT_CATEGORY_META;
  if (CATEGORY_META_MAP[key]) return CATEGORY_META_MAP[key];

  return {
    ...DEFAULT_CATEGORY_META,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  };
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