import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Row, Col, Statistic,
  Input, Grid, message, Popconfirm, Empty, Modal, Form, Switch,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  AppstoreOutlined, CheckCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

export default function Services() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/services/all');
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      description: row.description || '',
      is_active: !!row.is_active,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await api.put('/services/' + editing.id, values);
        message.success('Service updated');
      } else {
        await api.post('/services', values);
        message.success('Service created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.response) {
        message.error(err.response?.data?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete('/services/' + id);
      message.success('Service deleted');
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.is_active).length,
    inactive: rows.filter((r) => !r.is_active).length,
  };

  const columns = [
    {
      title: 'Service',
      dataIndex: 'name',
      key: 'name',
      render: (text, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{text}</div>
          {row.description && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 110,
      render: (v) =>
        v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(row)}
          />
          <Popconfirm
            title="Delete this service?"
            description="If it has been used by guests, you'll be asked to deactivate instead."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(row.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderMobileCard = (r) => (
    <div
      key={r.id}
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${r.is_active ? '#16a34a' : '#94a3b8'}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {r.name}
          </div>
          {r.description && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {r.description}
            </div>
          )}
        </div>
        {r.is_active ? (
          <Tag color="green" style={{ margin: 0 }}>Active</Tag>
        ) : (
          <Tag style={{ margin: 0 }}>Inactive</Tag>
        )}
      </div>

      <Space style={{ marginTop: 10 }} size={6}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
          Edit
        </Button>
        <Popconfirm
          title="Delete this service?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove(r.id)}
        >
          <Button danger size="small" icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>
      </Space>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Services
          </Title>
          <Text type="secondary">
            Services that guests can pick when checking in
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            {!isMobile && 'Add Service'}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total" value={stats.total} prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Active" value={stats.active} prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Inactive" value={stats.inactive} prefix={<StopOutlined style={{ color: '#94a3b8' }} />} />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        {isMobile ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary">Loading...</Text>
            </div>
          ) : rows.length === 0 ? (
            <Empty description="No services yet" />
          ) : (
            <div>{rows.map(renderMobileCard)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            locale={{ emptyText: 'No services yet' }}
          />
        )}
      </Card>

      <Modal
        title={editing ? 'Edit service' : 'Add service'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editing ? 'Save' : 'Create'}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 480}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Service name"
            name="name"
            rules={[
              { required: true, message: 'Service name is required' },
              { max: 120, message: '120 characters max' },
            ]}
          >
            <Input placeholder="e.g. Meeting with HR" />
          </Form.Item>

          <Form.Item
            label="Description (optional)"
            name="description"
            rules={[{ max: 255, message: '255 characters max' }]}
          >
            <TextArea
              rows={2}
              placeholder="e.g. Interviews, appointments, HR consultations"
              showCount
              maxLength={255}
            />
          </Form.Item>

          <Form.Item
            label="Active"
            name="is_active"
            valuePropName="checked"
            extra="Inactive services are hidden from the guest check-in form"
          >
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}