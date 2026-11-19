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
  const [connectingOutlook, setConnectingOutlook] = useState(false);
  const [outlookFlow, setOutlookFlow] = useState(null);
  const [selectedAuthType, setSelectedAuthType] = useState('smtp_password');
  const [senderStatus, setSenderStatus] = useState({
    configured: false,
    source: 'none',
    hasPassword: false,
    authType: 'smtp_password',
    outlookConnected: false,
    encryptionKeyConfigured: false,
    microsoftOAuthConfigured: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/email-settings');
      setSenderStatus(data);
      setSelectedAuthType(data.authType || 'smtp_password');
      form.setFieldsValue({
        authType: data.authType || 'smtp_password',
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
        authType: selectedAuthType,
        secure: Boolean(values.secure),
        password: values.password || '',
      });
      setSenderStatus((current) => ({ ...current, ...data.settings }));
      setSelectedAuthType(data.settings.authType || 'smtp_password');
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

  const connectOutlook = async () => {
    setConnectingOutlook(true);
    try {
      const { data: device } = await api.post('/email-settings/outlook/device-code');
      setOutlookFlow(device);
      let interval = (device.interval || 5) * 1000;
      const expiresAt = Date.now() + (device.expiresIn || 900) * 1000;

      while (Date.now() < expiresAt) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        const { data } = await api.post('/email-settings/outlook/poll', {
          deviceCode: device.deviceCode,
        });
        if (data.status === 'connected') {
          setOutlookFlow(null);
          await load();
          toast.success(data.message || 'Outlook mailbox connected.');
          return;
        }
        interval = (data.interval || device.interval || 5) * 1000;
      }

      setOutlookFlow(null);
      toast.error('The Outlook sign-in code expired. Start the connection again.');
    } catch (error) {
      setOutlookFlow(null);
      toast.error(error.response?.data?.message || 'Unable to connect Outlook.');
    } finally {
      setConnectingOutlook(false);
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
              description="Add a valid SMTP_CREDENTIALS_ENCRYPTION_KEY to the backend environment before saving credentials or connecting Outlook."
            />
          )}

          {selectedAuthType === 'smtp_password' ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title="Use a sender mailbox you control"
              description="For Gmail, use an app password if SMTP is enabled; never enter your normal account password. On port 587, leave implicit TLS off (STARTTLS is negotiated automatically)."
            />
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title="Outlook.com / Hotmail OAuth2"
              description={
                senderStatus.microsoftOAuthConfigured
                  ? 'Outlook uses Microsoft OAuth2; SMTP is fixed to smtp-mail.outlook.com on port 587 with STARTTLS. Save the sender address, then connect the mailbox.'
                  : 'First register a Microsoft public-client app that supports personal Microsoft accounts, enable device-code/public-client flow, and set its application ID as MICROSOFT_OAUTH_CLIENT_ID on the backend.'
              }
            />
          )}

          {senderStatus.source === 'environment' && (
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
              if (changed.authType) setSelectedAuthType(changed.authType);
            }}
          >
            <Form.Item label="Email provider" name="authType" rules={[{ required: true }]}>
              <Select
                disabled={saving || connectingOutlook}
                options={[
                  { value: 'smtp_password', label: 'SMTP username and password / app password' },
                  { value: 'outlook_oauth2', label: 'Outlook.com / Hotmail (OAuth2)' },
                ]}
              />
            </Form.Item>

            {selectedAuthType === 'smtp_password' && (
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
            )}

            {selectedAuthType === 'smtp_password' && (
              <Form.Item
                label="Use implicit TLS (usually enabled for port 465)"
                name="secure"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            )}

            <Form.Item
              label={selectedAuthType === 'outlook_oauth2' ? 'Outlook account address' : 'SMTP username'}
              name="username"
              rules={[
                { required: true, message: 'Enter the sender mailbox username.' },
                ...(selectedAuthType === 'outlook_oauth2'
                  ? [{ type: 'email', message: 'Enter a valid Outlook account email.' }]
                  : []),
              ]}
            >
              <Input autoComplete="username" />
            </Form.Item>

            {selectedAuthType === 'smtp_password' && (
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
            )}

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
              {selectedAuthType === 'outlook_oauth2' && (
                <Button
                  onClick={connectOutlook}
                  loading={connectingOutlook}
                  disabled={
                    !senderStatus.configured
                      || senderStatus.source !== 'database'
                      || senderStatus.authType !== 'outlook_oauth2'
                    || !senderStatus.microsoftOAuthConfigured
                    || !senderStatus.encryptionKeyConfigured
                    || saving
                  }
                >
                  {senderStatus.outlookConnected ? 'Reconnect Outlook' : 'Connect Outlook'}
                </Button>
              )}
              <Button
                onClick={sendTest}
                loading={testing}
                disabled={
                  !senderStatus.configured
                  || saving
                  || (senderStatus.source === 'database' && !senderStatus.encryptionKeyConfigured)
                  || (selectedAuthType === 'outlook_oauth2'
                    ? !senderStatus.outlookConnected || !senderStatus.encryptionKeyConfigured
                    : senderStatus.source === 'database' && !senderStatus.hasPassword)
                }
              >
                Send test email
              </Button>
            </Space>
          </Form>

          {outlookFlow && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
              message="Finish connecting your Outlook mailbox"
              description={
                <Space direction="vertical">
                  <Text>Sign in using the same address entered as the SMTP username, then enter this code:</Text>
                  <Text strong copyable>{outlookFlow.userCode}</Text>
                  <a href={outlookFlow.verificationUri} target="_blank" rel="noreferrer">
                    Open Microsoft device sign-in
                  </a>
                  <Text type="secondary">This page will finish connecting automatically after approval.</Text>
                </Space>
              }
            />
          )}
        </>
      )}
    </Card>
  );
}
