import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const handleLogout = () => {
    logout();
    nav('/login');
  };

  const pic = user?.profile_picture ? <img src={user.profile_picture} alt="me" className="w-8 h-8 rounded-full object-cover" /> : null;

  return (
    <nav className="bg-green-800 text-white px-6 py-3 flex justify-between items-center">
      <div className="flex gap-6 items-center">
        <Link to="/" className="font-bold text-lg">ASK Agrobusiness</Link>
        <Link to="/dashboard" className="hover:underline">Dashboard</Link>
        <Link to="/profile" className="hover:underline">My Profile</Link>
        {user?.system_role === 'admin' && (
          <>
            <Link to="/admin" className="hover:underline">Admin</Link>
            <Link to="/employees" className="hover:underline">Employees</Link>
            <Link to="/departments" className="hover:underline">Departments</Link>
            <Link to="/reports" className="hover:underline">Reports</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {pic}
        <button onClick={handleLogout} className="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-700">Logout</button>
      </div>
    </nav>
  );
}
