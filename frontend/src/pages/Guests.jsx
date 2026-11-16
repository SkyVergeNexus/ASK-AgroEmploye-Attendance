import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Typography, Space, Row, Col, Statistic,
  DatePicker, Input, Grid, message, Popconfirm, Empty, Modal, Descriptions,
} from 'antd';
import {
  UserOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, DeleteOutlined,
  CalendarOutlined, TeamOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const genderColor = { male: 'blue', female: 'magenta', other: 'purple' };

export default function Guests() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, week: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(null);
  const [viewing, setViewing] = useState(null);

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/guests/stats');
      setStats(data);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (range?.[0]) params.from = range[0].format('YYYY-MM-DD');
      if (range?.[1]) params.to = range[1].format('YYYY-MM-DD');
      const { data } = await api.get('/guests', { params });
      setRows(data);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, [search, range]);

  useEffect(() => {
    load();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [search, range, load]);

  const remove = async (id) => {
    try {
      await api.delete('/guests/' + id);
      message.success('Guest record deleted');
      load();
      loadStats();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'Date & Time',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 160,
        render: (v) => dayjs(v).format('DD MMM YYYY, HH:mm'),
        sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
        defaultSortOrder: 'descend',
      },
      {
        title: 'Guest',
        dataIndex: 'full_name',
        key: 'full_name',
        render: (text, row) => (
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500">{row.phone}</div>
          </div>
        ),
      },
      {
        title: 'Service',
        key: 'service',
        render: (_, row) => (
          <div>
            <div style={{ fontWeight: 500 }}>{row.service_name || '—'}</div>
            {row.service_name === 'Other' && row.purpose && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {row.purpose}
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Gender',
        dataIndex: 'gender',
        key: 'gender',
        width: 90,
        render: (v) => (v ? <Tag color={genderColor[v] || 'default'}>{v}</Tag> : '—'),
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
              icon={<EyeOutlined />}
              onClick={() => setViewing(row)}
            />
            <Popconfirm
              title="Delete this guest record?"
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(row.id)}
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    []
  );

  const renderMobileCard = (r) => (
    <div
      key={r.id}
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderLeft: '4px solid #7c3aed',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {r.full_name}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {r.phone} · {dayjs(r.created_at).format('DD MMM, HH:mm')}
          </div>
        </div>
        {r.gender && <Tag color={genderColor[r.gender] || 'default'}>{r.gender}</Tag>}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: '8px 10px',
          background: '#f8fafc',
          borderRadius: 8,
          fontSize: 12,
          color: '#334155',
          wordBreak: 'break-word',
        }}
      >
        <strong>Service:</strong> {r.service_name || '—'}
        {r.service_name === 'Other' && r.purpose && (
          <div style={{ marginTop: 4 }}>
            <strong>Purpose:</strong> {r.purpose}
          </div>
        )}
      </div>

      <Space style={{ marginTop: 10 }} size={6}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(r)}>
          View
        </Button>
        <Popconfirm
          title="Delete this guest record?"
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

  const renderDetail = () => {
    if (!viewing) return null;
    const r = viewing;
    return (
      <Modal
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
        centered
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        title={
          <Space>
            <UserOutlined />
            <span>{r.full_name}</span>
            {r.gender && <Tag color={genderColor[r.gender]}>{r.gender}</Tag>}
          </Space>
        }
      >
        <Descriptions
          column={1}
          size="small"
          bordered
          labelStyle={{ width: 140, background: '#f8fafc', fontWeight: 600 }}
        >
          <Descriptions.Item label="Full Name">{r.full_name}</Descriptions.Item>
          <Descriptions.Item label="Phone">{r.phone}</Descriptions.Item>
          <Descriptions.Item label="Gender">{r.gender || '—'}</Descriptions.Item>
          <Descriptions.Item label="Service">
            {r.service_name || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Purpose">{r.purpose}</Descriptions.Item>
          <Descriptions.Item label="Notes">
            {r.notes ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>
            ) : (
              <Text type="secondary">None</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Signed in">
            {dayjs(r.created_at).format('dddd, DD MMM YYYY · HH:mm')}
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Title level={3} style={{ margin: 0, color: '#065f46' }}>
            Guests / Visitors
          </Title>
          <Text type="secondary">
            Walk-in guest registrations from the login page
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            load();
            loadStats();
          }}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total" value={stats.total} prefix={<TeamOutlined style={{ color: '#1677ff' }} />} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Today"
              value={stats.today}
              prefix={<CalendarOutlined style={{ color: '#16a34a' }} />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="This week"
              value={stats.week}
              prefix={<AppstoreOutlined style={{ color: '#7c3aed' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm mb-4">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Input
              placeholder="Search name, phone, service"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={12}>
            <RangePicker
              value={range}
              onChange={setRange}
              allowClear
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      <Card bordered={false} className="shadow-sm">
        {isMobile ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary">Loading...</Text>
            </div>
          ) : rows.length === 0 ? (
            <Empty description="No guests have signed in yet" />
          ) : (
            <div>{rows.map(renderMobileCard)}</div>
          )
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No guests have signed in yet' }}
          />
        )}
      </Card>

      {renderDetail()}
    </div>
  );
}