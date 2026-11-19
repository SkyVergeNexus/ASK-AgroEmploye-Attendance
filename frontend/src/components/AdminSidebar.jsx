import { NavLink } from 'react-router-dom';
import {
  AppstoreOutlined, SettingOutlined, TeamOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons';
import SidebarShell from './SidebarShell';

const linkClass = ({ isActive }) =>
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ' +
  (isActive
    ? 'bg-green-700 text-white shadow-sm'
    : 'text-green-100 hover:bg-green-800 hover:text-white');

export default function AdminSidebar({ open, onClose }) {
  return (
    <SidebarShell open={open} onClose={onClose} sectionLabel="Admin Console">
      <p className="px-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Administration
      </p>
      <NavLink to="/admin" className={linkClass} end>
        <AppstoreOutlined className="text-base" /><span>Admin Dashboard</span>
      </NavLink>
      <NavLink to="/services" className={linkClass}>
        <ToolOutlined className="text-base" /><span>Services</span>
      </NavLink>
      <NavLink to="/guests" className={linkClass}>
        <TeamOutlined className="text-base" /><span>Guest View</span>
      </NavLink>

      <p className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Account
      </p>
      <NavLink to="/settings" className={linkClass}>
        <SettingOutlined className="text-base" /><span>System Settings</span>
      </NavLink>
      <NavLink to="/profile" className={linkClass}>
        <UserOutlined className="text-base" /><span>My Profile</span>
      </NavLink>
    </SidebarShell>
  );
}