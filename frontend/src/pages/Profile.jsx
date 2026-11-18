import { useEffect, useMemo, useState } from 'react';
import {
  Card, Avatar, Typography, Form, Input, Select, Button, Upload, message,
  Space, Row, Col, Divider, Progress, Tooltip,
} from 'antd';
import {
  UserOutlined, UploadOutlined, DeleteOutlined, PhoneOutlined,
  LockOutlined, IdcardOutlined, SafetyCertificateOutlined,
  SaveOutlined, MailOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../config';

const { Title, Text } = Typography;
const { Option } = Select;

const PHONE_RE = /^[+()\-\s\d]{6,20}$/;

// ── Meta chip ─────────────────────────────────────────────
const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.4,
  border: '1px solid transparent',
};

const Chip = ({ color, bg, border, icon, children }) => (
  <span style={{ ...chipStyle, color, background: bg, borderColor: border }}>
    {icon}
    {children}
  </span>
);

// ── Password strength ─────────────────────────────────────
function passwordStrength(pw = '') {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0–4
}

const STRENGTH_META = [
  { label: 'Too short', color: '#dc2626' },
  { label: 'Weak', color: '#f59e0b' },
  { label: 'Fair', color: '#eab308' },
  { label: 'Good', color: '#16a34a' },
  { label: 'Strong', color: '#059669' },
];

