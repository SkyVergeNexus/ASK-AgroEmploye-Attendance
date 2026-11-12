import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Form, Input, Button, Typography, Modal, Space, Alert, message,
} from 'antd';
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  MailOutlined,
  LockFilled,
} from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

// Default fallback — soft green gradient matching the ASK brand
const DEFAULT_GRADIENT =
  'linear-gradient(135deg, #065f46 0%, #047857 50%, #065f46 100%)';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  // Cover image state
  const [coverUrl, setCoverUrl] = useState(null);

  // Load public settings (company name + cover URL) — no auth needed
  useEffect(() => {
    fetch('http://localhost:5000/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCoverUrl(d?.login_cover_url || null))
      .catch(() => {
        /* ignore — fall back to gradient */
      });
  }, []);

  const backgroundStyle = coverUrl
    ? {
        backgroundImage: `url("http://localhost:5000${coverUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : { backgroundImage: DEFAULT_GRADIENT };

  const onFinish = async (values) => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', values);
      login(data.token, data.user);
      message.success('Welcome, ' + data.user.name);
      nav(data.user.system_role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Login failed';

      if (status === 403 && /pending/i.test(msg)) {
        setPendingEmail(values.email);
        setPendingOpen(true);
      } else if (status === 403 && /disabled/i.test(msg)) {
        Modal.error({
          title: 'Account disabled',
          icon: <CloseCircleOutlined style={{ color: '#dc2626' }} />,
          content:
            'Your account has been disabled by an administrator. Please contact HR if you believe this is a mistake.',
        });
      } else {
        message.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        ...backgroundStyle,
        position: 'relative',
      }}
    >
      {/* Dark overlay for readability over any background image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: coverUrl ? 'rgba(0, 0, 0, 0.45)' : 'transparent',
          zIndex: 0,
        }}
      />

      {/* White form card */}
      <div
        className="bg-white p-8 rounded-lg shadow-xl w-96 max-w-full"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div className="text-center mb-6">
          <Title level={3} style={{ marginBottom: 0, color: '#065f46' }}>
            ASK Agrobusiness
          </Title>
          <Text type="secondary">Attendance System</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Email"
              type="email"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password
              prefix={<LockFilled style={{ color: '#94a3b8' }} />}
              placeholder="Password"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={busy}
              block
              size="large"
              style={{ backgroundColor: '#15803d' }}
            >
              {busy ? 'Signing in...' : 'Sign In'}
            </Button>
          </Form.Item>
        </Form>

        <p className="text-sm text-center mt-2 text-gray-600">
          No account?{' '}
          <Link to="/register" className="text-green-700 font-medium">
            Register
          </Link>
        </p>
      </div>

      {/* Pending approval modal */}
      <Modal
        open={pendingOpen}
        onCancel={() => setPendingOpen(false)}
        footer={null}
        centered
        width={460}
      >
        <div className="text-center mb-4">
          <ClockCircleOutlined style={{ fontSize: 48, color: '#d97706' }} />
        </div>
        <Title level={4} style={{ textAlign: 'center', marginTop: 0 }}>
          Waiting for approval
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
          Your registration has been submitted successfully, but an
          administrator hasn't approved your account yet.
        </Text>

        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          title="What happens next?"
          description={
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>• You'll be able to sign in once your account is approved.</div>
              <div>• This usually takes a few minutes during working hours.</div>
              <div>• If you believe this is taking too long, contact HR or your
                supervisor and mention the email below.</div>
            </div>
          }
        />

        <div
          style={{
            marginTop: 16,
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          <Space>
            <LockOutlined style={{ color: '#64748b' }} />
            <Text strong>Account:</Text>
            <Text code>{pendingEmail}</Text>
          </Space>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Try signing in again later.
          </Text>
        </div>
      </Modal>
    </div>
  );
}