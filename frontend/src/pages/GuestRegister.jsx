import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, Button, Card, Form, Input, Select, Space, Spin, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, PhoneOutlined, UserOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function GuestRegister() {
  const [form] = Form.useForm();
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [registered, setRegistered] = useState(null);

  useEffect(() => {
    api.get('/services')
      .then(({ data }) => setServices(data))
      .catch((err) => {
        const errorMessage = err.response?.data?.message || 'Unable to load visitor services';
        setLoadError(errorMessage);
        message.error(errorMessage);
      })
      .finally(() => setLoadingServices(false));
  }, []);

  const submit = async (values) => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/guests/register', values);
      setRegistered(data);
      message.success('Your visit has been registered');
    } catch (err) {
      message.error(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-100 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-5 text-center">
          <Text strong style={{ color: '#065f46', letterSpacing: 1 }}>
            ASK AGROBUSINESS
          </Text>
          <Title level={2} style={{ margin: '8px 0 4px', color: '#064e3b' }}>
            Visitor registration
          </Title>
          <Text type="secondary">Please share a few details so we can direct you to the right team.</Text>
        </div>

        <Card bordered={false} className="shadow-lg" style={{ borderRadius: 16 }}>
          {registered ? (
            <div className="py-5 text-center">
              <CheckCircleOutlined style={{ fontSize: 48, color: '#16a34a' }} />
              <Title level={3} style={{ marginTop: 16 }}>Thank you for signing in</Title>
              <Text type="secondary">
                Your visit has been recorded. Our team will review your request and assign the right staff member.
              </Text>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">Reference: </Text>
                <Text strong>#{registered.guest_id}</Text>
              </div>
              <div style={{ marginTop: 24 }}>
                <Link to="/login">
                  <Button type="primary" icon={<ArrowLeftOutlined />}>Return to login</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {loadError && (
                <Alert
                  type="error"
                  showIcon
                  message="Services could not be loaded"
                  description={loadError}
                  style={{ marginBottom: 20 }}
                />
              )}
              {!loadingServices && !loadError && services.length === 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message="No visitor services are available yet"
                  description="Please contact the office to register your visit."
                  style={{ marginBottom: 20 }}
                />
              )}
              <Form
                form={form}
                layout="vertical"
                requiredMark="optional"
                onFinish={submit}
                initialValues={{ gender: undefined }}
              >
                <Form.Item
                  label="Full name"
                  name="full_name"
                  rules={[
                    { required: true, whitespace: true, message: 'Please enter your full name' },
                    { max: 120, message: 'Name must be 120 characters or fewer' },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="Your full name"
                    autoComplete="name"
                    size="large"
                  />
                </Form.Item>

                <Form.Item
                  label="Phone number"
                  name="phone"
                  rules={[
                    { required: true, whitespace: true, message: 'Please enter your phone number' },
                    { max: 30, message: 'Phone number must be 30 characters or fewer' },
                  ]}
                >
                  <Input
                    prefix={<PhoneOutlined />}
                    placeholder="Your phone number"
                    autoComplete="tel"
                    size="large"
                  />
                </Form.Item>

                <Form.Item label="Gender (optional)" name="gender">
                  <Select
                    allowClear
                    placeholder="Select if you wish"
                    size="large"
                    options={[
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  label="What are you visiting for?"
                  name="service_id"
                  rules={[{ required: true, message: 'Please choose a service' }]}
                >
                  <Select
                    placeholder="Select a service"
                    size="large"
                    loading={loadingServices}
                    disabled={loadingServices || services.length === 0}
                    options={services.map((service) => ({
                      value: service.id,
                      label: service.description
                        ? `${service.name} — ${service.description}`
                        : service.name,
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  label="Purpose or reason for your visit"
                  name="purpose"
                  rules={[
                    { required: true, whitespace: true, message: 'Please describe the purpose of your visit' },
                    { max: 255, message: 'Purpose must be 255 characters or fewer' },
                  ]}
                >
                  <TextArea
                    rows={3}
                    maxLength={255}
                    showCount
                    placeholder="A short explanation will help us find the right person"
                  />
                </Form.Item>

                <Form.Item
                  label="Additional note (optional)"
                  name="notes"
                  rules={[{ max: 1000, message: 'Note must be 1000 characters or fewer' }]}
                >
                  <TextArea rows={2} maxLength={1000} showCount placeholder="Anything else we should know?" />
                </Form.Item>

                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={submitting}
                  disabled={loadingServices || services.length === 0}
                  style={{ background: '#15803d', height: 46, fontWeight: 600 }}
                >
                  {submitting ? 'Submitting…' : 'Register my visit'}
                </Button>
              </Form>
            </>
          )}
        </Card>

        <div className="mt-5 text-center">
          <Link to="/login">
            <Space style={{ color: '#047857' }}>
              <ArrowLeftOutlined />
              Return to employee login
            </Space>
          </Link>
        </div>

        {loadingServices && (
          <div className="mt-4 text-center"><Spin size="small" /></div>
        )}
      </div>
    </div>
  );
}
