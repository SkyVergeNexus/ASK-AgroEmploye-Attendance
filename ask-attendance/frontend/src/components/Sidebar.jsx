import { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const linkClass = ({ isActive }) =>
  'block px-4 py-2 rounded-lg text-sm font-medium transition ' +
  (isActive
    ? 'bg-green-700 text-white'
    : 'text-green-100 hover:bg-green-800 hover:text-white');

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  // Close on route change (mobile)
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close on Escape (mobile)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleLogout = () => {
    logout();
    toast.success('Signed out');
    nav('/login');
  };

  const isAdmin = user?.system_role === 'admin';
  const pic = user?.profile_picture
    ? 'http://localhost:5000' + user.profile_picture
    : null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={
          'fixed inset-0 bg-black/40 z-40 transition-opacity md:hidden ' +
          (open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={
          'fixed md:static top-0 left-0 z-50 h-screen w-64 bg-green-900 text-white flex flex-col ' +
          'transform transition-transform duration-300 ease-in-out ' +
          (open ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-green-800 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold leading-tight">ASK Agrobusiness</p>
            <p className="text-xs text-green-300">Attendance System</p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-green-200 hover:text-white text-2xl leading-none"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* User chip */}
        <div className="px-5 py-4 border-b border-green-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-700 overflow-hidden flex items-center justify-center text-sm font-bold shrink-0">
            {pic
              ? <img src={pic} alt="me" className="w-full h-full object-cover" />
              : (user?.name || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-green-300 truncate">
              {user?.role_name || user?.system_role}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/profile" className={linkClass}>My Profile</NavLink>

          {isAdmin && (
            <>
              <p className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-green-400">
                Admin
              </p>
              <NavLink to="/admin" className={linkClass}>Overview</NavLink>
              <NavLink to="/employees" className={linkClass}>Employees</NavLink>
              <NavLink to="/departments" className={linkClass}>Departments</NavLink>
              <NavLink to="/reports" className={linkClass}>Reports</NavLink>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-green-800">
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}