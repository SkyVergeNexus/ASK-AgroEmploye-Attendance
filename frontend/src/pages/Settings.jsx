import { useEffect, useState } from 'react';
import {
  Card, Form, TimePicker, InputNumber, Input, Button, Typography,
  Space, Alert, Skeleton, Switch, Divider, Tag, Spin, Upload,
} from 'antd';
import {
  SaveOutlined, ReloadOutlined, EnvironmentOutlined, AimOutlined,
  WifiOutlined, CopyOutlined, UploadOutlined, PictureOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';
import { API_ORIGIN } from '../config';
import toast from 'react-hot-toast';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [enforce, setEnforce] = useState(false);

  const [currentIp, setCurrentIp] = useState(null);
  const [ipLoading, setIpLoading] = useState(false);

  // Cover image state
  const [coverUrl, setCoverUrl] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings');
      const enforced = !!Number(data.enforce_location);
      setEnforce(enforced);
      setCoverUrl(data.login_cover_url || null);
      form.setFieldsValue({
        company_name: data.company_name,
        work_start: dayjs(data.work_start, 'HH:mm:ss'),
        work_end: dayjs(data.work_end, 'HH:mm:ss'),
        late_threshold_minutes: data.late_threshold_minutes,
        office_lat: data.office_lat ? Number(data.office_lat) : null,
        office_lng: data.office_lng ? Number(data.office_lng) : null,
        geofence_radius_m: data.geofence_radius_m ?? 200,
        enforce_location: enforced,
        allowed_ips: data.allowed_ips || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentIp = async () => {
    setIpLoading(true);
    try {
      const { data } = await api.get('/settings/my-ip');
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

  const addCurrentIpToAllowList = () => {
    if (!currentIp) {
      return toast.error('No current IP detected');
    }
    const current = form.getFieldValue('allowed_ips') || '';
    const list = current
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (list.includes(currentIp)) {
      return toast('This IP is already in the list');
    }
    list.push(currentIp);
    form.setFieldsValue({ allowed_ips: list.join(', ') });
    toast.success('IP added to allowlist');
  };

  // Upload new cover image (immediate — doesn't need form save)
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

  // Reset cover to default gradient
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
        allowed_ips: values.allowed_ips || null,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <Title level={3} style={{ margin: 0, color: '#065f46' }}>
          System Settings
        </Title>
        <Text type="secondary">
          Work hours, late threshold, branding, and location
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Clock-in behaviour"
        description={
          <>
            Anyone clocking in after (work start + late threshold) is marked late.
            When <strong>Enforce location</strong> is ON, employees must be on an
            allowed office IP AND within the GPS radius to clock in.
          </>
        }
      />

      <Card variant="borderless" className="shadow-sm">
        {loading ? (
          <Skeleton active paragraph={{ rows: 12 }} />
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            onValuesChange={(changed) => {
              if ('enforce_location' in changed) {
                setEnforce(!!changed.enforce_location);
              }
            }}
          >
            {/* ===== CORE ===== */}
            <Form.Item
              label="Company Name"
              name="company_name"
              rules={[{ required: true, message: 'Company name is required' }]}
            >
              <Input placeholder="ASK Agrobusiness Limited" />
            </Form.Item>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                label="Work Start"
                name="work_start"
                rules={[{ required: true, message: 'Work start is required' }]}
              >
                <TimePicker format="HH:mm" use12Hours={false} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="Work End"
                name="work_end"
                rules={[{ required: true, message: 'Work end is required' }]}
              >
                <TimePicker format="HH:mm" use12Hours={false} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item
              label="Late Threshold (minutes after work start)"
              name="late_threshold_minutes"
              rules={[{ required: true, message: 'Late threshold is required' }]}
            >
              <InputNumber min={0} max={240} style={{ width: '100%' }} />
            </Form.Item>

            <Divider />

            {/* ===== BRANDING / COVER ===== */}
            <Title level={5} style={{ marginTop: 0 }}>
              <PictureOutlined /> Login / Register Cover
            </Title>

            <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 16 }}>
              <div
                style={{
                  width: '100%',
                  height: 180,
                  borderRadius: 8,
                  border: '1px dashed #cbd5e1',
                  backgroundImage: coverUrl
                    ? `url("${API_ORIGIN}${coverUrl}")`
                    : 'linear-gradient(135deg, #065f46 0%, #047857 50%, #065f46 100%)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 500,
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                {!coverUrl && 'Default green gradient (no image set)'}
              </div>

              <Space wrap>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    const isImage = /^image\//.test(file.type);
                    if (!isImage) {
                      toast.error('Only image files are allowed');
                      return Upload.LIST_IGNORE;
                    }
                    const under5mb = file.size / 1024 / 1024 < 5;
                    if (!under5mb) {
                      toast.error('Image must be under 5 MB');
                      return Upload.LIST_IGNORE;
                    }
                    uploadCover(file);
                    return false; // prevent default upload
                  }}
                >
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploadingCover}
                  >
                    Upload new cover
                  </Button>
                </Upload>

                {coverUrl && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={resetCover}
                    loading={uploadingCover}
                  >
                    Use default theme
                  </Button>
                )}
              </Space>

              <Text type="secondary" style={{ fontSize: 12 }}>
                Recommended: 1600×900 JPG or PNG, under 5 MB. Applied as the background
                on the Login and Register pages. Leave empty for the default green theme.
              </Text>
            </Space>

            <Divider />

            {/* ===== GEOFENCE ===== */}
            <Title level={5} style={{ marginTop: 0 }}>
              <EnvironmentOutlined /> Office Location &amp; Geofence
            </Title>

            <Form.Item
              label="Enforce location on clock-in"
              name="enforce_location"
              valuePropName="checked"
            >
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                label="Office Latitude"
                name="office_lat"
                rules={
                  enforce
                    ? [{ required: true, message: 'Latitude is required when enforcing' }]
                    : []
                }
              >
                <InputNumber
                  step={0.0000001}
                  precision={7}
                  style={{ width: '100%' }}
                  placeholder="-1.2921000"
                />
              </Form.Item>
              <Form.Item
                label="Office Longitude"
                name="office_lng"
                rules={
                  enforce
                    ? [{ required: true, message: 'Longitude is required when enforcing' }]
                    : []
                }
              >
                <InputNumber
                  step={0.0000001}
                  precision={7}
                  style={{ width: '100%' }}
                  placeholder="36.8219000"
                />
              </Form.Item>
            </div>

            <Form.Item
              label="Geofence Radius (meters)"
              name="geofence_radius_m"
              extra="Recommended 100–300m. GPS accuracy is typically ±10–30m."
            >
              <InputNumber min={10} max={20000} step={10} style={{ width: '100%' }} />
            </Form.Item>

            <Button
              icon={<AimOutlined />}
              onClick={useMyLocation}
              loading={locating}
              className="mb-4"
            >
              Use my current location
            </Button>

            <Divider />

            {/* ===== OFFICE NETWORK ===== */}
            <Title level={5} style={{ marginTop: 0 }}>
              <WifiOutlined /> Office Network (Allowed IPs)
            </Title>

            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              icon={<WifiOutlined />}
              showIcon
              title={
                <Space wrap>
                  <span>Your current public IP:</span>
                  {ipLoading ? (
                    <Spin size="small" />
                  ) : currentIp ? (
                    <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {currentIp}
                    </Tag>
                  ) : (
                    <Tag color="red">Could not detect</Tag>
                  )}
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<CopyOutlined />}
                    onClick={addCurrentIpToAllowList}
                    disabled={!currentIp}
                  >
                    Add to allowlist
                  </Button>
                  <Button size="small" onClick={loadCurrentIp} loading={ipLoading}>
                    Refresh
                  </Button>
                </Space>
              }
              description={
                <span style={{ fontSize: 13 }}>
                  This is the IP your browser is using right now. If you're on the
                  office Wi-Fi, this is the IP you need to allow. Click{' '}
                  <strong>Add to allowlist</strong> to append it automatically.
                </span>
              }
            />

            <Form.Item
              label={
                <Space>
                  <WifiOutlined />
                  <span>
                    Allowed IPs (comma-separated) {enforce ? '— required' : '— optional'}
                  </span>
                </Space>
              }
              name="allowed_ips"
              rules={
                enforce
                  ? [
                      {
                        validator: (_, value) => {
                          const list = (value || '')
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean);
                          if (!list.length) {
                            return Promise.reject(
                              new Error('At least one office IP is required when enforcing')
                            );
                          }
                          return Promise.resolve();
                        },
                      },
                    ]
                  : []
              }
              extra="One or more public IPs of the office Wi-Fi network. Find them by visiting whatismyipaddress.com while on the office Wi-Fi, or use the current IP shown above."
            >
              <TextArea
                rows={2}
                placeholder="e.g. 41.90.64.10, 102.68.10.5"
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>

            {enforce && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                title="Employees can only clock in when both conditions are met"
                description={
                  <>
                    <strong>1.</strong> Connected to an office Wi-Fi network whose public IP
                    matches the list above.
                    <br />
                    <strong>2.</strong> Physically within the GPS geofence radius of the
                    office coordinates.
                  </>
                }
              />
            )}

            <Divider />

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
              >
                Save Changes
              </Button>
              <Button icon={<ReloadOutlined />} onClick={load} disabled={saving}>
                Reset
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </div>
  );
}