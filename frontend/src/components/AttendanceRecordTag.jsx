import { Tag } from 'antd';

export default function AttendanceRecordTag({ record }) {
  if (record.admin_resolved) {
    const absent = record.status === 'absent';
    return (
      <Tag color={absent ? 'red' : 'green'}>
        {absent ? 'Admin marked absent' : 'Admin confirmed present'}
      </Tag>
    );
  }

  if (record.auto_clocked_out) {
    return <Tag color="blue">Auto clocked out</Tag>;
  }

  if (record.needs_review) {
    return <Tag color="orange">Awaiting admin review</Tag>;
  }

  return null;
}
