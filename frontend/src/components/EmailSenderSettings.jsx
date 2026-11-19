import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Space, Spin, Switch, Tag, Typography,
} from 'antd';
import { MailOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../api/axios';
import toast from 'react-hot-toast';

const { Text } = Typography;

export default function EmailSenderSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [senderStatus, setSenderStatus] = useState({
    configured: false,
    source: 'none',
    hasPassword: false,
    encryptionKeyConfigured: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/email-settings');
      setSenderStatus(data);
      form.setFieldsValue({
        host: data.host,
        port: data.port,
        secure: data.secure,
        username: data.username,
        fromEmail: data.fromEmail,
        password: '',
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load email sender settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (values) => {
    setSaving(true);
    try {
      const { data } = await api.put('/email-settings', {
        ...values,
        secure: Boolean(values.secure),
        password: values.password || '',
      });
      setSenderStatus((current) => ({ ...current, ...data.settings }));
      form.setFieldValue('password', '');
      toast.success(data.message || 'Email sender settings saved.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save email sender settings.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/email-settings/test');
      toast.success(data.message || 'Test email sent.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'SMTP test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={<Space><MailOutlined /> Notification email sender</Space>}
      className="shadow-sm"
      style={{ marginTop: 20 }}
      extra={
        senderStatus.source === 'database' ? (
          <Tag color="green">Admin configured</Tag>
        ) : senderStatus.source === 'environment' ? (
          <Tag color="blue">Render configured</Tag>
        ) : (
          <Tag>Not configured</Tag>
        )
      }
    >
      {loading ? (
        <Spin />
      ) : (
        <>
          {!senderStatus.encryptionKeyConfigured && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="Encryption key required"
              description="Add SMTP_CREDENTIALS_ENCRYPTION_KEY to the backend's Render environment before saving SMTP credentials."
            />
          )}

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Use a sender mailbox you control"
            description="For Gmail, use an app password if SMTP is enabled; never enter your normal account password. On port 587, leave implicit TLS off (STARTTLS is negotiated automatically)."
          />

          {senderStatus.source === 'environment' && (
            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              title="Current sender settings come from Render"
              description="Saving SMTP settings here moves the sender configuration into this admin page. Re-enter the SMTP password to save it encrypted in the database."
            />
          )}

          <Form form={form} layout="vertical" onFinish={save}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                label="SMTP host"
                name="host"
                rules={[{ required: true, message: 'Enter the SMTP host.' }]}
              >
                <Input placeholder="smtp.gmail.com" autoComplete="url" />
              </Form.Item>
              <Form.Item
                label="SMTP port"
                name="port"
                rules={[{ required: true, message: 'Enter the SMTP port.' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item
              label="Use implicit TLS (usually enabled for port 465)"
              name="secure"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="SMTP username"
              name="username"
              rules={[{ required: true, message: 'Enter the SMTP username.' }]}
            >
              <Input autoComplete="username" />
            </Form.Item>

            <Form.Item
              label={senderStatus.hasPassword ? 'SMTP password or app password (saved)' : 'SMTP password or app password'}
              name="password"
              rules={[
                {
                  required: !senderStatus.hasPassword || senderStatus.source === 'environment',
                  message: 'Enter the SMTP password or app password.',
                },
              ]}
              extra={
                senderStatus.source === 'database' && senderStatus.hasPassword
                  ? 'Leave blank to keep the saved password. The stored password is encrypted and never shown again.'
                  : 'Use the password or app password issued for SMTP; it is encrypted before it is stored.'
              }
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>

            <Form.Item
              label="Sender email address"
              name="fromEmail"
              rules={[
                { required: true, message: 'Enter the sender email address.' },
                { type: 'email', message: 'Enter a valid email address.' },
              ]}
            >
              <Input placeholder="notifications@yourcompany.com" />
            </Form.Item>

            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              The sender address must be authorized by your email provider. Test emails are sent to the signed-in administrator’s registered email.
            </Text>

            <Space wrap>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={!senderStatus.encryptionKeyConfigured}
              >
                Save sender settings
              </Button>
              <Button
                onClick={sendTest}
                loading={testing}
                disabled={!senderStatus.configured || saving}
              >
                Send test email
              </Button>
            </Space>
          </Form>
        </>
      )}
    </Card>
  );
}
