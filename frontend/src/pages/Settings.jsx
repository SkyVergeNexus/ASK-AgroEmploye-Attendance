import { useEffect, useState, useMemo } from 'react';
import {
  Card, Form, TimePicker, InputNumber, Input, Button, Typography,
  Space, Alert, Skeleton, Switch, Tag, Spin, Upload, Collapse,
} from 'antd';
import {
  SaveOutlined, ReloadOutlined, EnvironmentOutlined, AimOutlined,
  WifiOutlined, PlusOutlined, UploadOutlined, PictureOutlined, DeleteOutlined,
  CheckCircleFilled, CloseCircleFilled, SettingOutlined, ClockCircleOutlined,
  BankOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';
import { assetUrl } from '../config';
import toast from 'react-hot-toast';
import EmailSenderSettings from '../components/EmailSenderSettings';

const { Title, Text } = Typography;
const { TextArea } = Input;

const BRAND = '#065f46';
const BRAND_SOFT = '#ecfdf5';
const BORDER = '#e5e7eb';

/* ---------- IP helpers (unchanged logic) ---------- */

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + ((nums[1] << 16) >>> 0) + ((nums[2] << 8) >>> 0) + (nums[3] >>> 0);
}

function ipv4InCidr(ip, entry) {
  if (!entry) return false;
  if (!entry.includes('/')) return ip === entry;
  const [base, bitsStr] = entry.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN == null || baseN == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

function ipMatchesAllowList(ip, allowedIps) {
  if (!ip) return false;
  const entries = String(allowedIps || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!entries.length) return false;
  return entries.some((entry) => ipv4InCidr(ip, entry));
}

/* ---------- Small presentational pieces ---------- */

function IconBadge({ icon }) {
  return (
    <span
      style={{
        width: 36, height: 36, borderRadius: 10, background: BRAND_SOFT, color: BRAND,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

function Section({ icon, title, description, children }) {
  return (
    <Card
      variant="borderless"
      style={{ border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20 }}
      styles={{ body: { padding: 0 } }}
    >
      <div
        style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <IconBadge icon={icon} />
        <div>
          <Title level={5} style={{ margin: 0 }}>{title}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
        </div>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </Card>
  );
}

function Stat({ icon, label, value, on }) {
  return (
    <div
      style={{
        flex: '1 1 180px', display: 'flex', gap: 12, alignItems: 'center',
        padding: '14px 16px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
      }}
    >
      <IconBadge icon={icon} />
      <div style={{ minWidth: 0 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{label}</Text>
        <Text strong style={{ fontSize: 15, color: on === false ? '#6b7280' : undefined }}>{value}</Text>
      </div>
    </div>
  );
}

function ToggleRow({ name, title, help }) {
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
        padding: '14px 16px', background: '#f9fafb', border: `1px solid ${BORDER}`,
        borderRadius: 10, marginBottom: 20,
      }}
    >
      <div>
        <Text strong style={{ display: 'block' }}>{title}</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{help}</Text>
      </div>
      <Form.Item name={name} valuePropName="checked" style={{ margin: 0 }}>
        <Switch checkedChildren="On" unCheckedChildren="Off" />
      </Form.Item>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [enforce, setEnforce] = useState(false);
  const [enforceNetwork, setEnforceNetwork] = useState(true);
  const [hours, setHours] = useState({ start: null, end: null, late: 0 });

  const [currentIp, setCurrentIp] = useState(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [allowedIpsValue, setAllowedIpsValue] = useState('');

  const [coverUrl, setCoverUrl] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings');
      const enforcedLoc = !!Number(data.enforce_location);
      const enforcedNet = data.enforce_network == null ? true : !!Number(data.enforce_network);
      const start = dayjs(data.work_start, 'HH:mm:ss');
      const end = dayjs(data.work_end, 'HH:mm:ss');
      setEnforce(enforcedLoc);
      setEnforceNetwork(enforcedNet);
      setCoverUrl(data.login_cover_url || null);
      setAllowedIpsValue(data.allowed_ips || '');
      setHours({ start, end, late: data.late_threshold_minutes ?? 0 });
      form.setFieldsValue({
        company_name: data.company_name,
        work_start: start,
        work_end: end,
        late_threshold_minutes: data.late_threshold_minutes,
        office_lat: data.office_lat ? Number(data.office_lat) : null,
        office_lng: data.office_lng ? Number(data.office_lng) : null,
        geofence_radius_m: data.geofence_radius_m ?? 200,
        enforce_location: enforcedLoc,
        enforce_network: enforcedNet,
        allowed_ips: data.allowed_ips || '',
      });
      setDirty(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentIp = async () => {
    setIpLoading(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setCurrentIp(data.ip || null);
    } catch {
      setCurrentIp(null);
    } finally {
      setIpLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadCurrentIp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      return toast.error('Geolocation is not supported by this browser');
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setFieldsValue({
          office_lat: Number(pos.coords.latitude.toFixed(7)),
          office_lng: Number(pos.coords.longitude.toFixed(7)),
        });
        setDirty(true);
        toast.success('Filled with current location');
        setLocating(false);
      },
      (err) => {
        toast.error(err.message || 'Could not get location');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const setIpList = (next) => {
    form.setFieldsValue({ allowed_ips: next });
    setAllowedIpsValue(next);
    setDirty(true);
  };

  const addCurrentIpToAllowList = () => {
    if (!currentIp) return toast.error('No current IP detected');
    const list = (form.getFieldValue('allowed_ips') || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (list.includes(currentIp)) return toast('This IP is already in the list');
    setIpList([...list, currentIp].join(', '));
    toast.success('IP added to allowlist');
  };

  const removeIpFromList = (ip) => {
    const next = (form.getFieldValue('allowed_ips') || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && x !== ip)
      .join(', ');
    setIpList(next);
  };

  const ipPreview = useMemo(() => {
    if (!currentIp) return null;
    if (!allowedIpsValue.trim()) return { matches: false };
    return { matches: ipMatchesAllowList(currentIp, allowedIpsValue) };
  }, [currentIp, allowedIpsValue]);

  const savedIps = useMemo(
    () => allowedIpsValue.split(',').map((x) => x.trim()).filter(Boolean),
    [allowedIpsValue]
  );

  const uploadCover = async (file) => {
    const fd = new FormData();
    fd.append('cover', file);
    setUploadingCover(true);
    try {
      const { data } = await api.post('/settings/cover', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCoverUrl(data.login_cover_url);
      toast.success('Cover updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploadingCover(false);
    }
  };

  const resetCover = async () => {
    setUploadingCover(true);
    try {
      await api.delete('/settings/cover');
      setCoverUrl(null);
      toast.success('Cover reset to default');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset');
    } finally {
      setUploadingCover(false);
    }
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await api.put('/settings', {
        company_name: values.company_name,
        work_start: values.work_start.format('HH:mm:ss'),
        work_end: values.work_end.format('HH:mm:ss'),
        late_threshold_minutes: values.late_threshold_minutes,
        office_lat: values.office_lat,
        office_lng: values.office_lng,
        geofence_radius_m: values.geofence_radius_m,
        enforce_location: values.enforce_location ? 1 : 0,
        enforce_network: values.enforce_network ? 1 : 0,
        allowed_ips: values.allowed_ips || null,
      });
      toast.success('Settings saved');
      setAllowedIpsValue(values.allowed_ips || '');
      setDirty(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const lateAfter =
    hours.start && hours.start.isValid()
      ? hours.start.add(Number(hours.late) || 0, 'minute').format('HH:mm')
      : '--:--';
  const fmt = (d) => (d && d.isValid() ? d.format('HH:mm') : '--:--');

  const rulesItems = [
    {
      key: 'rules',
      label: (
        <Space>
          <InfoCircleOutlined style={{ color: BRAND }} />
          <Text strong>How attendance rules work</Text>
        </Space>
      ),
      children: (
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Employees can clock in only within the configured work hours.</li>
          <li>Anyone clocking in after work start plus the late threshold is marked late.</li>
          <li>On-site clock-ins follow the location and network checks below when their switches are on.</li>
          <li>Remote clock-ins need a selfie and GPS location, and are accepted only during work hours.</li>
          <li>
            On-site presence is monitored while the employee app is open. After closing, employees
            verified on-site stay clocked in until their departure is detected. Anyone outside the
            monitored area, or who cannot be verified, is sent to admin review.
          </li>
          <li>Early on-site clock-outs need admin approval. Remote employees can clock out when their work is done.</li>
        </ul>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <span
          style={{
            width: 48, height: 48, borderRadius: 12, background: BRAND, color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}
        >
          <SettingOutlined />
        </span>
        <div>
          <Title level={3} style={{ margin: 0, color: BRAND }}>System settings</Title>
          <Text type="secondary">Work hours, branding, location and network rules</Text>
        </div>
      </div>

      {loading ? (
        <Card variant="borderless" style={{ border: `1px solid ${BORDER}`, borderRadius: 12 }}>
          <Skeleton active paragraph={{ rows: 12 }} />
        </Card>
      ) : (
        <>
          {/* Live summary */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <Stat icon={<ClockCircleOutlined />} label="Work hours" value={`${fmt(hours.start)} to ${fmt(hours.end)}`} />
            <Stat icon={<ClockCircleOutlined />} label="Marked late after" value={lateAfter} />
            <Stat
              icon={<EnvironmentOutlined />}
              label="GPS geofence"
              value={enforce ? 'Enforced' : 'Off'}
              on={enforce}
            />
            <Stat
              icon={<WifiOutlined />}
              label="Office network"
              value={enforceNetwork ? 'Enforced' : 'Off'}
              on={enforceNetwork}
            />
          </div>

          <Collapse
            ghost
            items={rulesItems}
            style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20 }}
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            onValuesChange={(changed, all) => {
              setDirty(true);
              if ('enforce_location' in changed) setEnforce(!!changed.enforce_location);
              if ('enforce_network' in changed) setEnforceNetwork(!!changed.enforce_network);
              if ('allowed_ips' in changed) setAllowedIpsValue(changed.allowed_ips || '');
              if ('work_start' in changed || 'work_end' in changed || 'late_threshold_minutes' in changed) {
                setHours({
                  start: all.work_start,
                  end: all.work_end,
                  late: all.late_threshold_minutes,
                });
              }
            }}
          >
            {/* ===== GENERAL + HOURS ===== */}
            <Section
              icon={<BankOutlined />}
              title="Company and work hours"
              description="Your company name and the daily schedule used for attendance."
            >
              <Form.Item
                label="Company name"
                name="company_name"
                rules={[{ required: true, message: 'Company name is required' }]}
              >
                <Input size="large" placeholder="ASK Agrobusiness Limited" />
              </Form.Item>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Form.Item
                  label="Work start"
                  name="work_start"
                  rules={[{ required: true, message: 'Work start is required' }]}
                >
                  <TimePicker size="large" format="HH:mm" use12Hours={false} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label="Work end"
                  name="work_end"
                  rules={[{ required: true, message: 'Work end is required' }]}
                >
                  <TimePicker size="large" format="HH:mm" use12Hours={false} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label="Late threshold (minutes)"
                  name="late_threshold_minutes"
                  tooltip="Grace period after work start before a clock-in is marked late."
                  rules={[{ required: true, message: 'Late threshold is required' }]}
                >
                  <InputNumber size="large" min={0} max={240} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </Section>

            {/* ===== BRANDING ===== */}
            <Section
              icon={<PictureOutlined />}
              title="Login and register cover"
              description="Background image shown on the sign-in and registration pages."
            >
              <div
                style={{
                  position: 'relative', height: 200, borderRadius: 10, overflow: 'hidden',
                  border: `1px solid ${BORDER}`, marginBottom: 16,
                  backgroundImage: coverUrl
                    ? `url("${assetUrl(coverUrl)}")`
                    : 'linear-gradient(135deg, #065f46 0%, #047857 50%, #065f46 100%)',
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}
              >
                <div
                  style={{
                    position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
                    width: 150, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.95)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                  }}
                >
                  <div style={{ height: 8, width: 60, background: BRAND, borderRadius: 4, marginBottom: 12 }} />
                  <div style={{ height: 14, background: '#e5e7eb', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ height: 14, background: '#e5e7eb', borderRadius: 4, marginBottom: 12 }} />
                  <div style={{ height: 16, background: BRAND, borderRadius: 4 }} />
                </div>
                <Tag style={{ position: 'absolute', left: 12, bottom: 12, margin: 0 }}>
                  {coverUrl ? 'Custom cover' : 'Default theme'}
                </Tag>
              </div>

              <Space wrap>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    if (!/^image\//.test(file.type)) {
                      toast.error('Only image files are allowed');
                      return Upload.LIST_IGNORE;
                    }
                    if (file.size / 1024 / 1024 >= 5) {
                      toast.error('Image must be under 5 MB');
                      return Upload.LIST_IGNORE;
                    }
                    uploadCover(file);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={uploadingCover}>
                    Upload new cover
                  </Button>
                </Upload>
                {coverUrl && (
                  <Button danger icon={<DeleteOutlined />} onClick={resetCover} loading={uploadingCover}>
                    Use default theme
                  </Button>
                )}
              </Space>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 10 }}>
                Best results: 1600x900 JPG or PNG, under 5 MB. Cover changes apply immediately and do not
                need Save changes.
              </Text>
            </Section>

            {/* ===== GEOFENCE ===== */}
            <Section
              icon={<EnvironmentOutlined />}
              title="Office location and geofence"
              description="Limit on-site clock-ins to a radius around your office."
            >
              <ToggleRow
                name="enforce_location"
                title="Require GPS location on clock-in"
                help="Employees must be within the radius of the office coordinates."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Item
                  label="Office latitude"
                  name="office_lat"
                  rules={enforce ? [{ required: true, message: 'Latitude is required when enforcing' }] : []}
                >
                  <InputNumber size="large" step={0.0000001} precision={7} style={{ width: '100%' }} placeholder="-1.2921000" />
                </Form.Item>
                <Form.Item
                  label="Office longitude"
                  name="office_lng"
                  rules={enforce ? [{ required: true, message: 'Longitude is required when enforcing' }] : []}
                >
                  <InputNumber size="large" step={0.0000001} precision={7} style={{ width: '100%' }} placeholder="36.8219000" />
                </Form.Item>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ alignItems: 'end' }}>
                <Form.Item
                  label="Geofence radius (meters)"
                  name="geofence_radius_m"
                  extra="Recommended 100 to 300 m. GPS accuracy is typically 10 to 30 m."
                >
                  <InputNumber size="large" min={10} max={20000} step={10} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item>
                  <Button size="large" icon={<AimOutlined />} onClick={useMyLocation} loading={locating} block>
                    Use my current location
                  </Button>
                </Form.Item>
              </div>
            </Section>

            {/* ===== NETWORK ===== */}
            <Section
              icon={<WifiOutlined />}
              title="Office network"
              description="Only allow on-site clock-ins from your office internet connection."
            >
              <ToggleRow
                name="enforce_network"
                title="Require office network on clock-in"
                help="Employees must be on the office Wi-Fi to clock in on-site. Turn off for demos, training, or sites without Wi-Fi."
              />

              {enforceNetwork ? (
                <>
                  <div
                    style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
                      padding: '12px 16px', border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 6,
                    }}
                  >
                    <Text type="secondary">Your current public IP</Text>
                    {ipLoading ? (
                      <Spin size="small" />
                    ) : currentIp ? (
                      <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 13, margin: 0 }}>{currentIp}</Tag>
                    ) : (
                      <Tag color="red" style={{ margin: 0 }}>Could not detect</Tag>
                    )}
                    <div style={{ marginLeft: 'auto' }}>
                      <Space wrap>
                        <Button size="small" onClick={loadCurrentIp} loading={ipLoading} icon={<ReloadOutlined />}>
                          Refresh
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={addCurrentIpToAllowList}
                          disabled={!currentIp}
                        >
                          Add to allowlist
                        </Button>
                      </Space>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      This is the IP your browser is using right now, detected through ipify.
                    </Text>
                    {ipPreview && (
                      <div style={{ marginTop: 8 }}>
                        {ipPreview.matches ? (
                          <Text style={{ color: '#15803d' }}>
                            <CheckCircleFilled /> This IP is covered by the allowlist
                          </Text>
                        ) : (
                          <Text style={{ color: '#c2410c' }}>
                            <CloseCircleFilled /> Not in the allowlist. Employees on this network will be blocked.
                          </Text>
                        )}
                      </div>
                    )}
                  </div>

                  <Form.Item
                    label="Allowed IPs (comma-separated)"
                    name="allowed_ips"
                    rules={[
                      {
                        validator: (_, value) => {
                          const list = (value || '').split(',').map((x) => x.trim()).filter(Boolean);
                          if (!list.length) {
                            return Promise.reject(
                              new Error('Add at least one office IP while network enforcement is on')
                            );
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                    extra="Use a single IPv4 address (41.90.64.10) or a CIDR range (41.90.64.0/24). Add the office WAN IP shown by ipify when you are on the office Wi-Fi."
                  >
                    <TextArea rows={2} placeholder="e.g. 41.90.64.10, 102.68.10.0/24" style={{ fontFamily: 'monospace' }} />
                  </Form.Item>

                  {savedIps.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                        Allowed ({savedIps.length})
                      </Text>
                      {savedIps.map((ip) => (
                        <Tag
                          key={ip}
                          closable
                          onClose={(e) => {
                            e.preventDefault();
                            removeIpFromList(ip);
                          }}
                          style={{ fontFamily: 'monospace', marginBottom: 4 }}
                        >
                          {ip}
                        </Tag>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Text type="secondary">Network checks are off. Any IP address can clock in.</Text>
              )}

              <Alert
                type={enforce || enforceNetwork ? 'warning' : 'info'}
                showIcon
                style={{ marginTop: 16 }}
                title={
                  enforce || enforceNetwork
                    ? 'Clock-in needs every enabled check to pass'
                    : 'Both checks are off'
                }
                description={
                  enforce || enforceNetwork ? (
                    <>
                      {enforceNetwork && <div>Office network: the device IP must be in the allowlist.</div>}
                      {enforce && <div>GPS geofence: the device must be within the configured radius.</div>}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        The server checks the IP it sees on the connection, not what the browser reports.
                      </Text>
                    </>
                  ) : (
                    'Any logged-in employee can clock in manually.'
                  )
                }
              />
            </Section>

            {/* ===== STICKY ACTION BAR ===== */}
            <div
              style={{
                position: 'sticky', bottom: 0, zIndex: 20, margin: '0 -16px 20px', padding: '12px 16px',
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}
            >
              <div>
                {dirty ? (
                  <Tag color="gold" style={{ margin: 0 }}>Unsaved changes</Tag>
                ) : (
                  <Text type="secondary">All changes saved</Text>
                )}
              </div>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={load} disabled={saving || !dirty}>
                  Discard changes
                </Button>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} disabled={!dirty}>
                  Save changes
                </Button>
              </Space>
            </div>
          </Form>
        </>
      )}

      <EmailSenderSettings />
      <div style={{ height: 24 }} />
    </div>
  );
}