import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Button, Typography, Space, Tag, Modal, Input, Popconfirm, Alert, Badge,
} from 'antd';
import {
  LoginOutlined, LogoutOutlined, ReloadOutlined, DeleteOutlined,
  CameraOutlined, HomeOutlined, WifiOutlined, SwapOutlined, LoadingOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Text } = Typography;
const { TextArea } = Input;

const MODAL_COMMON = { rootClassName: 'cc-portal', centered: true };

function mark(label) {
  return (
    <span className="cc-serif" style={{ fontSize: 15, fontWeight: 600 }}>
      {label}
    </span>
  );
}

export default function ClockInOutPanel({
  today,
  settings,
  geo,
  ipCheck,
  ipChecking,
  withinWindow,
  clockInUnavailableReason,
  enforceLocation,
  locationBlocked,
  networkIsEnforced,
  ipAllowed,
  geoInside,
  networkBlocked,
  pendingEarly,
  approvedEarly,
  rejectedEarly,
  isMobile,
  messageApi,
  onRefreshAll,
  onRefreshChecks,
}) {
  const [clocking, setClocking] = useState(false);
  const [clockInError, setClockInError] = useState(null);
  const [clockOutError, setClockOutError] = useState(null);

  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [clockModeOpen, setClockModeOpen] = useState(false);
  const [remoteClockInOpen, setRemoteClockInOpen] = useState(false);
  const [remoteClockOutOpen, setRemoteClockOutOpen] = useState(false);
  const [remoteLocation, setRemoteLocation] = useState('');

  const [remotePhoto, setRemotePhoto] = useState(null);
  const [photoCoordinates, setPhotoCoordinates] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoCapturedAt, setPhotoCapturedAt] = useState(null);
  const [photoSourceLabel, setPhotoSourceLabel] = useState(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  // Camera state (supports both front/selfie and back/environment cameras)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [cameraMirrored, setCameraMirrored] = useState(true);
  const [canFlip, setCanFlip] = useState(true);
  const [videoEl, setVideoEl] = useState(null);

  const [taskInput, setTaskInput] = useState('');
  const [remoteTasks, setRemoteTasks] = useState([]);

  const streamRef = useRef(null);
  const startIdRef = useRef(0);

  useEffect(() => {
    if (!remotePhoto) {
      setPhotoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(remotePhoto);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [remotePhoto]);

  useEffect(() => {
    if (today) setClockInError(null);
    if (!today || today.clock_out) setClockOutError(null);
  }, [today]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setCameraStream(null);
  }, []);

  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const detectDeviceCameraCapabilities = useCallback(async (preferredMode, activeTrack) => {
    const trackFacing = activeTrack?.getSettings?.().facingMode;
    const effectiveMode = trackFacing || preferredMode;
    setCameraMirrored(effectiveMode === 'user');

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCanFlip(videoInputs.length > 1);
    } catch {
      setCanFlip(true);
    }
  }, []);

  const startStream = useCallback(async (targetMode) => {
    const startId = ++startIdRef.current;
    stopStream();
    setCameraReady(false);
    setCameraError(null);
    setCameraStarting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not available. Open the app over HTTPS and use a supported browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (startId !== startIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      await detectDeviceCameraCapabilities(targetMode, videoTrack);

      streamRef.current = stream;
      setCameraStream(stream);
    } catch (err) {
      if (startId !== startIdRef.current) return;
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in your browser settings.'
          : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
            ? targetMode === 'environment'
              ? 'Back camera is not available on this device. Try the front camera instead.'
              : 'Front camera is not available on this device.'
            : err.name === 'NotReadableError'
              ? 'The camera is being used by another app. Close it and try again.'
              : err.message || 'Could not open camera';
      setCameraError(msg);
      messageApi.error(msg);
    } finally {
      if (startId === startIdRef.current) {
        setCameraStarting(false);
      }
    }
  }, [detectDeviceCameraCapabilities, messageApi, stopStream]);

  const openCameraWithMode = useCallback((mode) => {
    setFacingMode(mode);
    setCameraOpen(true);
    startStream(mode);
  }, [startStream]);

  const closeCamera = useCallback(() => {
    startIdRef.current += 1;
    stopStream();
    setCameraOpen(false);
    setCameraReady(false);
    setCameraStarting(false);
    setCameraError(null);
  }, [stopStream]);

  // Lock background scroll & support Escape key while full-screen camera is open
  useEffect(() => {
    if (!cameraOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeCamera();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [cameraOpen, closeCamera]);

  const flipCamera = useCallback(() => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startStream(nextMode);
  }, [facingMode, startStream]);

  useEffect(() => {
    if (!videoEl) return;
    videoEl.srcObject = cameraStream || null;
    if (cameraStream) {
      videoEl.play().catch(() => {});
    }
  }, [videoEl, cameraStream]);

  const captureFromCamera = async () => {
    const video = videoEl;
    if (!video || !cameraReady || capturingPhoto) return;

    setCapturingPhoto(true);
    try {
      if (!navigator.geolocation) {
        throw new Error('Location is not supported by this browser');
      }
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => reject(new Error(error.message || 'Allow location access to capture the photo location')),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });

      const coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      const capturedAt = new Date();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');

      if (cameraMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Failed to capture photo');

      const sourceName = cameraMirrored ? 'Front camera (Selfie)' : 'Back camera';
      const fileName = `${cameraMirrored ? 'selfie' : 'back_camera'}_${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      setRemotePhoto(file);
      setPhotoCoordinates(coordinates);
      setPhotoCapturedAt(capturedAt);
      setPhotoSourceLabel(sourceName);
      closeCamera();
      messageApi.success(`${sourceName} photo captured`);
    } catch (err) {
      messageApi.error(err.message || 'Could not capture photo and location');
    } finally {
      setCapturingPhoto(false);
    }
  };

  const clearCapturedPhoto = () => {
    setRemotePhoto(null);
    setPhotoCoordinates(null);
    setPhotoCapturedAt(null);
    setPhotoSourceLabel(null);
  };

  // ═══════════ CLOCK IN & CLOCK OUT ═══════════
  const canClockIn = Boolean(!today && withinWindow);
  const canClockInOnsite =
    canClockIn &&
    (!enforceLocation || !locationBlocked) &&
    (!networkIsEnforced || ipAllowed);

  const isOnsiteToday = Boolean(today && today.clock_in_mode !== 'remote');
  const onsiteOutBlocked =
    isOnsiteToday && ((enforceLocation && !geoInside) || networkBlocked);

  const canClockOut = Boolean(
    today &&
    !today.clock_out &&
    !pendingEarly &&
    (today.clock_in_mode === 'remote' || !onsiteOutBlocked)
  );

  const clockIn = async (mode = 'onsite') => {
    if (mode === 'remote' && !remoteLocation.trim()) {
      messageApi.error('Enter the location where you are working today');
      return;
    }
    if (mode === 'remote' && !remotePhoto) {
      messageApi.error('Take a live photo with your camera before clocking in');
      return;
    }
    if (mode === 'remote' && !photoCoordinates) {
      messageApi.error('Retake the photo to capture its GPS location');
      return;
    }

    setClocking(true);
    setClockInError(null);
    try {
      let coords = geo.coords;
      if (mode === 'remote') {
        coords = photoCoordinates;
      } else if (!coords && navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
      }

      if (mode === 'remote') {
        const formData = new FormData();
        formData.append('mode', 'remote');
        formData.append('remote_location', remoteLocation.trim());
        formData.append('lat', String(coords.lat));
        formData.append('lng', String(coords.lng));
        formData.append('selfie', remotePhoto);
        if (photoCapturedAt) formData.append('captured_at', photoCapturedAt.toISOString());
        await api.post('/attendance/clock-in', formData);
      } else {
        await api.post('/attendance/clock-in', { mode: 'onsite', ...(coords || {}) });
      }

      messageApi.success('Clocked in!');
      window.dispatchEvent(new Event('attendance:changed'));
      setClockModeOpen(false);
      setRemoteClockInOpen(false);
      setRemoteLocation('');
      clearCapturedPhoto();
      await onRefreshAll();
      onRefreshChecks();
    } catch (e) {
      const data = e.response?.data;
      const msg = data?.message || e.message || 'Clock-in failed';
      setClockInError({
        message: msg,
        requiresOfficeWifi: !!data?.requiresOfficeWifi,
        requiresLocation: !!data?.requiresLocation,
        distance: data?.distance,
        radius: data?.radius,
        sawIp: data?.sawIp,
      });
      messageApi.error(msg);
      onRefreshChecks();
    } finally {
      setClocking(false);
    }
  };

  const clockOut = async (tasksList) => {
    const hasTasksArg = Array.isArray(tasksList);

    if (today?.clock_in_mode === 'remote' && !hasTasksArg) {
      setRemoteClockOutOpen(true);
      return;
    }
    if (today?.clock_in_mode === 'remote' && hasTasksArg && tasksList.length === 0) {
      messageApi.error('Add at least one completed task before clocking out');
      return;
    }

    const tasksText = hasTasksArg
      ? tasksList.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : null;

    setClocking(true);
    setClockOutError(null);
    try {
      const payload = {};
      if (hasTasksArg) payload.tasks_completed = tasksText;

      if (today?.clock_in_mode !== 'remote') {
        let coords = geo.coords;
        if (!coords && navigator.geolocation) {
          coords = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
        }
        if (coords) {
          payload.lat = coords.lat;
          payload.lng = coords.lng;
        }
      }

      await api.post('/attendance/clock-out', payload);
      messageApi.success('Clocked out!');
      window.dispatchEvent(new Event('attendance:changed'));
      setRemoteClockOutOpen(false);
      setRemoteTasks([]);
      setTaskInput('');
      await onRefreshAll();
      onRefreshChecks();
    } catch (e) {
      const data = e.response?.data;

      if (data?.requiresApproval) {
        setRemoteClockOutOpen(false);
        setEarlyModalOpen(true);
        setEarlyReason('');
      } else if (data?.requiresOfficeWifi) {
        setClockOutError({
          message: 'You must be on the office Wi-Fi to clock out.',
          requiresOfficeWifi: true,
          sawIp: data?.sawIp,
        });
        messageApi.error('Connect to the office Wi-Fi to clock out');
        onRefreshChecks();
      } else if (data?.requiresLocation) {
        setClockOutError({
          message: 'Enable location/GPS to clock out.',
          requiresLocation: true,
        });
        messageApi.error('Enable GPS to clock out');
      } else if (data?.distance != null) {
        setClockOutError({
          message: `You are ${data.distance}m from the office.`,
          distance: data.distance,
          radius: data.radius,
        });
        messageApi.error(`You are ${data.distance}m away. Must be within ${data.radius}m.`);
      } else {
        messageApi.error(data?.message || 'Clock-out failed');
      }
    } finally {
      setClocking(false);
    }
  };

  // ═══════════ TASK LIST HANDLERS ═══════════
  const addTask = () => {
    const trimmed = taskInput.trim();
    if (!trimmed) return messageApi.warning('Type a task before adding');
    if (trimmed.length > 500) return messageApi.warning('Each task must be 500 characters or fewer');
    setRemoteTasks((prev) => [...prev, trimmed]);
    setTaskInput('');
  };
  const removeTask = (index) => setRemoteTasks((prev) => prev.filter((_, i) => i !== index));
  const handleTaskInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTask();
    }
  };

  // ═══════════ EARLY LEAVE ═══════════
  const submitEarlyRequest = async () => {
    if (!earlyReason.trim()) return messageApi.error('Please provide a reason');
    setSubmittingRequest(true);
    try {
      await api.post('/attendance/early-leave/request', { reason: earlyReason.trim() });
      messageApi.success('Request submitted. Waiting for admin approval.');
      setEarlyModalOpen(false);
      setEarlyReason('');
      await onRefreshAll();
    } catch (e) {
      messageApi.error(e.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const cancelEarlyRequest = async () => {
    if (!pendingEarly) return;
    setCancelling(true);
    try {
      await api.delete('/attendance/early-leave/' + pendingEarly.id);
      messageApi.success('Request cancelled');
      await onRefreshAll();
    } catch (e) {
      messageApi.error(e.response?.data?.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const clockOutBlockedDescription = (() => {
    if (!isOnsiteToday) return null;
    const bits = [];
    if (enforceLocation && !geoInside) {
      bits.push(
        geo.status === 'outside'
          ? `GPS: you are ${geo.distance}m away (max ${geo.radius}m)`
          : geo.status === 'denied'
            ? 'GPS permission denied'
            : geo.status === 'unsupported'
              ? 'GPS not supported by this device'
              : geo.status === 'no-office'
                ? 'Office location not configured'
                : 'GPS: checking…'
      );
    }
    if (networkBlocked) {
      bits.push(`Wi-Fi: ${ipCheck?.clientIp || 'unknown IP'} is not on the office network`);
    }
    return bits.length ? bits.join(' · ') : null;
  })();

  const cameraLabel = facingMode === 'user' ? 'Front camera' : 'Back camera';
  const flipLabel = facingMode === 'user' ? 'Back camera' : 'Front camera';

  const fullscreenCameraOverlay = cameraOpen
    ? createPortal(
        <div
          className="cc-cam-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="Take a photo"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483000,
            width: '100vw',
            height: '100dvh',
            backgroundColor: '#000',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 24px',
              background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%)',
            }}
          >
            <span
              className="cc-cam-badge"
              style={{
                position: 'static',
                background: 'rgba(20, 20, 20, 0.72)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {cameraLabel}
            </span>

            <Button
              type="text"
              shape="circle"
              size="large"
              icon={<CloseOutlined style={{ color: '#fff', fontSize: 18 }} />}
              onClick={closeCamera}
              aria-label="Close camera"
              style={{
                background: 'rgba(20, 20, 20, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                width: 42,
                height: 42,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </div>

          <div
            style={{
              position: 'relative',
              flex: 1,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#000',
            }}
          >
            {cameraError ? (
              <div style={{ padding: 24, maxWidth: 420, width: '100%', zIndex: 2 }}>
                <Alert
                  type="error"
                  showIcon
                  title="Camera unavailable"
                  description={cameraError}
                  action={
                    <Space>
                      <Button size="small" onClick={() => startStream(facingMode)}>
                        Try again
                      </Button>
                      <Button size="small" onClick={closeCamera}>
                        Close
                      </Button>
                    </Space>
                  }
                />
              </div>
            ) : (
              <>
                <video
                  ref={setVideoEl}
                  className="cc-cam-video"
                  playsInline
                  muted
                  autoPlay
                  onLoadedMetadata={() => setCameraReady(true)}
                  onPlaying={() => setCameraReady(true)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    transform: cameraMirrored ? 'scaleX(-1)' : 'none',
                  }}
                />
                {(!cameraReady || cameraStarting) && (
                  <div
                    className="cc-cam-overlay"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      color: '#fff',
                      background: 'rgba(0, 0, 0, 0.75)',
                      fontSize: 15,
                    }}
                  >
                    <LoadingOutlined style={{ fontSize: 28 }} />
                    <span>Starting {cameraLabel.toLowerCase()}…</span>
                  </div>
                )}
              </>
            )}
          </div>

          {!cameraError && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '28px 16px calc(env(safe-area-inset-bottom, 0px) + 22px)',
                background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0) 100%)',
              }}
            >
              {canFlip && (
                <Button
                  size="large"
                  icon={<SwapOutlined />}
                  onClick={flipCamera}
                  disabled={cameraStarting || capturingPhoto}
                  style={{
                    height: 48,
                    borderRadius: 999,
                    paddingInline: 18,
                    background: 'rgba(30, 30, 30, 0.82)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  {flipLabel}
                </Button>
              )}
              <Button
                type="primary"
                size="large"
                className="cc-btn cc-btn-in"
                icon={<CameraOutlined />}
                loading={capturingPhoto}
                disabled={!cameraReady || !!cameraError}
                onClick={captureFromCamera}
                style={{
                  height: 52,
                  borderRadius: 999,
                  paddingInline: 26,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {capturingPhoto ? 'Capturing…' : 'Capture photo'}
              </Button>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="cc-alerts">
        {clockInUnavailableReason && (
          <Alert
            type="warning"
            showIcon
            title={clockInUnavailableReason}
            description={`Your administrator's clock-in hours are ${String(settings.work_start).slice(0, 5)}–${String(settings.work_end).slice(0, 5)}.`}
          />
        )}

        {clockInError && !today && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setClockInError(null)}
            title={clockInError.message}
            description={
              clockInError.requiresOfficeWifi ? (
                <>
                  <Text strong>Connect to the office Wi-Fi network</Text> and try again.
                  {clockInError.sawIp && (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      <Text type="secondary">Your current IP: </Text>
                      <Text code>{clockInError.sawIp}</Text>
                    </div>
                  )}
                </>
              ) : clockInError.requiresLocation ? (
                'Enable location/GPS in your browser settings, then try again.'
              ) : clockInError.distance != null ? (
                `You are ${clockInError.distance}m away. Move within ${clockInError.radius}m of the office.`
              ) : (
                'Try again or contact your administrator.'
              )
            }
          />
        )}

        {today?.needs_review && (
          <Alert
            type="warning"
            showIcon
            title="Missed clock-out — awaiting admin review"
            description="You did not clock out within 24 hours of your clock-in. An administrator will review this day and mark you present or absent."
          />
        )}

        {clockOutError && today && !today.clock_out && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setClockOutError(null)}
            title={clockOutError.message}
            description={
              clockOutError.requiresOfficeWifi ? (
                <>
                  <Text strong>Connect to the office Wi-Fi</Text> to clock out.
                  {clockOutError.sawIp && (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      <Text type="secondary">Your current IP: </Text>
                      <Text code>{clockOutError.sawIp}</Text>
                    </div>
                  )}
                </>
              ) : clockOutError.requiresLocation ? (
                'Enable location/GPS in your browser settings to clock out.'
              ) : clockOutError.distance != null ? (
                `You are ${clockOutError.distance}m away. Move within ${clockOutError.radius}m of the office.`
              ) : (
                'Try again or contact your administrator.'
              )
            }
            action={
              <Button size="small" onClick={onRefreshChecks}>
                Retry
              </Button>
            }
          />
        )}

        {isOnsiteToday && clockOutBlockedDescription && !today.clock_out && (
          <Alert
            type="warning"
            showIcon
            title="Clock-out requires the office GPS and Wi-Fi"
            description={clockOutBlockedDescription}
            action={
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={onRefreshChecks}
                loading={ipChecking}
              >
                Re-check
              </Button>
            }
          />
        )}

        {today && !today.clock_out && today.clock_in_mode !== 'remote' && !today.needs_review && (
          <Alert
            type="info"
            showIcon
            title="On-site presence monitoring"
            description="Keep the employee app open. You must be within the office GPS and on the office Wi-Fi to clock out. The time you clock out is what gets recorded — not the scheduled closing time. If you never clock out within 24 hours, admin will review your day."
          />
        )}

        {pendingEarly && (
          <Alert
            type="warning"
            showIcon
            title="Early clock-out pending approval"
            description={
              <div>
                <div>
                  You requested to leave at <Text strong>{pendingEarly.requested_out_time}</Text>.
                </div>
                <Popconfirm
                  title="Cancel this request?"
                  okText="Yes, cancel"
                  okButtonProps={{ danger: true }}
                  cancelText="Keep it"
                  onConfirm={cancelEarlyRequest}
                >
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={cancelling}
                    style={{ marginTop: 8 }}
                  >
                    Cancel request
                  </Button>
                </Popconfirm>
              </div>
            }
          />
        )}

        {approvedEarly && !today?.clock_out && (
          <Alert
            type="success"
            showIcon
            title="Early clock-out approved"
            description="You can now click Clock Out when you're inside the office GPS and Wi-Fi."
          />
        )}

        {rejectedEarly && !today?.clock_out && (
          <Alert
            type="error"
            showIcon
            title="Early clock-out rejected"
            description={
              rejectedEarly.admin_note
                ? `Admin note: ${rejectedEarly.admin_note}`
                : 'Your request was not approved. Please continue your shift.'
            }
          />
        )}
      </div>

      <div className="cc-actions">
        <Button
          className="cc-btn cc-btn-in"
          icon={<LoginOutlined />}
          onClick={() => setClockModeOpen(true)}
          disabled={!canClockIn}
          loading={clocking && canClockIn}
        >
          Clock in
        </Button>
        <Button
          className="cc-btn cc-btn-out"
          icon={<LogoutOutlined />}
          onClick={() => clockOut()}
          disabled={!canClockOut}
          loading={clocking && canClockOut}
        >
          Clock out
        </Button>
      </div>

      <div className="cc-note">
        {pendingEarly && (
          <Badge status="warning" text={<Text type="secondary">Awaiting admin approval</Text>} />
        )}
        {approvedEarly && !today?.clock_out && (
          <Badge status="success" text={<Text type="secondary">Approved — you can clock out</Text>} />
        )}
        {today?.clock_out && (
          <Badge status="success" text={<Text type="secondary">Day complete — see you tomorrow</Text>} />
        )}
      </div>

      {/* ═══════════ Clock mode modal ═══════════ */}
      <Modal
        {...MODAL_COMMON}
        open={clockModeOpen}
        title={mark('How are you working today?')}
        footer={null}
        onCancel={() => setClockModeOpen(false)}
        width={isMobile ? 'calc(100vw - 24px)' : 540}
      >
        <Text type="secondary">
          Choose where you are reporting from so we run the right checks.
        </Text>
        <div className="cc-modes">
          <div className="cc-mode">
            <WifiOutlined className="cc-mode-ic" />
            <Text strong>On-site</Text>
            <Text type="secondary" style={{ minHeight: 40 }}>
              Clock in at the office. We check your GPS and the office Wi-Fi.
            </Text>
            <Button
              block
              disabled={!canClockInOnsite}
              loading={clocking && canClockInOnsite}
              onClick={() => clockIn('onsite')}
            >
              Clock in on-site
            </Button>
            {!canClockInOnsite && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {clockInUnavailableReason
                  ? clockInUnavailableReason
                  : networkIsEnforced && !ipAllowed
                    ? 'You must be on the office Wi-Fi network.'
                    : enforceLocation && locationBlocked
                      ? 'You must be within the office GPS radius.'
                      : 'Office checks must pass.'}
              </Text>
            )}
          </div>

          <div className="cc-mode cc-mode-remote">
            <HomeOutlined className="cc-mode-ic" />
            <Text strong>Remote</Text>
            <Text type="secondary" style={{ minHeight: 40 }}>
              Working in the field or from home. Share your location and a live photo.
            </Text>
            <Button
              type="primary"
              block
              disabled={!canClockIn}
              loading={clocking && canClockIn}
              onClick={() => {
                setClockModeOpen(false);
                setRemoteClockInOpen(true);
              }}
            >
              Clock in remotely
            </Button>
            {!canClockIn && clockInUnavailableReason && (
              <Text type="secondary" style={{ fontSize: 12 }}>{clockInUnavailableReason}</Text>
            )}
          </div>
        </div>
      </Modal>

      {/* ═══════════ Remote clock-in modal ═══════════ */}
      <Modal
        {...MODAL_COMMON}
        open={remoteClockInOpen && !cameraOpen}
        title={mark('Remote clock-in')}
        okText="Submit and clock in"
        cancelText="Cancel"
        confirmLoading={clocking}
        okButtonProps={{ disabled: !remoteLocation.trim() || !remotePhoto || !photoCoordinates }}
        onOk={() => clockIn('remote')}
        onCancel={() => {
          setRemoteClockInOpen(false);
          clearCapturedPhoto();
        }}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="Remote attendance check"
            description={
              settings?.work_start && settings?.work_end
                ? `Remote clock-in is available from ${String(settings.work_start).slice(0, 5)} to ${String(settings.work_end).slice(0, 5)}. Enter your work location, allow GPS, and take a live photo.`
                : 'Enter your work location, allow GPS, and take a live photo during working hours.'
            }
          />

          <div>
            <Text strong>Work location</Text>
            <Input
              value={remoteLocation}
              onChange={(e) => setRemoteLocation(e.target.value)}
              placeholder="e.g. Client farm, town or site name"
              maxLength={255}
              showCount
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <Text strong>Live photo at your work location</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 2, marginBottom: 8 }}>
              Take a live photo using the front camera (selfie) or back camera. Uploading from your gallery is disabled.
            </Text>

            {photoPreview ? (
              <div>
                <img
                  src={photoPreview}
                  alt="Captured remote work preview"
                  style={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12 }}
                />
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {photoSourceLabel && <Tag color="green" style={{ margin: 0 }}>{photoSourceLabel}</Tag>}
                  {photoCapturedAt && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Captured at {photoCapturedAt.toLocaleTimeString()}
                    </Text>
                  )}
                </div>
                {photoCoordinates && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                    GPS captured with photo: {photoCoordinates.lat.toFixed(6)}, {photoCoordinates.lng.toFixed(6)}
                    {Number.isFinite(photoCoordinates.accuracy)
                      ? ` (accuracy ±${Math.round(photoCoordinates.accuracy)} m)`
                      : ''}
                  </Text>
                )}
                <Space style={{ marginTop: 8 }} wrap>
                  <Button
                    icon={<CameraOutlined />}
                    onClick={() => openCameraWithMode('user')}
                    size="small"
                  >
                    Retake (Front)
                  </Button>
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => openCameraWithMode('environment')}
                    size="small"
                  >
                    Retake (Back)
                  </Button>
                  <Button
                    type="link"
                    danger
                    onClick={clearCapturedPhoto}
                    style={{ paddingLeft: 0 }}
                  >
                    Remove photo
                  </Button>
                </Space>
              </div>
            ) : (
              <div className="cc-cam-entry-group">
                <div className="cc-cam-entry-row">
                  <Button
                    type="primary"
                    icon={<CameraOutlined />}
                    onClick={() => openCameraWithMode('user')}
                    size="large"
                    className="cc-btn cc-btn-in cc-cam-entry-btn"
                  >
                    Front camera (Selfie)
                  </Button>
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => openCameraWithMode('environment')}
                    size="large"
                    className="cc-btn cc-btn-ghost cc-cam-entry-btn"
                  >
                    Back camera
                  </Button>
                </div>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 10 }}
                  title="Live camera photo required"
                  description="You must take a live photo using the front or back camera."
                />
              </div>
            )}
          </div>
        </Space>
      </Modal>

      {/* ═══════════ Remote clock-out modal (tasks) ═══════════ */}
      <Modal
        {...MODAL_COMMON}
        open={remoteClockOutOpen}
        title={mark('What did you complete today?')}
        okText="Submit and clock out"
        cancelText="Cancel"
        confirmLoading={clocking}
        okButtonProps={{ disabled: remoteTasks.length === 0 }}
        onOk={() => clockOut(remoteTasks)}
        onCancel={() => setRemoteClockOutOpen(false)}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="List today's completed tasks"
            description="Add at least one task before clocking out."
          />
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={handleTaskInputKeyDown}
              placeholder="e.g. Visited 3 client farms"
              maxLength={500}
            />
            <Button type="primary" onClick={addTask}>Add</Button>
          </Space.Compact>
          {remoteTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {remoteTasks.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#faf7f3', border: '1px solid #e6ded4',
                    borderRadius: 10, padding: '6px 10px',
                  }}
                >
                  <Text style={{ flex: 1 }}>{i + 1}. {t}</Text>
                  <Button type="link" danger size="small" onClick={() => removeTask(i)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary">No tasks added yet.</Text>
          )}
        </Space>
      </Modal>

      {/* ═══════════ Early leave modal ═══════════ */}
      <Modal
        {...MODAL_COMMON}
        open={earlyModalOpen}
        title={mark('Request early clock-out')}
        okText="Send request"
        cancelText="Cancel"
        confirmLoading={submittingRequest}
        onOk={submitEarlyRequest}
        onCancel={() => setEarlyModalOpen(false)}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            title="Admin approval required"
            description="You cannot clock out before your scheduled end time without approval. Your request will go to an administrator."
          />
          <div>
            <Text strong>Reason</Text>
            <TextArea
              value={earlyReason}
              onChange={(e) => setEarlyReason(e.target.value)}
              rows={4}
              maxLength={5000}
              showCount
              placeholder="Explain why you need to leave early"
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      </Modal>

      {fullscreenCameraOverlay}
    </>
  );
}