export function attendanceRecordLabel(record) {
  if (record.admin_resolved) {
    return record.status === 'absent' ? 'Admin marked absent' : 'Admin confirmed present';
  }
  if (record.auto_clocked_out) return 'Auto clocked out';
  if (record.needs_review) return 'Awaiting admin review';
  return record.clock_out ? 'Employee clock-out' : 'Clock-out pending';
}

export function attendanceClockOutLabel(record) {
  if (record.clock_out) return record.clock_out;
  if (record.needs_review) return 'Awaiting admin review';
  if (record.after_close_tracking) return 'Monitoring departure';
  return 'Not recorded';
}
