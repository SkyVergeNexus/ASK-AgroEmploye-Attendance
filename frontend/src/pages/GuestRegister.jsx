import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Form, Input, Button, Typography, Select, Steps, message,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  ManOutlined,
  WomanOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  HomeOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { API_ORIGIN } from '../config';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const DEFAULT_GRADIENT =
  'linear-gradient(135deg, #065f46 0%, #047857 50%, #065f46 100%)';

export default function GuestRegister() {
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [coverUrl, setCoverUrl] = useState(null);
  const [done, setDone] = useState(false);
  const [submittedName, setSubmittedName] = useState('');

  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [loadingServices, setLoadingServices] = useState(true);

  // Load cover image
  useEffect(() => {
    fetch(API_ORIGIN + '/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCoverUrl(d?.login_cover_url || null))
      .catch(() => {});
  }, []);

  // Load services list
  useEffect(() => {
    setLoadingServices(true);
    fetch(API_ORIGIN + '/api/services')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setServices(Array.isArray(d) ? d : []))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, []);

  const backgroundStyle = coverUrl
    ? {
        backgroundImage: `url("${API_ORIGIN}${coverUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : { backgroundImage: DEFAULT_GRADIENT };

  const stepFieldMap = {
    0: ['full_name', 'phone'],
    1: ['service_id'],
  };

  const next = async () => {
    try {
      await form.validateFields(stepFieldMap[current]);
      setCurrent((c) => c + 1);
    } catch {
      /* validation errors show inline */
    }
  };

  const prev = () => setCurrent((c) => Math.max(0, c - 1));

  const onFinish = async () => {
    try {
      const values = await form.validateFields();
      setBusy(true);
      await api.post('/guests/register', {
        full_name: values.full_name,
        phone: values.phone,
        gender: values.gender || null,
        service_id: values.service_id,
        purpose: values.purpose || null,
        notes: values.notes || null,
      });
      setSubmittedName(values.full_name.split(' ')[0]);
      setDone(true);
    } catch (err) {
      if (err?.response) {
        message.error(err.response?.data?.message || 'Registration failed');
      }
    } finally {
      setBusy(false);
    }
  };

  // ═══════════════ SUCCESS SCREEN ═══════════════
  if (done) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          ...backgroundStyle,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: coverUrl ? 'rgba(0,0,0,0.6)' : 'transparent',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 420,
            width: '100%',
            background: '#fff',
            borderRadius: 20,
            padding: '36px 24px 28px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: '#ecfdf5',
              border: '3px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircleOutlined style={{ fontSize: 40, color: '#16a34a' }} />
          </div>

          <Title level={3} style={{ margin: 0, color: '#065f46', fontSize: 22 }}>
            Welcome{submittedName ? `, ${submittedName}` : ''}!
          </Title>

          <Text
            type="secondary"
            style={{
              display: 'block',
              marginTop: 10,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            You've been checked in. A staff member has been notified and will
            be with you shortly.
          </Text>

          <div
            style={{
              marginTop: 24,
              padding: '14px 14px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 12,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <HomeOutlined style={{ color: '#15803d', fontSize: 16, marginTop: 2 }} />
              <Text style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                <strong>Please wait</strong> in the reception area. If nobody
                attends to you within 5 minutes, call the front desk.
              </Text>
            </div>
          </div>

          <Link to="/login">
            <Button
              size="large"
              icon={<ArrowLeftOutlined />}
              block
              style={{
                marginTop: 24,
                height: 48,
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ═══════════════ FORM SCREEN ═══════════════
  const steps = [
    {
      title: 'Your details',
      content: (
        <>
          <Form.Item
            label={<span style={{ fontWeight: 600 }}>Full Name</span>}
            name="full_name"
            rules={[{ required: true, message: 'Your name is required' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Jane Doe"
              autoComplete="name"
              size="large"
              style={{ height: 50, borderRadius: 12, fontSize: 16 }}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ fontWeight: 600 }}>Phone Number</span>}
            name="phone"
            rules={[
              { required: true, message: 'Phone number is required' },
              {
                pattern: /^[+\d][\d\s-]{6,}$/,
                message: 'Enter a valid phone number',
              },
            ]}
          >
            <Input
              prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
              placeholder="+254 700 000 000"
              autoComplete="tel"
              inputMode="tel"
              size="large"
              style={{ height: 50, borderRadius: 12, fontSize: 16 }}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ fontWeight: 600 }}>Gender</span>}
            name="gender"
          >
            <Select
              placeholder="Optional"
              allowClear
              size="large"
              style={{ height: 50 }}
            >
              <Option value="male">
                <ManOutlined /> Male
              </Option>
              <Option value="female">
                <WomanOutlined /> Female
              </Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
        </>
      ),
    },
    {
      title: 'Visit details',
      content: (
        <>
          <Form.Item
            label={<span style={{ fontWeight: 600 }}>What brings you here?</span>}
            name="service_id"
            rules={[{ required: true, message: 'Please choose a service' }]}
          >
            <Select
              placeholder="Choose a service..."
              size="large"
              loading={loadingServices}
              onChange={(v) =>
                setSelectedService(services.find((s) => s.id === v) || null)
              }
              style={{ minHeight: 50 }}
              optionLabelProp="label"
            >
              {services.map((s) => (
                <Option key={s.id} value={s.id} label={s.name}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.description && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {s.description}
                      </div>
                    )}
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedService?.name === 'Other' && (
            <Form.Item
              label={<span style={{ fontWeight: 600 }}>Please describe</span>}
              name="purpose"
              rules={[{ required: true, message: 'Please describe your purpose' }]}
            >
              <Input
                placeholder="e.g. Picking up a package"
                size="large"
                maxLength={255}
                style={{ height: 50, borderRadius: 12, fontSize: 16 }}
              />
            </Form.Item>
          )}

          <Form.Item
            label={
              <span style={{ fontWeight: 600 }}>
                Additional Notes{' '}
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                  (optional)
                </Text>
              </span>
            }
            name="notes"
          >
            <TextArea
              rows={3}
              placeholder="Who are you here to see? Any other details we should know?"
              maxLength={1000}
              showCount
              style={{ borderRadius: 12, fontSize: 15 }}
            />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        ...backgroundStyle,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: coverUrl ? 'rgba(0,0,0,0.6)' : 'transparent',
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '20px 20px 16px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        <Title
          level={4}
          style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}
        >
          ASK Agrobusiness
        </Title>
        <Text
          style={{
            display: 'block',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 12,
            marginTop: 2,
          }}
        >
          Visitor Check-In
        </Text>
      </div>

      {/* Main card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 12px 16px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 500,
            background: '#fff',
            borderRadius: 20,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}
        >
          {/* Card header */}
          <div
            style={{
              padding: '20px 20px 16px',
              borderBottom: '1px solid #f1f5f9',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {steps[current].title}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {current + 1} / {steps.length}
              </Text>
            </div>

            <Steps
              current={current}
              size="small"
              items={steps.map((s) => ({ title: s.title }))}
            />
          </div>

          {/* Form scrollable area */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '20px 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={onFinish}
            >
              {steps.map((step, index) => (
                <div
                  key={index}
                  style={{ display: index === current ? 'block' : 'none' }}
                >
                  {step.content}
                </div>
              ))}
            </Form>
          </div>

          {/* Sticky footer */}
          <div
            style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid #f1f5f9',
              background: '#fff',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              {current > 0 && (
                <Button
                  onClick={prev}
                  disabled={busy}
                  icon={<ArrowLeftOutlined />}
                  size="large"
                  style={{
                    height: 50,
                    borderRadius: 12,
                    flex: '0 0 auto',
                    paddingInline: 20,
                    fontWeight: 600,
                  }}
                >
                  Back
                </Button>
              )}

              {current < steps.length - 1 ? (
                <Button
                  type="primary"
                  onClick={next}
                  size="large"
                  style={{
                    backgroundColor: '#15803d',
                    height: 50,
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 16,
                    flex: 1,
                  }}
                >
                  Continue <ArrowRightOutlined />
                </Button>
              ) : (
                <Button
                  type="primary"
                  onClick={onFinish}
                  loading={busy}
                  size="large"
                  icon={<CheckCircleOutlined />}
                  style={{
                    backgroundColor: '#15803d',
                    height: 50,
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 16,
                    flex: 1,
                  }}
                >
                  {busy ? 'Signing in...' : "I'm Here"}
                </Button>
              )}
            </div>

            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Link
                to="/login"
                style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}
              >
                ← Back to staff login
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        html, body {
          overscroll-behavior-y: contain;
        }
      `}</style>
    </div>
  );
}