import { NavLink } from 'react-router-dom';
import {
  CalendarOutlined, ClockCircleOutlined, HistoryOutlined, UserOutlined,
} from '@ant-design/icons';
import SidebarShell from './SidebarShell';

const linkClass = ({ isActive }) =>
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ' +
  (isActive
    ? 'bg-green-700 text-white shadow-sm'
    : 'text-green-100 hover:bg-green-800 hover:text-white');

export default function EmployeeSidebar({ open, onClose }) {
  return (
    <SidebarShell open={open} onClose={onClose} sectionLabel="Staff Portal">
      <p className="px-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Attendance
      </p>
      <NavLink to="/dashboard" className={linkClass} end>
        <ClockCircleOutlined className="text-base" /><span>Clock In / Out</span>
      </NavLink>
      <NavLink to="/attendance" className={linkClass}>
        <HistoryOutlined className="text-base" /><span>Attendance History</span>
      </NavLink>
      <NavLink to="/leave-requests" className={linkClass}>
        <CalendarOutlined className="text-base" /><span>Absence Requests</span>
      </NavLink>

      <p className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Account
      </p>
      <NavLink to="/profile" className={linkClass}>
        <UserOutlined className="text-base" /><span>My Profile</span>
      </NavLink>
    </SidebarShell>
  );
}