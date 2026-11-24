import { useEffect, useMemo, useState } from 'react';
import {
  Card, Avatar, Typography, Form, Input, Select, Button, Upload,
  Space, Skeleton, Tag, Descriptions,
} from 'antd';
import {
  UserOutlined, UploadOutlined, CloseOutlined, PhoneOutlined, LockOutlined,
  IdcardOutlined, SafetyCertificateOutlined, SaveOutlined, MailOutlined,
  ApartmentOutlined, CheckCircleFilled, ReloadOutlined, TeamOutlined,
} from '@ant-design/icons';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../config';

const { Title, Text } = Typography;

const BRAND = '#065f46';
const BRAND_SOFT = '#ecfdf5';
const BORDER = '#e5e7eb';
const MUTED = '#94a3b8';

const PHONE_RE = /^[+()\-\s\d]{6,20}$/;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/* ---------- Helpers ---------- */

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const PASSWORD_RULES = [
  { key: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { key: 'num', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { key: 'sym', label: 'One symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_META = [
  { label: 'Too short', color: '#dc2626' },
  { label: 'Weak', color: '#f59e0b' },
  { label: 'Fair', color: '#eab308' },
  { label: 'Good', color: '#16a34a' },
  { label: 'Strong', color: '#059669' },
];

function infoChanged(values, profile) {
  return (
    (values.full_name || '').trim() !== (profile.full_name || '') ||
    (values.phone || '').trim() !== (profile.phone || '') ||
    (values.gender || '') !== (profile.gender || '')
  );
}

/* ---------- Small presentational pieces ---------- */

const Chip = ({ color, bg, border, icon, children }) => (
  <span
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      borderRadius: 999, fontSize: 12, fontWeight: 500, lineHeight: 1.4,
      color, background: bg, border: `1px solid ${border}`,
    }}
  >
    {icon}
    {children}
  </span>
);

function Section({ icon, title, description, extra, children }) {
  return (
    <Card
      variant="borderless"
      style={{ border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20 }}
      styles={{ body: { padding: 0 } }}
    >
      <div
        style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span
          style={{
            width: 36, height: 36, borderRadius: 10, background: BRAND_SOFT, color: BRAND,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}
        >
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Title level={5} style={{ margin: 0 }}>{title}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
        </div>
        {extra}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </Card>
  );
}

function StrengthMeter({ password }) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const level = password.length < 8 ? 0 : passed;
  const meta = STRENGTH_META[level];
  const filled = Math.max(level, 1);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{
                height: 6, flex: 1, borderRadius: 3,
                background: i <= filled ? meta.color : '#e2e8f0',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
        <Text style={{ fontSize: 12, color: meta.color, minWidth: 64, textAlign: 'right' }}>
          {meta.label}
        </Text>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4" style={{ marginTop: 10 }}>
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <Text key={r.key} style={{ fontSize: 12, color: ok ? '#15803d' : MUTED }}>
              <CheckCircleFilled style={{ marginRight: 6 }} />
              {r.label}
            </Text>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Profile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pw, setPw] = useState('');

  const [infoForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const fillInfoForm = (data) => {
    infoForm.setFieldsValue({
      full_name: data.full_name || '',
      phone: data.phone || '',
      gender: data.gender || undefined,
    });
    setDirty(false);
  };

  const load = async () => {
    try {
      const { data } = await api.get('/profile');
      setProfile(data);
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load profile');
      return null;
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fill the form once the profile exists (the form mounts after loading).
  useEffect(() => {
    if (profile) fillInfoForm(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Local preview for a chosen picture; revoke the object URL when it changes.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const saveInfo = async (values) => {
    const payload = {
      ...values,
      full_name: (values.full_name || '').trim(),
      phone: (values.phone || '').trim(),
    };
    setSaving(true);
    try {
      await api.put('/profile', payload);
      toast.success('Profile updated');
      updateUser({ name: payload.full_name });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const uploadPicture = async () => {
    if (!file) return toast.error('Choose a picture first');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('picture', file);
      const { data } = await api.post('/profile/picture', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Picture updated');
      updateUser({ profile_picture: data.profile_picture });
      setFile(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async (values) => {
    setSavingPwd(true);
    try {
      // confirm_password is checked in the browser only; the API gets the same two fields as before.
      await api.put('/profile/password', {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      toast.success('Password changed');
      pwdForm.resetFields();
      setPw('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change failed');
    } finally {
      setSavingPwd(false);
    }
  };

  const picUrl = useMemo(
    () => assetUrl(profile?.profile_picture),
    [profile?.profile_picture]
  );

  if (!profile) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px' }}>
        <Card variant="borderless" style={{ border: `1px solid ${BORDER}`, borderRadius: 12 }}>
          <Skeleton avatar active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    );
  }

  const avatarSrc = preview || picUrl || undefined;
  const nameInitials = initials(profile.full_name);

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: BRAND }}>My profile</Title>
        <Text type="secondary">Your photo, personal details and sign-in security</Text>
      </div>

      {/* ===== IDENTITY ===== */}
      <Card
        variant="borderless"
        style={{ border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            height: 120,
            background:
              'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px) 0 0 / 18px 18px,' +
              'linear-gradient(135deg, #064e3b 0%, #065f46 45%, #0d9488 100%)',
          }}
        />

        <div style={{ padding: '0 24px 24px' }}>
          <div
            style={{
              display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginTop: -48,
            }}
          >
            <Avatar
              size={104}
              src={avatarSrc}
              alt={profile.full_name}
              style={{
                backgroundColor: avatarSrc ? '#fff' : BRAND,
                fontSize: 36, fontWeight: 600, flexShrink: 0,
                border: '4px solid #fff', boxShadow: '0 8px 20px -6px rgba(15,23,42,0.3)',
              }}
            >
              {!avatarSrc && (nameInitials || <UserOutlined />)}
            </Avatar>

            <div style={{ flex: '1 1 220px', paddingBottom: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>
                {profile.full_name}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                <MailOutlined /> {profile.email}
              </div>
            </div>

            <div style={{ paddingBottom: 4 }}>
              {file ? (
                <Space wrap>
                  <Button type="primary" onClick={uploadPicture} loading={uploading}>
                    Save photo
                  </Button>
                  <Button icon={<CloseOutlined />} onClick={() => setFile(null)} disabled={uploading}>
                    Cancel
                  </Button>
                </Space>
              ) : (
                <Upload
                  accept={ALLOWED_TYPES.join(',')}
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(f) => {
                    if (!ALLOWED_TYPES.includes(f.type)) {
                      toast.error('Only PNG, JPEG, or WEBP images are allowed');
                      return Upload.LIST_IGNORE;
                    }
                    if (f.size > 5 * 1024 * 1024) {
                      toast.error('Image must be under 5 MB');
                      return Upload.LIST_IGNORE;
                    }
                    setFile(f);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />}>Change photo</Button>
                </Upload>
              )}
            </div>
          </div>

          {file && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 12 }}>
              Previewing {file.name}. Your photo is not changed until you select Save photo.
            </Text>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Chip color="#0e7490" bg="#ecfeff" border="#cffafe" icon={<IdcardOutlined />}>
              {profile.employee_code || 'No employee code'}
            </Chip>
            <Chip color="#0e7490" bg="#ecfeff" border="#cffafe" icon={<ApartmentOutlined />}>
              {profile.department_name || 'No department'}
            </Chip>
            <Chip color="#3730a3" bg="#eef2ff" border="#e0e7ff" icon={<SafetyCertificateOutlined />}>
              {profile.role_name || 'No role'}
            </Chip>
          </div>
        </div>
      </Card>

      {/* ===== PERSONAL INFO ===== */}
      <Section
        icon={<UserOutlined />}
        title="Personal information"
        description="Visible only to you and HR."
      >
        <Form
          form={infoForm}
          layout="vertical"
          requiredMark={false}
          onFinish={saveInfo}
          onValuesChange={(_, all) => setDirty(infoChanged(all, profile))}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              label="Full name"
              name="full_name"
              rules={[
                { required: true, whitespace: true, message: 'Name is required' },
                { max: 120, message: 'Max 120 characters' },
              ]}
            >
              <Input
                size="large"
                placeholder="Full name"
                autoComplete="name"
                prefix={<UserOutlined style={{ color: MUTED }} />}
              />
            </Form.Item>

            <Form.Item
              label="Phone"
              name="phone"
              rules={[
                {
                  validator: (_, v) =>
                    !v || PHONE_RE.test(v.trim())
                      ? Promise.resolve()
                      : Promise.reject(new Error('Use digits, spaces, + ( ) or - (6 to 20 characters)')),
                },
              ]}
            >
              <Input
                size="large"
                placeholder="+233 55 000 0000"
                autoComplete="tel"
                prefix={<PhoneOutlined style={{ color: MUTED }} />}
              />
            </Form.Item>

            <Form.Item label="Gender" name="gender">
              <Select size="large" placeholder="Select gender" allowClear options={GENDER_OPTIONS} />
            </Form.Item>
          </div>

          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 12, flexWrap: 'wrap', borderTop: `1px solid ${BORDER}`, paddingTop: 16,
            }}
          >
            {dirty ? (
              <Tag color="gold" style={{ margin: 0 }}>Unsaved changes</Tag>
            ) : (
              <Text type="secondary">All changes saved</Text>
            )}
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fillInfoForm(profile)}
                disabled={!dirty || saving}
              >
                Discard changes
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={!dirty}
              >
                Save changes
              </Button>
            </Space>
          </div>
        </Form>
      </Section>

      {/* ===== WORK DETAILS (read-only) ===== */}
      <Section
        icon={<TeamOutlined />}
        title="Work details"
        description="Set by your administrator. Contact HR if something is wrong."
      >
        <Descriptions
          column={{ xs: 1, md: 2 }}
          colon={false}
          items={[
            { key: 'code', label: 'Employee code', children: profile.employee_code || '-' },
            { key: 'email', label: 'Email', children: profile.email || '-' },
            { key: 'dept', label: 'Department', children: profile.department_name || 'Not assigned' },
            { key: 'role', label: 'Role', children: profile.role_name || 'Not assigned' },
          ]}
        />
      </Section>

      {/* ===== SECURITY ===== */}
      <Section
        icon={<LockOutlined />}
        title="Change password"
        description="Use a password you do not use anywhere else."
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
          <Form.Item
            label="Current password"
            name="current_password"
            rules={[{ required: true, message: 'Current password is required' }]}
          >
            <Input.Password
              size="large"
              placeholder="Current password"
              autoComplete="current-password"
              prefix={<LockOutlined style={{ color: MUTED }} />}
            />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              label="New password"
              name="new_password"
              dependencies={['current_password']}
              rules={[
                { required: true, message: 'New password is required' },
                { min: 8, message: 'At least 8 characters' },
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    !v || v !== getFieldValue('current_password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('New password must be different from the current one')),
                }),
              ]}
            >
              <Input.Password
                size="large"
                placeholder="New password"
                autoComplete="new-password"
                prefix={<LockOutlined style={{ color: MUTED }} />}
              />
            </Form.Item>

            <Form.Item
              label="Confirm new password"
              name="confirm_password"
              dependencies={['new_password']}
              rules={[
                { required: true, message: 'Please confirm your new password' },
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    !v || v === getFieldValue('new_password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('Passwords do not match')),
                }),
              ]}
            >
              <Input.Password
                size="large"
                placeholder="Repeat new password"
                autoComplete="new-password"
                prefix={<LockOutlined style={{ color: MUTED }} />}
              />
            </Form.Item>
          </div>

          {pw && <StrengthMeter password={pw} />}

          <div
            style={{
              display: 'flex', justifyContent: 'flex-end',
              borderTop: `1px solid ${BORDER}`, paddingTop: 16,
            }}
          >
            <Button type="primary" htmlType="submit" loading={savingPwd} icon={<LockOutlined />}>
              Update password
            </Button>
          </div>
        </Form>
      </Section>
    </div>
  );
}