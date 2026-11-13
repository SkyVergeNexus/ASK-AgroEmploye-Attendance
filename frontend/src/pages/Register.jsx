import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Form, Input, Select, Button, Typography, Upload, Row, Col, Alert,
  message, Steps, Divider,
} from 'antd';
import {
  MailOutlined, LockFilled, UserOutlined, PhoneOutlined,
  UploadOutlined, IdcardOutlined, ManOutlined, WomanOutlined,
  ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { API_ORIGIN } from '../config';

const { Title, Text } = Typography;
const { Option } = Select;

const DEFAULT_GRADIENT =
  'linear-gradient(135deg, #065f46 0%, #047857 50%, #065f46 100%)';

export default function Register() {
  const nav = useNavigate();
  const [form] = Form.useForm();

  const [current, setCurrent] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [coverUrl, setCoverUrl] = useState(null);
  const [picture, setPicture] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);

  // Load departments
  useEffect(() => {
    api
      .get('/departments/public')
      .then((r) => setDepartments(r.data))
      .catch(() => {});
  }, []);

  // Load cover image (public)
  useEffect(() => {
    fetch(API_ORIGIN + '/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCoverUrl(d?.login_cover_url || null))
      .catch(() => {});
  }, []);

  const onDepartmentChange = async (deptId) => {
    form.setFieldValue('role_id', undefined);
    if (!deptId) {
      setRoles([]);
      return;
    }
    try {
      const { data } = await api.get(
        '/departments/' + deptId + '/roles/public'
      );
      setRoles(data);
    } catch {
      setRoles([]);
    }
  };

  const handlePictureChange = (info) => {
    const file = info.fileList?.[0]?.originFileObj;
    if (!file) {
      setPicture(null);
      setPicturePreview(null);
      return;
    }
    setPicture(file);
    const reader = new FileReader();
    reader.onload = (e) => setPicturePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const stepFieldMap = {
    0: ['employee_code', 'full_name', 'email', 'phone'],
    1: ['password', 'confirm_password'],
    2: ['gender', 'department_id', 'role_id'],
  };

  const next = async () => {
    try {
      await form.validateFields(stepFieldMap[current]);
      setCurrent((c) => c + 1);
    } catch {
      /* inline errors show automatically */
    }
  };

  const prev = () => setCurrent((c) => Math.max(0, c - 1));

  const onFinish = async (values) => {
    console.log('[register] form values:', values);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('employee_code', (values.employee_code || '').trim());
      fd.append('full_name', (values.full_name || '').trim());
      fd.append('email', (values.email || '').trim());
      fd.append('password', values.password);
      fd.append('confirm_password', values.confirm_password);
      if (values.phone) fd.append('phone', values.phone.trim());
      if (values.gender) fd.append('gender', values.gender);
      if (values.department_id) fd.append('department_id', values.department_id);
      if (values.role_id) fd.append('role_id', values.role_id);
      if (picture) fd.append('picture', picture);

      await api.post('/auth/register', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success('Account created. Please sign in.');
      nav('/login');
    } catch (err) {
      console.error('[register] FULL ERROR:', err);
      console.error('[register] RESPONSE:', err.response);
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Registration failed';
      message.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const backgroundStyle = coverUrl
    ? {
        backgroundImage: `url("${API_ORIGIN}${coverUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : { backgroundImage: DEFAULT_GRADIENT };

  // ---- Step contents ----
  const step0 = (
    <Row gutter={[16, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item
          label="Staff ID"
          name="employee_code"
          rules={[{ required: true, message: 'Staff ID is required' }]}
        >
          <Input
            prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />}
            placeholder="ASK-002"
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item
          label="Full Name"
          name="full_name"
          rules={[
            { required: true, message: 'Full name is required' },
            { min: 2, message: 'Name is too short' },
          ]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Jane Doe"
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Email is required' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input
            prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
            placeholder="jane@askagro.com"
            autoComplete="email"
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="Phone (optional)" name="phone">
          <Input
            prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
            placeholder="+254..."
          />
        </Form.Item>
      </Col>
    </Row>
  );

  const step1 = (
    <Row gutter={[16, 0]}>
      <Col xs={24}>
        <Form.Item
          label="Password"
          name="password"
          rules={[
            { required: true, message: 'Password is required' },
            { min: 6, message: 'Minimum 6 characters' },
          ]}
          hasFeedback
        >
          <Input.Password
            prefix={<LockFilled style={{ color: '#94a3b8' }} />}
            placeholder="Create a password"
            autoComplete="new-password"
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item
          label="Confirm Password"
          name="confirm_password"
          dependencies={['password']}
          hasFeedback
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockFilled style={{ color: '#94a3b8' }} />}
            placeholder="Repeat password"
            autoComplete="new-password"
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Alert
          type="info"
          showIcon
          title="Use a password you don't use anywhere else."
          style={{ marginTop: 8 }}
        />
      </Col>
    </Row>
  );

  const step2 = (
    <Row gutter={[16, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item
          label="Gender"
          name="gender"
          rules={[{ required: true, message: 'Select gender' }]}
        >
          <Select placeholder="Choose...">
            <Option value="male">
              <ManOutlined /> Male
            </Option>
            <Option value="female">
              <WomanOutlined /> Female
            </Option>
            <Option value="other">Other</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item
          label="Department"
          name="department_id"
          rules={[{ required: true, message: 'Select department' }]}
        >
          <Select
            placeholder="Choose..."
            onChange={onDepartmentChange}
            showSearch
            optionFilterProp="children"
          >
            {departments.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item
          label="Role"
          name="role_id"
          rules={[{ required: true, message: 'Select role' }]}
        >
          <Select
            placeholder={roles.length ? 'Choose...' : 'Select department first'}
            disabled={!roles.length}
            showSearch
            optionFilterProp="children"
          >
            {roles.map((r) => (
              <Option key={r.id} value={r.id}>
                {r.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="Profile Picture (optional)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {picturePreview && (
              <img
                src={picturePreview}
                alt="Preview"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #065f46',
                }}
              />
            )}
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              beforeUpload={() => false}
              onChange={handlePictureChange}
            >
              <Button icon={<UploadOutlined />}>
                {picture ? 'Change picture' : 'Choose picture'}
              </Button>
            </Upload>
            {picture && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {picture.name}
              </Text>
            )}
          </div>
        </Form.Item>
      </Col>
    </Row>
  );

  const steps = [
    { title: 'Personal', content: step0 },
    { title: 'Security', content: step1 },
    { title: 'Work', content: step2 },
  ];

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        position: 'relative',
        boxSizing: 'border-box',
        ...backgroundStyle,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: coverUrl ? 'rgba(0, 0, 0, 0.45)' : 'transparent',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: 560,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 4,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Title level={2} style={{ marginBottom: 4, color: '#065f46' }}>
              Create your account
            </Title>
            <Text type="secondary">ASK Agrobusiness Limited</Text>
          </div>

          <Steps
            current={current}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((s) => ({ title: s.title }))}
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            size="large"
            scrollToFirstError
          >
            {/* ⭐ ALL steps stay mounted — hidden via CSS so their
                Form.Item values persist to onFinish() */}
            <div style={{ position: 'relative' }}>
              {steps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    display: index === current ? 'block' : 'none',
                    animation:
                      index === current ? 'fadeSlide 260ms ease' : 'none',
                  }}
                >
                  {step.content}
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                gap: 12,
              }}
            >
              <Button
                onClick={prev}
                disabled={current === 0 || busy}
                icon={<ArrowLeftOutlined />}
                style={{ visibility: current === 0 ? 'hidden' : 'visible' }}
              >
                Back
              </Button>

              {current < steps.length - 1 ? (
                <Button
                  type="primary"
                  onClick={next}
                  style={{ backgroundColor: '#15803d', minWidth: 140 }}
                >
                  Continue <ArrowRightOutlined />
                </Button>
              ) : (
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={busy}
                  icon={<CheckCircleOutlined />}
                  style={{ backgroundColor: '#15803d', minWidth: 140 }}
                >
                  {busy ? 'Creating...' : 'Create Account'}
                </Button>
              )}
            </div>
          </Form>

          <Divider style={{ margin: '20px 0 12px' }} />

          <p style={{ textAlign: 'center', margin: 0, color: '#64748b' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#065f46', fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}