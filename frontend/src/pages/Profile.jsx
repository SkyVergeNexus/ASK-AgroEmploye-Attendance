import { useEffect, useState } from 'react';
import {
  Card, Avatar, Typography, Form, Input, Select, Button, Upload, message, Space, Tag,
} from 'antd';
import { UserOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../config';

const { Title, Text } = Typography;
const { Option } = Select;

export default function Profile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
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
    } catch (err) {
      message.error(err.response?.data?.message || 'Password change failed');
    }
  };

  if (!profile) {
    return <div className="p-6 text-gray-500">Loading profile...</div>;
  }

  const picUrl = profile.profile_picture
    ? API_ORIGIN + profile.profile_picture
    : null;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Title level={3} style={{ marginBottom: 24, color: '#065f46' }}>
        My Profile
      </Title>

      {/* Identity card */}
      <Card bordered={false} className="shadow-sm mb-6">
        <div className="flex items-center gap-6 flex-wrap md:flex-nowrap">
          <Avatar
            size={96}
            src={picUrl || undefined}
            icon={!picUrl ? <UserOutlined /> : undefined}
            style={{ backgroundColor: picUrl ? undefined : '#065f46', flexShrink: 0 }}
          />
          <div>
            <div className="text-lg font-semibold">{profile.full_name}</div>
            <Text type="secondary">{profile.email}</Text>
            <div className="mt-2">
              <Space size={6} wrap>
                <Tag color="blue">{profile.employee_code}</Tag>
                <Tag color="cyan">{profile.department_name || '—'}</Tag>
                <Tag color="geekblue">{profile.role_name || '—'}</Tag>
              </Space>
            </div>
            <div className="mt-3 flex gap-2 items-center flex-wrap">
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={(f) => { setFile(f); return false; }}
                onRemove={() => setFile(null)}
              >
                <Button icon={<UploadOutlined />}>Choose Picture</Button>
              </Upload>
              <Button
                type="primary"
                onClick={uploadPicture}
                loading={uploading}
                disabled={!file}
              >
                Upload
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Personal info */}
      <Card title="Personal Info" bordered={false} className="shadow-sm mb-6">
        <Form
          form={infoForm}
          layout="vertical"
          requiredMark={false}
          onFinish={saveInfo}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item
              label="Full Name"
              name="full_name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input placeholder="Full name" />
            </Form.Item>
            <Form.Item label="Phone" name="phone">
              <Input placeholder="Phone" />
            </Form.Item>
            <Form.Item label="Gender" name="gender">
              <Select placeholder="Gender..." allowClear>
                <Option value="male">Male</Option>
                <Option value="female">Female</Option>
                <Option value="other">Other</Option>
              </Select>
            </Form.Item>
          </div>
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            className="mt-2"
          >
            Save Changes
          </Button>
        </Form>
      </Card>

      {/* Change password */}
      <Card title="Change Password" bordered={false} className="shadow-sm">
        <Form
          form={pwdForm}
          layout="vertical"
          requiredMark={false}
          onFinish={changePassword}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item
              label="Current Password"
              name="current_password"
              rules={[{ required: true, message: 'Current password is required' }]}
            >
              <Input.Password placeholder="Current password" />
            </Form.Item>
            <Form.Item
              label="New Password"
              name="new_password"
              rules={[
                { required: true, message: 'New password is required' },
                { min: 6, message: 'At least 6 characters' },
              ]}
            >
              <Input.Password placeholder="New password" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" className="mt-2">
            Update Password
          </Button>
        </Form>
      </Card>
    </div>
  );
}