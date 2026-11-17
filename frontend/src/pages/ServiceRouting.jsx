import { useEffect, useState } from 'react';
import { Card, Table, Select, message, Typography, Space, Tag } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import api from '../../api/axios';

const { Title, Text } = Typography;

export default function ServiceRouting() {
  const [services, setServices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [svc, dept, rl] = await Promise.all([
        api.get('/services/all'),
        api.get('/departments'),
        api.get('/roles'),
      ]);
      setServices(svc.data);
      setDepartments(dept.data);
      setRoles(rl.data);
    } catch (e) {
      message.error(e.response?.data?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const updateService = async (svc, patch) => {
    try {
      await api.put('/services/' + svc.id, {
        name: svc.name,
        description: svc.description,
        is_active: !!svc.is_active,
        department_id: svc.department_id,
        role_id: svc.role_id,
        ...patch,
      });
      message.success('Routing updated');
      load();
    } catch (e) {
      message.error(e.response?.data?.message || 'Update failed');
    }
  };

  const columns = [
    {
      title: 'Service',
      dataIndex: 'name',
      key: 'name',
      render: (t, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{t}</div>
          {r.description && (
            <div style={{ fontSize: 12, color: '#64748b' }}>{r.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Department',
      key: 'department',
      render: (_, svc) => (
        <Select
          style={{ width: '100%' }}
          placeholder="Any department…"
          allowClear
          value={svc.department_id || undefined}
          onChange={(v) => updateService(svc, { department_id: v || null })}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
      ),
    },
    {
      title: 'Role',
      key: 'role',
      render: (_, svc) => (
        <Select
          style={{ width: '100%' }}
          placeholder="Any role…"
          allowClear
          value={svc.role_id || undefined}
          onChange={(v) => updateService(svc, { role_id: v || null })}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (v) => (v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <Title level={3} style={{ margin: 0, color: '#065f46' }}>
        <Space>
          <ApartmentOutlined />
          Guest Service Routing
        </Space>
      </Title>
      <Text type="secondary">
        When a guest picks a service, the system assigns the least-busy active employee whose
        department/role matches the service.
      </Text>

      <Card bordered={false} className="shadow-sm mt-4">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={services}
          columns={columns}
          pagination={false}
        />
      </Card>
    </div>
  );
}