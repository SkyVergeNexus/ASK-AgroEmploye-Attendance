import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Select, Space, Spin, Switch, Tag, Typography,
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
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('smtp');
  const [senderStatus, setSenderStatus] = useState({
    configured: false,
    source: 'none',
    provider: 'smtp',
    hasPassword: false,
    gmailApiConnected: false,
    encryptionKeyConfigured: false,
    googleOAuthConfigured: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/email-settings');
      setSenderStatus(data);
      setSelectedProvider(data.provider || 'smtp');
      form.setFieldsValue({
        provider: data.provider || 'smtp',
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
        provider: selectedProvider,
        secure: Boolean(values.secure),
        password: selectedProvider === 'smtp' ? values.password || '' : '',
      });
      setSenderStatus((current) => ({ ...current, ...data.settings }));
      setSelectedProvider(data.settings.provider || 'smtp');
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
      toast.error(error.response?.data?.message || 'Email test failed.');
    } finally {
      setTesting(false);
    }
  };

  const connectGmail = async () => {
    const popup = window.open('about:blank', 'gmail-sender-oauth', 'popup,width=600,height=720');
    if (!popup) {
      toast.error('Allow popups for this site, then try connecting Gmail again.');
      return;
    }

    setConnectingGmail(true);
    try {
      const { data } = await api.get('/email-settings/google/authorize');
      popup.location.href = data.authorizationUrl;
      popup.opener = null;

      const expiresAt = Date.now() + 10 * 60 * 1000;
      while (Date.now() < expiresAt) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const { data: status } = await api.get('/email-settings');
        setSenderStatus(status);
        if (status.gmailApiConnected) {
          toast.success('Gmail sender connected.');
          return;
        }
        if (popup.closed) {
          toast.error('The Google sign-in window closed before the Gmail sender was connected.');
          return;
        }
      }

      if (!popup.closed) popup.close();
      toast.error('Google sign-in expired. Start the Gmail connection again.');
    } catch (error) {
      if (!popup.closed) popup.close();
      toast.error(error.response?.data?.message || 'Unable to connect Gmail.');
    } finally {
      setConnectingGmail(false);
    }
  };

  const providerConfigured = selectedProvider === 'gmail_api'
    ? senderStatus.gmailApiConnected
    : senderStatus.configured;

  return (
    <Card
      title={<Space><MailOutlined /> Notification email sender</Space>}
      className="shadow-sm"
      style={{ marginTop: 20 }}
      extra={
        senderStatus.source === 'database' && senderStatus.provider === 'gmail_api' ? (
          <Tag color={senderStatus.gmailApiConnected ? 'green' : 'gold'}>
            {senderStatus.gmailApiConnected ? 'Gmail API connected' : 'Gmail API not connected'}
          </Tag>
        ) : senderStatus.source === 'database' ? (
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
              description="Add a valid SMTP_CREDENTIALS_ENCRYPTION_KEY to the backend environment before saving sender credentials."
            />
          )}

          {selectedProvider === 'smtp' ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title="SMTP sender"
              description="For Gmail SMTP, use an app password if SMTP is enabled; never enter your normal account password. Port 465 uses implicit TLS; port 587 uses STARTTLS with implicit TLS off."
            />
          ) : (
            <Alert
              type={senderStatus.googleOAuthConfigured ? 'info' : 'warning'}
              showIcon
              style={{ marginBottom: 16 }}
              title="Gmail API / OAuth2"
              description={
                senderStatus.googleOAuthConfigured
                  ? 'Gmail API sends through HTTPS. Save the Gmail sender address, then connect that same Google account. No SMTP port or Gmail password is used.'
                  : 'Configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI on the backend before connecting Gmail.'
              }
            />
          )}

          {senderStatus.source === 'environment' && selectedProvider === 'smtp' && (
            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              title="Current sender settings come from Render"
              description="Saving SMTP settings here moves the sender configuration into this admin page. Re-enter the SMTP password to save it encrypted in the database."
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={save}
            onValuesChange={(changed) => {
              if (changed.provider) setSelectedProvider(changed.provider);
            }}
          >
            <Form.Item label="Email delivery method" name="provider" rules={[{ required: true }]}>
              <Select
                disabled={saving || connectingGmail}
                options={[
                  { value: 'smtp', label: 'SMTP username and password / app password' },
                  { value: 'gmail_api', label: 'Gmail API (OAuth2 over HTTPS)' },
                ]}
              />
            </Form.Item>

            {selectedProvider === 'smtp' && (
              <>
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
              </>
            )}

            <Form.Item
              label="Sender email address"
              name="fromEmail"
              rules={[
                { required: true, message: 'Enter the sender email address.' },
                { type: 'email', message: 'Enter a valid sender email address.' },
              ]}
            >
              <Input placeholder="youraccount@gmail.com" />
            </Form.Item>

            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Test emails are sent to the signed-in administrator’s registered email address.
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
              {selectedProvider === 'gmail_api' && (
                <Button
                  onClick={connectGmail}
                  loading={connectingGmail}
                  disabled={
                    !senderStatus.googleOAuthConfigured
                    || !senderStatus.encryptionKeyConfigured
                    || senderStatus.source !== 'database'
                    || senderStatus.provider !== 'gmail_api'
                    || saving
                  }
                >
                  {senderStatus.gmailApiConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
                </Button>
              )}
              <Button
                onClick={sendTest}
                loading={testing}
                disabled={
                  !providerConfigured
                  || saving
                  || (senderStatus.source === 'database' && !senderStatus.encryptionKeyConfigured)
                  || (selectedProvider === 'gmail_api'
                    && (!senderStatus.gmailApiConnected || !senderStatus.googleOAuthConfigured))
                }
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
