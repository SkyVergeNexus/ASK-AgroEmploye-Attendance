import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function SidebarShell({ open, onClose, sectionLabel, children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleLogout = () => {
    logout();
    toast.success('Signed out');
    nav('/login');
  };

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

      <aside
        className={
          'z-50 w-64 bg-green-900 text-white flex flex-col ' +
          'fixed top-0 left-0 h-screen ' +
          'md:sticky md:top-0 md:h-screen ' +
          'transform transition-transform duration-300 ease-in-out ' +
          (open ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-green-800 flex items-center justify-between shrink-0">
          <div>
            <p className="text-lg font-bold leading-tight">ASK Agrobusiness</p>
            <p className="text-xs text-green-300">{sectionLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-green-200 hover:text-white text-2xl leading-none cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-95"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* User chip */}
        <div className="px-5 py-4 border-b border-green-800 flex items-center gap-3 shrink-0">
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
          {children}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-green-800 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-green-200 hover:text-white hover:bg-green-800 text-sm font-medium py-2 rounded-lg cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}