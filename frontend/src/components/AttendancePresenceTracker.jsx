import { useEffect, useRef } from 'react';
import api from '../api/axios';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

function readLocation(enabled) {
  if (!enabled || !navigator.geolocation) {
    return Promise.resolve({ lat: null, lng: null });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  });
}

export default function AttendancePresenceTracker({ user }) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!user || user.system_role === 'admin') return undefined;

    let active = true;
    const tick = async () => {
      if (!active || inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const { data: tracking } = await api.get('/attendance/presence/active');
        if (!tracking.active) return;

        const location = await readLocation(tracking.track_location);
        const { data } = await api.post('/attendance/presence/heartbeat', location);
        if (!data.tracking) {
          window.dispatchEvent(new Event('attendance:changed'));
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          console.error('[attendance-presence] heartbeat failed:', error.message);
        }
      } finally {
        inFlight.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('attendance:changed', tick);
    const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    tick();

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('attendance:changed', tick);
    };
  }, [user]);

  return null;
}