export default function Profile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pw, setPw] = useState('');

  const [infoForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const load = async () => {
    try {
      const { data } = await api.get('/profile');
      setProfile(data);
      infoForm.setFieldsValue({
        full_name: data.full_name || '',
        phone: data.phone || '',
        gender: data.gender || undefined,
      });
      setDirty(false);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load profile');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveInfo = async (values) => {
    setSaving(true);
    try {
      await api.put('/profile', values);
      message.success('Profile updated');
      updateUser({ name: values.full_name });
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const uploadPicture = async () => {
    if (!file) return message.error('Choose a picture first');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('picture', file);
      const { data } = await api.post('/profile/picture', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('Picture updated');
      updateUser({ profile_picture: data.profile_picture });
      setFile(null);
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async (values) => {
    try {
      await api.put('/profile/password', values);
      message.success('Password changed');
      pwdForm.resetFields();
      setPw('');
    } catch (err) {
      message.error(err.response?.data?.message || 'Password change failed');
    }
  };

  const picUrl = useMemo(
    () => assetUrl(profile?.profile_picture),
    [profile?.profile_picture]
  );

  if (!profile) {
    return <div className="p-6 text-gray-500">Loading profile…</div>;
  }

  const strength = passwordStrength(pw);
  const strengthMeta = STRENGTH_META[strength];

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Optional shimmer animation keyframes */}
      <style>{`
        @keyframes heroShimmer {
          0%   { transform: translateX(-120%) skewX(-12deg); }
          100% { transform: translateX(220%)  skewX(-12deg); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .hero-shimmer {
            animation: heroShimmer 6s ease-in-out infinite;
          }
        }
      `}</style>

      <Title level={3} style={{ marginBottom: 20, color: '#065f46' }}>
        My Profile
      </Title>

      {/* ═══════════ IDENTITY HERO ═══════════ */}
      <Card
        bordered={false}
        className="shadow-sm mb-6"
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden', borderRadius: 12 }}
      >
        {/* ── Cover banner ── */}
        <div
          style={{
            position: 'relative',
            height: 160,
            background:
              'radial-gradient(1200px 400px at 110% -10%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 60%),' +
              'radial-gradient(800px 300px at -10% 110%, rgba(20,184,166,0.55) 0%, rgba(20,184,166,0) 55%),' +
              'linear-gradient(135deg, #064e3b 0%, #065f46 35%, #0d9488 70%, #14b8a6 100%)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Dot grid overlay */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.35) 70%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.35) 70%, transparent)',
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          />

          {/* Diagonal glass shine */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -80,
              right: -120,
              width: 420,
              height: 420,
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 45%)',
              transform: 'rotate(12deg)',
              filter: 'blur(2px)',
              pointerEvents: 'none',
            }}
          />

          {/* Decorative rings */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: -60,
              top: -60,
              width: 260,
              height: 260,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.18)',
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 30,
              top: 30,
              width: 160,
              height: 160,
              borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.28)',
              pointerEvents: 'none',
            }}
          />

          {/* Animated shimmer streak */}
          <div
            aria-hidden
            className="hero-shimmer"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 160,
              height: '100%',
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
              pointerEvents: 'none',
            }}
          />

          {/* Top-right status chip */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.24)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#ecfdf5',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: 0.3,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 0 3px rgba(74,222,128,0.25)',
              }}
            />
            Active Employee
          </div>

          {/* Bottom-left glass employee-code chip */}
          <div
            style={{
              position: 'absolute',
              left: 24,
              bottom: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.30)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: '#f0fdfa',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <IdcardOutlined />
            {profile.employee_code || '—'}
          </div>
        </div>

        {/* ── Avatar + identity ── */}
        <div style={{ padding: '0 24px 24px', marginTop: -52 }}>
          <div className="flex items-end gap-5 flex-wrap">
            <Avatar
              size={104}
              src={picUrl || undefined}
              icon={!picUrl ? <UserOutlined /> : undefined}
              style={{
                backgroundColor: picUrl ? undefined : '#065f46',
                flexShrink: 0,
                border: '4px solid #fff',
                boxShadow:
                  '0 10px 25px -5px rgba(15,23,42,0.25), 0 4px 10px -2px rgba(15,23,42,0.10)',
              }}
            />
            <div style={{ paddingBottom: 8 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#0f172a',
                  lineHeight: 1.2,
                  letterSpacing: -0.2,
                }}
              >
                {profile.full_name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <MailOutlined /> {profile.email}
              </div>
            </div>
          </div>

          {/* Meta chips (dept + role; employee code lives in the banner) */}
          <div className="mt-5 flex flex-wrap gap-2">
            <Chip
              color="#0e7490"
              bg="#ecfeff"
              border="#cffafe"
              icon={<ApartmentOutlined />}
            >
              {profile.department_name || 'No department'}
            </Chip>
            <Chip
              color="#3730a3"
              bg="#eef2ff"
              border="#e0e7ff"
              icon={<SafetyCertificateOutlined />}
            >
              {profile.role_name || 'No role'}
            </Chip>
          </div>

          {/* Upload row */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Upload
              accept="image/png,image/jpeg,image/webp"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(f) => {
                const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(f.type);
                if (!ok) {
                  message.error('Only PNG, JPEG, or WEBP images are allowed');
                  return Upload.LIST_IGNORE;
                }
                if (f.size > 5 * 1024 * 1024) {
                  message.error('Image must be under 5 MB');
                  return Upload.LIST_IGNORE;
                }
                setFile(f);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>Choose Picture</Button>
            </Upload>

            {file && (
              <Tooltip title={file.name}>
                <span
                  style={{
                    fontSize: 12,
                    color: '#475569',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </span>
              </Tooltip>
            )}

            <Button
              type="primary"
              onClick={uploadPicture}
              loading={uploading}
              disabled={!file}
            >
              Upload
            </Button>

            {file && (
              <Button
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => setFile(null)}
                danger
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ═══════════ PERSONAL INFO ═══════════ */}
      <Card
        bordered={false}
        className="shadow-sm mb-6"
        title={
          <Space>
            <UserOutlined style={{ color: '#065f46' }} />
            <span style={{ fontWeight: 600 }}>Personal Info</span>
          </Space>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Visible only to you & HR
          </Text>
        }
      >
        <Form
          form={infoForm}
          layout="vertical"
          requiredMark={false}
          onFinish={saveInfo}
          onValuesChange={() => setDirty(true)}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Full Name"
                name="full_name"
                rules={[
                  { required: true, message: 'Name is required' },
                  { max: 120, message: 'Max 120 characters' },
                ]}
              >
                <Input
                  size="large"
                  placeholder="Full name"
                  autoComplete="name"
                  prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Phone"
                name="phone"
                rules={[
                  {
                    validator: (_, v) =>
                      !v || PHONE_RE.test(v)
                        ? Promise.resolve()
                        : Promise.reject(new Error('Invalid phone format')),
                  },
                ]}
              >
                <Input
                  size="large"
                  placeholder="+233 55 000 0000"
                  autoComplete="tel"
                  prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Gender" name="gender">
                <Select size="large" placeholder="Select…" allowClear>
                  <Option value="male">Male</Option>
                  <Option value="female">Female</Option>
                  <Option value="other">Other</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0 16px' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={saving}
              disabled={!dirty}
              icon={<SaveOutlined />}
            >
              Save Changes
            </Button>
          </div>
        </Form>
      </Card>

      {/* ═══════════ CHANGE PASSWORD ═══════════ */}
      <Card
        bordered={false}
        className="shadow-sm"
        title={
          <Space>
            <LockOutlined style={{ color: '#065f46' }} />
            <span style={{ fontWeight: 600 }}>Change Password</span>
          </Space>
        }
      >
        <Form
          form={pwdForm}
          layout="vertical"
          requiredMark={false}
          onFinish={changePassword}
          onValuesChange={(changed) => {
            if ('new_password' in changed) setPw(changed.new_password || '');
          }}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Current Password"
                name="current_password"
                rules={[{ required: true, message: 'Current password is required' }]}
              >
                <Input.Password
                  size="large"
                  placeholder="Current password"
                  autoComplete="current-password"
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="New Password"
                name="new_password"
                rules={[
                  { required: true, message: 'New password is required' },
                  { min: 8, message: 'At least 8 characters' },
                ]}
              >
                <Input.Password
                  size="large"
                  placeholder="New password"
                  autoComplete="new-password"
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Password strength meter */}
          {pw && (
            <div style={{ marginTop: -4, marginBottom: 16 }}>
              <Progress
                percent={((strength + 1) / 5) * 100}
                showInfo={false}
                strokeColor={strengthMeta.color}
                trailColor="#e2e8f0"
                size="small"
              />
              <Text style={{ fontSize: 12, color: strengthMeta.color }}>
                {strengthMeta.label}
              </Text>
            </div>
          )}

          <Divider style={{ margin: '8px 0 16px' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit" size="large">
              Update Password
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}