import { NavLink } from 'react-router-dom';
import SidebarShell from './SidebarShell';

const linkClass = ({ isActive }) =>
  'block px-4 py-2 rounded-lg text-sm font-medium transition ' +
  (isActive
    ? 'bg-green-700 text-white'
    : 'text-green-100 hover:bg-green-800 hover:text-white');

export default function AdminSidebar({ open, onClose }) {
  return (
    <SidebarShell open={open} onClose={onClose} sectionLabel="Admin Console">
      <p className="px-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Administration
      </p>
      <NavLink to="/admin" className={linkClass} end>Admin Dashboard</NavLink>
      <NavLink to="/employees" className={linkClass}>Employees</NavLink>

      <p className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-green-400">
        Account
      </p>
      <NavLink to="/profile" className={linkClass}>My Profile</NavLink>
    </SidebarShell>
  );
}