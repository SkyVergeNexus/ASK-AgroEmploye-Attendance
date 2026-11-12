import { useEffect, useState } from 'react';
import {
  Card, Row, Col, List, Input, Button, Typography, Space, Empty, Popconfirm, message,
} from 'antd';
import {
  ApartmentOutlined, PlusOutlined, DeleteOutlined, TeamOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [roles, setRoles] = useState([]);
  const [newDept, setNewDept] = useState('');
  const [newRole, setNewRole] = useState('');
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadDepartments = async () => {
    setLoadingDepts(true);
    try {
      const { data } = await api.get('/departments');
      setDepartments(data);
      if (!selected && data.length) setSelected(data[0]);
      else if (selected && !data.find((d) => d.id === selected.id)) {
        setSelected(data[0] || null);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load departments');
    } finally {
      setLoadingDepts(false);
    }
  };

  const loadRoles = async (deptId) => {
    setLoadingRoles(true);
    try {
      const { data } = await api.get('/departments/' + deptId + '/roles');
      setRoles(data);
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadRoles(selected.id);
    else setRoles([]);
  }, [selected]);

  const addDepartment = async () => {
    if (!newDept.trim()) return;
    setSaving(true);
    try {
      await api.post('/departments', { name: newDept.trim() });
      message.success('Department created');
      setNewDept('');
      loadDepartments();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to add department');
    } finally {
      setSaving(false);
    }
  };

  const deleteDepartment = async (id) => {
    try {
      await api.delete('/departments/' + id);
      message.success('Department deleted');
      if (selected?.id === id) setSelected(null);
      loadDepartments();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const addRole = async () => {
    if (!selected || !newRole.trim()) return;
    setSaving(true);
    try {
      await api.post('/roles', { department_id: selected.id, name: newRole.trim() });
      message.success('Role added');
      setNewRole('');
      loadRoles(selected.id);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to add role');
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (id) => {
    try {
      await api.delete('/roles/' + id);
      message.success('Role deleted');
      loadRoles(selected.id);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to delete role');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <Title level={3} style={{ margin: 0, color: '#065f46' }}>
          Departments & Roles
        </Title>
        <Text type="secondary">
          Organize staff into departments and assign the roles available in each
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        {/* Departments panel */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ApartmentOutlined />
                <span>Departments</span>
                <Text type="secondary" style={{ fontWeight: 'normal' }}>
                  ({departments.length})
                </Text>
              </Space>
            }
            bordered={false}
            className="shadow-sm"
            loading={loadingDepts}
          >
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Input
                placeholder="New department name"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                onPressEnter={addDepartment}
                allowClear
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={addDepartment}
                loading={saving}
              >
                Add
              </Button>
            </Space.Compact>

            {departments.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No departments yet"
              />
            ) : (
              <List
                dataSource={departments}
                renderItem={(d) => {
                  const isActive = selected?.id === d.id;
                  return (
                    <List.Item
                      onClick={() => setSelected(d)}
                      style={{
                        cursor: 'pointer',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: isActive ? '#dcfce7' : 'transparent',
                        transition: 'background 150ms ease',
                      }}
                      actions={[
                        <Popconfirm
                          key="del"
                          title="Delete this department?"
                          description="Its roles will also be removed."
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                          cancelText="Cancel"
                          onConfirm={(e) => {
                            e?.stopPropagation?.();
                            deleteDepartment(d.id);
                          }}
                          onCancel={(e) => e?.stopPropagation?.()}
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Popconfirm>,
                      ]}
                    >
                      <Text strong={isActive}>{d.name}</Text>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* Roles panel */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <TeamOutlined />
                <span>Roles</span>
                {selected && (
                  <Text type="secondary" style={{ fontWeight: 'normal' }}>
                    — {selected.name}
                  </Text>
                )}
              </Space>
            }
            bordered={false}
            className="shadow-sm"
          >
            {!selected ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Pick a department on the left"
              />
            ) : (
              <>
                <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                  <Input
                    placeholder={'New role for ' + selected.name}
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onPressEnter={addRole}
                    allowClear
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={addRole}
                    loading={saving}
                  >
                    Add
                  </Button>
                </Space.Compact>

                <List
                  loading={loadingRoles}
                  dataSource={roles}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No roles in this department yet"
                      />
                    ),
                  }}
                  renderItem={(r) => (
                    <List.Item
                      style={{ padding: '10px 12px' }}
                      actions={[
                        <Popconfirm
                          key="del"
                          title="Delete this role?"
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                          cancelText="Cancel"
                          onConfirm={() => deleteRole(r.id)}
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>,
                      ]}
                    >
                      <Text>{r.name}</Text>
                    </List.Item>
                  )}
                />
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}