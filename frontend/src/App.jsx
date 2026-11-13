import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Protected, AdminRoute, EmployeeRoute } from './components/Protected';
import AdminSidebar from './components/AdminSidebar';
import EmployeeSidebar from './components/EmployeeSidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AttendanceHistory from './pages/AttendanceHistory';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees';
import Departments from './pages/Departments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import EarlyLeaveRequests from './pages/EarlyLeaveRequests';

function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const close = () => setSidebarOpen(false);
  const isAdmin = user?.system_role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {isAdmin ? (
        <AdminSidebar open={sidebarOpen} onClose={close} />
      ) : (
        <EmployeeSidebar open={sidebarOpen} onClose={close} />
      )}

      <div className="flex-1 min-w-0 flex flex-col md:h-screen md:overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-green-900 text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-2xl leading-none"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="font-semibold">{isAdmin ? 'Admin' : 'Staff'}</span>
          <span className="w-6" />
        </header>

        {/* Content area — scrolls independently on desktop */}
        <main className="flex-1 min-w-0 p-4 md:p-6 md:overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Shell() {
  const { user, ready } = useAuth();
  if (!ready) return null;

  const home = user
    ? (user.system_role === 'admin' ? '/admin' : '/dashboard')
    : '/login';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={home} /> : <Register />} />

      <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/dashboard" element={<EmployeeRoute><Dashboard /></EmployeeRoute>} />
        <Route path="/attendance" element={<EmployeeRoute><AttendanceHistory /></EmployeeRoute>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/early-leave" element={<AdminRoute><EarlyLeaveRequests /></AdminRoute>} />
        <Route path="/employees" element={<AdminRoute><Employees /></AdminRoute>} />
        <Route path="/departments" element={<AdminRoute><Departments /></AdminRoute>} />
        <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={home} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}