import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Button, Typography, Space, Tag, message, Table, Grid, Avatar,
  Alert, ConfigProvider,
} from 'antd';
import {
  LoginOutlined, LogoutOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, CalendarOutlined, UserOutlined, ReloadOutlined,
  EnvironmentOutlined, WifiOutlined, SafetyCertificateOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../config';
import AttendanceRecordTag from '../components/AttendanceRecordTag';
import { attendanceClockOutLabel } from '../utils/attendanceRecordLabel';
import ClockInOutPanel from './ClockInOutPanel';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const statusColor = {
  present: 'green',
  late: 'gold',
  absent: 'red',
  'half-day': 'blue',
  leave: 'purple',
};

const statusHex = {
  present: '#3f6b3a',
  late: '#b7791f',
  absent: '#b42318',
  'half-day': '#2563a8',
  leave: '#6d4aa8',
};

const RECENT_LIMIT = 5;

// ═══════════ Brand styles (cocoa) ═══════════
// Defined on both .cc-root and .cc-portal so portalled Ant Design modals
// and buttons always receive theme tokens and stay high-contrast.
const CSS = `
.cc-root, .cc-portal {
  --cc-bean: #2a1810;
  --cc-roast: #4a2c1a;
  --cc-husk: #7a5236;
  --cc-gold: #d9a441;
  --cc-leaf: #3f6b3a;
  --cc-leaf-dark: #2f5230;
  --cc-paper: #f3efea;
  --cc-surface: #ffffff;
  --cc-line: #e6ded4;
  --cc-ink: #26170f;
  --cc-muted: #85705f;
}
.cc-root {
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--cc-ink);
  background: var(--cc-paper);
  min-height: 100%;
  padding: 16px;
}
.cc-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.cc-serif { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; }

/* Hero */
.cc-hero {
  position: relative; overflow: hidden; color: #fff;
  border-radius: 28px 28px 28px 8px;
  padding: 26px 26px 22px;
  background:
    radial-gradient(900px 300px at 85% -10%, rgba(217,164,65,0.28), transparent 60%),
    radial-gradient(600px 260px at 0% 110%, rgba(63,107,58,0.35), transparent 60%),
    linear-gradient(140deg, #2a1810 0%, #3b2214 55%, #4a2c1a 100%);
  box-shadow: 0 18px 40px -22px rgba(42,24,16,0.7);
}
.cc-hero-pods { position: absolute; right: -20px; top: -14px; opacity: 0.09; pointer-events: none; }
.cc-hero-top { position: relative; display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; align-items: center; }
.cc-who { display: flex; gap: 16px; align-items: center; min-width: 0; }
.cc-hello { font-size: 13px; color: rgba(255,255,255,0.7); }
.cc-name { font-size: 26px; line-height: 1.15; font-weight: 600; margin: 2px 0 8px; }
.cc-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  padding: 3px 10px; border-radius: 999px;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
}
.cc-clock { text-align: right; }
.cc-time { font-size: 52px; line-height: 1; font-weight: 600; letter-spacing: -1px; }
.cc-time small { font-size: 20px; opacity: 0.6; font-weight: 500; margin-left: 4px; letter-spacing: 0; }
.cc-date { font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 6px; }

.cc-shift { position: relative; margin-top: 22px; }
.cc-shift-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: rgba(255,255,255,0.72); margin-bottom: 8px; gap: 12px; flex-wrap: wrap; }
.cc-shift-count { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; color: var(--cc-gold); letter-spacing: 0.5px; }
.cc-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.14); overflow: hidden; }
.cc-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--cc-gold), #f0c36d); transition: width 800ms ease; }
.cc-shift-foot { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 6px; }

/* Layout */
.cc-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.cc-panel { background: var(--cc-surface); border: 1px solid var(--cc-line); border-radius: 20px; padding: 20px; }
.cc-panel-side { border-radius: 8px 20px 20px 20px; background: #fbf9f6; }
.cc-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.cc-h { font-size: 18px; font-weight: 600; margin: 0; color: var(--cc-roast); }

/* Tiles */
.cc-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.cc-tile { border-radius: 16px; padding: 14px; background: #faf7f3; border: 1px solid var(--cc-line); }
.cc-tile-ic { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; margin-bottom: 10px; }
.cc-tile-label { font-size: 12px; color: var(--cc-muted); }
.cc-tile-value { font-size: 20px; font-weight: 700; margin-top: 2px; line-height: 1.2; text-transform: capitalize; }
.cc-tile-sub { margin-top: 4px; }

/* Buttons */
.cc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cc-btn { height: 54px !important; border-radius: 14px !important; font-weight: 600 !important; font-size: 16px !important; }
.cc-btn-in:not(:disabled) { background: var(--cc-leaf, #3f6b3a) !important; border-color: var(--cc-leaf, #3f6b3a) !important; color: #fff !important; box-shadow: 0 8px 18px -10px var(--cc-leaf, #3f6b3a); }
.cc-btn-in:not(:disabled):hover { background: var(--cc-leaf-dark, #2f5230) !important; border-color: var(--cc-leaf-dark, #2f5230) !important; }
.cc-btn-out:not(:disabled) { background: var(--cc-roast, #4a2c1a) !important; border-color: var(--cc-roast, #4a2c1a) !important; color: #fff !important; }
.cc-btn-out:not(:disabled):hover { background: var(--cc-bean, #2a1810) !important; }
.cc-btn-in:disabled, .cc-btn-out:disabled {
  background: #e4dbd0 !important; border-color: #e4dbd0 !important; color: #8b7a6b !important; box-shadow: none !important;
}
.cc-btn-ghost:not(:disabled) { background: #fff !important; border: 1px solid var(--cc-line, #e6ded4) !important; color: var(--cc-roast, #4a2c1a) !important; }
.cc-btn-ghost:not(:disabled):hover { border-color: var(--cc-husk, #7a5236) !important; color: var(--cc-bean, #2a1810) !important; }
.cc-note { margin-top: 12px; }

.cc-alerts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.cc-alerts .ant-alert, .cc-portal .ant-alert { border-left-width: 4px; border-radius: 12px; }
.cc-alerts .ant-alert-title, .cc-portal .ant-alert-title,
.cc-alerts .ant-alert-message, .cc-portal .ant-alert-message { font-weight: 600; }

.cc-portal .ant-modal-mask { background: rgba(42,24,16,0.55) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.cc-portal .ant-modal-container, .cc-portal .ant-modal-content { border-radius: 20px; }

/* Check rows */
.cc-check { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--cc-line); }
.cc-check:last-of-type { border-bottom: none; }
.cc-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.cc-check-title { font-weight: 600; font-size: 14px; }
.cc-check-text { font-size: 13px; color: var(--cc-muted); line-height: 1.4; }

/* Mode cards & Camera controls */
.cc-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
.cc-mode { border: 1px solid var(--cc-line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.cc-mode-remote { background: #f5f9f3; border-color: #cfe0c9; }
.cc-mode-ic { font-size: 24px; color: var(--cc-leaf); }

.cc-cam-entry-group { width: 100%; }
.cc-cam-entry-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cc-cam-entry-btn { width: 100%; }

.cc-cam-stage { position: relative; width: 100%; background: #000; border-radius: 14px; overflow: hidden; max-height: 60vh; }
.cc-cam-video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
.cc-cam-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #fff; font-size: 13px; background: rgba(0,0,0,0.35); }
.cc-cam-badge { position: absolute; top: 10px; left: 10px; font-size: 12px; color: #fff; padding: 3px 10px; border-radius: 999px; background: rgba(42,24,16,0.65); border: 1px solid rgba(255,255,255,0.25); }
.cc-cam-controls { display: grid; grid-template-columns: 1fr 1.6fr; gap: 10px; }
.cc-cam-controls.single { grid-template-columns: 1fr; }

/* History */
.cc-rec { border: 1px solid var(--cc-line); border-radius: 16px; padding: 12px 14px; margin-bottom: 10px; background: #fff; display: flex; flex-direction: column; gap: 10px; }
.cc-rec-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.cc-rec-times { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #faf7f3; border-radius: 10px; padding: 8px 10px; }
.cc-rec-label { font-size: 11px; color: var(--cc-muted); }

@media (max-width: 860px) {
  .cc-grid { grid-template-columns: 1fr; }
  .cc-clock { text-align: left; }
}
@media (max-width: 560px) {
  .cc-root { padding: 10px; }
  .cc-hero { padding: 20px 18px 18px; border-radius: 22px 22px 22px 6px; }
  .cc-name { font-size: 22px; }
  .cc-time { font-size: 42px; }
  .cc-tiles { grid-template-columns: 1fr; }
  .cc-tile { display: flex; align-items: center; gap: 12px; }
  .cc-tile-ic { margin-bottom: 0; }
  .cc-modes { grid-template-columns: 1fr; }
  .cc-cam-entry-row { grid-template-columns: 1fr; }
  .cc-panel { padding: 16px; border-radius: 16px; }
  .cc-cam-controls { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .cc-fill { transition: none; } }
`;

const antTheme = {
  token: {
    colorPrimary: '#4a2c1a',
    colorText: '#26170f',
    colorSuccess: '#3f6b3a',
    colorSuccessBg: '#eef5ec',
    colorSuccessBorder: '#c9dfc4',
    colorWarning: '#b7791f',
    colorWarningBg: '#fdf3e1',
    colorWarningBorder: '#f1dcae',
    colorError: '#b42318',
    colorErrorBg: '#fdecea',
    colorErrorBorder: '#f3c6c1',
    colorInfo: '#2563a8',
    colorInfoBg: '#eef4fb',
    colorInfoBorder: '#c5d9ee',
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

// ═══════════ Helpers ═══════════
function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeStringToDate(hms, reference = new Date()) {
  if (!hms) return null;
  const [h, m, s = 0] = String(hms).split(':').map(Number);
  const d = new Date(reference);
  d.setHours(h, m, s, 0);
  return d;
}

function formatDuration(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function greetingFor(d) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ═══════════ Small presentational pieces ═══════════
function PodMark({ size = 28, color = '#d9a441' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3c6 3 9 8.5 9 13s-3 10.5-9 13c-6-2.5-9-8.5-9-13S10 6 16 3z"
        fill={color}
      />
      <path
        d="M16 3v26M11 9c1.5 4 1.5 10 0 14M21 9c-1.5 4-1.5 10 0 14"
        stroke="#2a1810"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

function HeroPods() {
  return (
    <div className="cc-hero-pods" aria-hidden="true">
      <svg width="320" height="240" viewBox="0 0 320 240" fill="none">
        <g fill="#fff">
          <path d="M70 20c40 20 60 58 60 88s-20 70-60 88c-40-18-60-58-60-88S30 40 70 20z" />
          <path d="M200 60c30 15 45 44 45 66s-15 52-45 66c-30-14-45-44-45-66s15-51 45-66z" />
          <path d="M280 10c18 9 27 26 27 40s-9 31-27 40c-18-9-27-26-27-40s9-31 27-40z" />
        </g>
      </svg>
    </div>
  );
}

function Tile({ icon, tint, label, value, valueColor, sub }) {
  return (
    <div className="cc-tile">
      <div className="cc-tile-ic" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div>
        <div className="cc-tile-label">{label}</div>
        <div className="cc-tile-value" style={{ color: valueColor }}>{value}</div>
        {sub && <div className="cc-tile-sub">{sub}</div>}
      </div>
    </div>
  );
}

const DOT = { ok: '#3f6b3a', bad: '#b42318', warn: '#d9a441', idle: '#c9bdb0' };

function CheckRow({ tone, title, text }) {
  return (
    <div className="cc-check">
      <span className="cc-dot" style={{ background: DOT[tone] }} />
      <div>
        <div className="cc-check-title">{title}</div>
        <div className="cc-check-text">{text}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ConfigProvider theme={antTheme}>
      <DashboardInner />
    </ConfigProvider>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const [messageApi, messageHolder] = message.useMessage({ maxCount: 3, top: 16 });

  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [earlyRequests, setEarlyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const [ipCheck, setIpCheck] = useState(null);
  const [ipChecking, setIpChecking] = useState(false);

  const [geo, setGeo] = useState({
    status: 'idle',
    distance: null,
    coords: null,
    radius: null,
  });

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    try {
      const [t, h, s, er] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/my'),
        api.get('/settings'),
        api.get('/attendance/early-leave/my'),
      ]);
      setToday(t.data);
      setHistory(h.data);
      setSettings(s.data);
      setEarlyRequests(er.data);
    } catch (err) {
      messageApi.error(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const checkIp = useCallback(async () => {
    setIpChecking(true);
    try {
      const { data } = await api.get('/settings/check-ip');
      setIpCheck(data);
    } catch {
      setIpCheck(null);
    } finally {
      setIpChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
    checkIp();
  }, [load, checkIp]);

  useEffect(() => {
    const interval = setInterval(load, 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    checkIp();
  }, [today, checkIp]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshGeo = useCallback(() => {
    if (!settings) return;
    const enforced = !!Number(settings.enforce_location);
    if (!enforced) {
      setGeo({ status: 'not-enforced', distance: null, coords: null, radius: null });
      return;
    }
    if (settings.office_lat == null || settings.office_lng == null) {
      setGeo({ status: 'no-office', distance: null, coords: null, radius: null });
      return;
    }
    if (!navigator.geolocation) {
      setGeo({ status: 'unsupported', distance: null, coords: null, radius: null });
      return;
    }

    setGeo((g) => ({ ...g, status: 'checking' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = haversineMeters(
          latitude, longitude,
          Number(settings.office_lat), Number(settings.office_lng)
        );
        const radius = Number(settings.geofence_radius_m || 200);
        setGeo({
          status: dist <= radius ? 'inside' : 'outside',
          distance: Math.round(dist),
          coords: { lat: latitude, lng: longitude },
          radius,
        });
      },
      () => {
        setGeo({ status: 'denied', distance: null, coords: null, radius: null });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [settings]);

  useEffect(() => {
    refreshGeo();
  }, [refreshGeo]);

  const refreshChecks = useCallback(() => {
    refreshGeo();
    checkIp();
  }, [refreshGeo, checkIp]);

  const todaysRequests = useMemo(() => {
    if (!today) return [];
    const todayStr = localDateString();
    return earlyRequests.filter((r) => String(r.created_at).slice(0, 10) === todayStr);
  }, [earlyRequests, today]);

  const pendingEarly = todaysRequests.find((r) => r.status === 'pending');
  const approvedEarly = todaysRequests.find((r) => r.status === 'approved');
  const rejectedEarly = todaysRequests.find((r) => r.status === 'rejected');

  const enforceLocation = !!Number(settings?.enforce_location);
  const ipEnforced = ipCheck?.enforce === true;
  const enforceNetwork = !!Number(settings?.enforce_network);

  const networkIsEnforced = ipCheck ? ipEnforced : enforceNetwork;
  const ipAllowed = ipCheck ? ipCheck.allowed !== false : true;

  const geoInside = geo.status === 'inside';
  const geoBlocked =
    geo.status === 'outside' ||
    geo.status === 'denied' ||
    geo.status === 'unsupported' ||
    geo.status === 'no-office' ||
    geo.status === 'checking';

  const locationBlocked = geoBlocked;
  const networkBlocked = networkIsEnforced && !ipAllowed;

  const scheduleStart = settings ? timeStringToDate(settings.work_start, now) : null;
  const scheduleEnd = settings ? timeStringToDate(settings.work_end, now) : null;

  const withinWindow = Boolean(
    scheduleStart && scheduleEnd && now >= scheduleStart && now <= scheduleEnd
  );

  const clockInUnavailableReason = !today && settings
    ? now < scheduleStart
      ? `Clock-in opens at ${String(settings.work_start).slice(0, 5)}.`
      : now > scheduleEnd
        ? `The clock-in window closed at ${String(settings.work_end).slice(0, 5)}.`
        : null
    : null;

  const picUrl = assetUrl(user?.profile_picture);

  const recentHistory = useMemo(() => {
    return [...history]
      .sort((a, b) => String(b.attendance_date).localeCompare(String(a.attendance_date)))
      .slice(0, RECENT_LIMIT);
  }, [history]);

  const countdown = useMemo(() => {
    if (!settings) return { text: '—', hint: 'Loading settings…', active: false };

    const workEnd = scheduleEnd;
    const workStart = scheduleStart;
    if (!workEnd || !workStart) return { text: '—', hint: 'No work hours set', active: false };

    if (today?.status === 'leave') return { text: '—', hint: 'Approved leave today', active: false };

    if (!today?.clock_in) {
      if (now < workStart) {
        return { text: '—', hint: `Clock-in opens at ${String(settings.work_start).slice(0, 5)}`, active: false };
      }
      if (now > workEnd) {
        return { text: '—', hint: `Clock-in closed at ${String(settings.work_end).slice(0, 5)}`, active: false };
      }
      return { text: '00:00:00', hint: 'Starts when you clock in', active: false };
    }

    if (today.clock_out) {
      return {
        text: '00:00:00',
        hint: today.admin_resolved
          ? today.status === 'absent'
            ? 'Admin marked you absent'
            : today.status === 'late'
              ? 'Admin confirmed your attendance (late)'
              : 'Admin marked you present'
          : today.early_leave_reason
            ? 'Left early — reason recorded'
            : 'Day complete',
        active: false,
      };
    }

    if (today.needs_review) {
      return {
        text: 'Review',
        hint: 'You missed clock-out — admin is reviewing',
        active: false,
      };
    }

    if (pendingEarly) {
      return { text: '00:00:00', hint: 'Early clock-out pending approval', active: false };
    }

    if (today.clock_in_mode === 'remote') {
      return { text: 'Flexible', hint: 'Remote — clock out when your work is complete', active: false };
    }

    if (now >= workEnd) {
      return {
        text: 'Monitoring',
        hint: 'Past closing — clock out when you leave the office',
        active: false,
      };
    }

    const remainingMs = workEnd.getTime() - now.getTime();
    return {
      text: formatDuration(remainingMs),
      hint: `Until ${String(settings.work_end).slice(0, 5)}`,
      active: true,
    };
  }, [settings, today, now, pendingEarly, scheduleStart, scheduleEnd]);

  const shiftProgress =
    scheduleStart && scheduleEnd
      ? Math.min(100, Math.max(0, ((now - scheduleStart) / (scheduleEnd - scheduleStart)) * 100))
      : 0;

  const columns = [
    {
      title: 'Date',
      dataIndex: 'attendance_date',
      key: 'attendance_date',
      render: (v) => <Text strong>{String(v).slice(0, 10)}</Text>,
      sorter: (a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Clock In',
      dataIndex: 'clock_in',
      key: 'clock_in',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Clock Out',
      dataIndex: 'clock_out',
      key: 'clock_out',
      render: (v, r) => (
        <Space size={4}>
          {v || <Text type="secondary">{attendanceClockOutLabel(r)}</Text>}
          <AttendanceRecordTag record={r} />
          {r.early_leave_reason && <Tag color="orange" style={{ marginLeft: 4 }}>early</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => (
        <Tag color={statusColor[v] || 'default'} style={{ borderRadius: 999 }}>
          {v ? v[0].toUpperCase() + v.slice(1) : '—'}
        </Tag>
      ),
    },
  ];

  const locationRow = !enforceLocation
    ? { tone: 'idle', text: 'Not required for your office.' }
    : geo.status === 'inside'
      ? { tone: 'ok', text: `You are inside the office area (${geo.distance}m from the centre).` }
      : geo.status === 'outside'
        ? { tone: 'bad', text: `You are ${geo.distance}m away. Move within ${geo.radius}m.` }
        : geo.status === 'denied'
          ? { tone: 'bad', text: 'Location permission is blocked. Allow it in your browser settings.' }
          : geo.status === 'unsupported'
            ? { tone: 'bad', text: 'This device does not support GPS.' }
            : geo.status === 'no-office'
              ? { tone: 'warn', text: 'Office location is not set yet. Ask your administrator.' }
              : { tone: 'warn', text: 'Checking your location…' };

  const networkRow = !networkIsEnforced
    ? { tone: 'idle', text: 'Not required for your office.' }
    : ipAllowed
      ? { tone: 'ok', text: 'You are connected to the office Wi-Fi.' }
      : { tone: 'bad', text: `Connect to the office Wi-Fi (current IP ${ipCheck?.clientIp || 'unknown'}).` };

  const windowRow = !settings
    ? { tone: 'idle', text: 'Loading work hours…' }
    : today
      ? { tone: 'ok', text: 'You have already clocked in today.' }
      : withinWindow
        ? { tone: 'ok', text: `Open until ${String(settings.work_end).slice(0, 5)}.` }
        : { tone: 'warn', text: clockInUnavailableReason || 'Outside work hours.' };

  const statusKey = today?.status;
  const statusIcon =
    statusKey === 'present' ? <CheckCircleOutlined />
    : statusKey === 'late' ? <ClockCircleOutlined />
    : statusKey === 'absent' ? <CloseCircleOutlined />
    : statusKey === 'leave' ? <CalendarOutlined />
    : <ClockCircleOutlined />;
  const statusTone = statusHex[statusKey] || '#85705f';

  return (
    <div className="cc-root">
      <style>{CSS}</style>
      {messageHolder}

      <div className="cc-wrap">
        {/* ═══════════ Hero ═══════════ */}
        <section className="cc-hero">
          <HeroPods />
          <div className="cc-hero-top">
            <div className="cc-who">
              <Avatar
                size={isMobile ? 56 : 68}
                src={picUrl || undefined}
                icon={!picUrl ? <UserOutlined /> : undefined}
                style={{
                  backgroundColor: picUrl ? undefined : 'rgba(255,255,255,0.18)',
                  border: '2px solid rgba(217,164,65,0.7)',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="cc-hello">{greetingFor(now)}</div>
                <div className="cc-name cc-serif">{user?.name || 'there'}</div>
                <div className="cc-chips">
                  <span className="cc-chip">
                    <PodMark size={14} />
                    ASK Agrobusiness
                  </span>
                  {user?.department_name && (
                    <span className="cc-chip"><ApartmentOutlined /> {user.department_name}</span>
                  )}
                  {user?.role_name && <span className="cc-chip">{user.role_name}</span>}
                </div>
              </div>
            </div>

            <div className="cc-clock">
              <div className="cc-time cc-serif">
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <small>{String(now.getSeconds()).padStart(2, '0')}</small>
              </div>
              <div className="cc-date">
                {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="cc-shift">
            <div className="cc-shift-head">
              <span>{countdown.active ? 'Time left in your shift' : countdown.hint}</span>
              <span className="cc-shift-count">{countdown.text}</span>
            </div>
            <div
              className="cc-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shiftProgress)}
              aria-label="Shift progress"
            >
              <div className="cc-fill" style={{ width: `${shiftProgress}%` }} />
            </div>
            {settings?.work_start && settings?.work_end && (
              <div className="cc-shift-foot">
                <span>{String(settings.work_start).slice(0, 5)}</span>
                <span>{String(settings.work_end).slice(0, 5)}</span>
              </div>
            )}
          </div>
        </section>

        <div className="cc-grid">
          {/* ═══════════ Today ═══════════ */}
          <section className="cc-panel">
            <div className="cc-panel-head">
              <Space size={10} wrap>
                <h2 className="cc-h cc-serif">Today</h2>
                {today && (
                  <Tag color={statusColor[today.status] || 'default'} style={{ borderRadius: 999, margin: 0 }}>
                    {today.status}
                  </Tag>
                )}
                {today && (
                  <Tag style={{ borderRadius: 999, margin: 0 }}>
                    {today.clock_in_mode === 'remote' ? 'Remote' : 'On-site'}
                  </Tag>
                )}
              </Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => { load(); refreshChecks(); }}
                loading={loading || ipChecking}
              >
                Refresh
              </Button>
            </div>

            {!today && networkIsEnforced && ipCheck && (
              <div className="cc-alerts">
                {ipCheck.allowed ? (
                  <Alert
                    type="success"
                    showIcon
                    icon={<SafetyCertificateOutlined />}
                    title="You're on the office network"
                    description={
                      <span style={{ fontSize: 13 }}>
                        Your IP <Text code>{ipCheck.clientIp || 'unknown'}</Text> is in the allowlist.
                      </span>
                    }
                  />
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    icon={<WifiOutlined />}
                    title="You're not on the office Wi-Fi"
                    description={
                      <span style={{ fontSize: 13 }}>
                        Your IP <Text code>{ipCheck.clientIp || 'unknown'}</Text> is not in the allowed list.
                      </span>
                    }
                  />
                )}
              </div>
            )}

            <div className="cc-tiles">
              <Tile
                icon={<LoginOutlined />}
                tint={{ bg: '#e6f0e3', fg: '#3f6b3a' }}
                label="Clock in"
                value={today?.clock_in || '—'}
                valueColor={today?.clock_in ? '#2f5230' : '#b3a595'}
              />
              <Tile
                icon={<LogoutOutlined />}
                tint={{ bg: '#f3e6d6', fg: '#7a5236' }}
                label="Clock out"
                value={today ? attendanceClockOutLabel(today) : 'Not recorded'}
                valueColor={today?.clock_out ? '#4a2c1a' : '#b3a595'}
                sub={today ? <AttendanceRecordTag record={today} /> : null}
              />
              <Tile
                icon={statusIcon}
                tint={{ bg: `${statusTone}1f`, fg: statusTone }}
                label="Status"
                value={statusKey === 'leave' ? 'On leave' : statusKey || 'Not marked'}
                valueColor={statusTone}
              />
            </div>

            <ClockInOutPanel
              today={today}
              settings={settings}
              geo={geo}
              ipCheck={ipCheck}
              ipChecking={ipChecking}
              withinWindow={withinWindow}
              clockInUnavailableReason={clockInUnavailableReason}
              enforceLocation={enforceLocation}
              locationBlocked={locationBlocked}
              networkIsEnforced={networkIsEnforced}
              ipAllowed={ipAllowed}
              geoInside={geoInside}
              networkBlocked={networkBlocked}
              pendingEarly={pendingEarly}
              approvedEarly={approvedEarly}
              rejectedEarly={rejectedEarly}
              isMobile={isMobile}
              messageApi={messageApi}
              onRefreshAll={load}
              onRefreshChecks={refreshChecks}
            />
          </section>

          {/* ═══════════ Office checks ═══════════ */}
          <aside className="cc-panel cc-panel-side">
            <div className="cc-panel-head">
              <h2 className="cc-h cc-serif">Before you clock in</h2>
            </div>
            <CheckRow tone={windowRow.tone} title="Work hours" text={windowRow.text} />
            <CheckRow tone={locationRow.tone} title="Location" text={locationRow.text} />
            <CheckRow tone={networkRow.tone} title="Office Wi-Fi" text={networkRow.text} />
            <Button
              block
              icon={<EnvironmentOutlined />}
              onClick={refreshChecks}
              loading={ipChecking || geo.status === 'checking'}
              style={{ marginTop: 10 }}
            >
              Check again
            </Button>
          </aside>
        </div>

        {/* ═══════════ Recent attendance ═══════════ */}
        <section className="cc-panel">
          <div className="cc-panel-head">
            <h2 className="cc-h cc-serif">Recent attendance</h2>
            <Text type="secondary" style={{ fontSize: 13 }}>Your last {RECENT_LIMIT} records</Text>
          </div>

          {isMobile ? (
            recentHistory.length === 0 ? (
              <Text type="secondary">No records yet. Your first clock-in will show up here.</Text>
            ) : (
              recentHistory.map((r) => (
                <div key={r.id} className="cc-rec">
                  <div className="cc-rec-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>{String(r.attendance_date).slice(0, 10)}</div>
                      <div style={{ fontSize: 12, color: '#85705f' }}>
                        {r.early_leave_reason ? 'Left early' : 'Full day'}
                      </div>
                    </div>
                    <Tag
                      color={statusColor[r.status] || 'default'}
                      style={{ margin: 0, borderRadius: 999, textTransform: 'capitalize' }}
                    >
                      {r.status}
                    </Tag>
                  </div>
                  <div className="cc-rec-times">
                    <div>
                      <div className="cc-rec-label">Clock in</div>
                      <div style={{ fontWeight: 600, color: '#2f5230' }}>{r.clock_in || '—'}</div>
                    </div>
                    <div>
                      <div className="cc-rec-label">Clock out</div>
                      <div style={{ fontWeight: 600, color: r.clock_out ? '#4a2c1a' : '#b3a595' }}>
                        {r.clock_out || '—'}
                      </div>
                      <AttendanceRecordTag record={r} />
                    </div>
                  </div>
                  {r.early_leave_reason && (
                    <Alert
                      type="warning"
                      showIcon
                      title="Early leave reason"
                      description={r.early_leave_reason}
                    />
                  )}
                </div>
              ))
            )
          ) : (
            <Table
              dataSource={recentHistory}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
              locale={{ emptyText: 'No records yet. Your first clock-in will show up here.' }}
            />
          )}
        </section>
      </div>
    </div>
  );
}