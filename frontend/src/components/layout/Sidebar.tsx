import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, Video, Server, Users, AlertTriangle,
  ShieldAlert, UserCog, Settings, LogOut,
} from 'lucide-react';
import { HypersparkWordmark } from '../brand/HypersparkBrand';
import { supabase } from '../../lib/supabase';

interface SidebarProps {
  role: 'admin' | 'user';
  userName?: string;
}

const adminMenu = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Sites', icon: MapPin, path: '/sites' },
  { name: 'Cameras', icon: Video, path: '/cameras' },
  { name: 'Edge Servers', icon: Server, path: '/edge-servers' },
  { name: 'Employees', icon: Users, path: '/employees' },
  { name: 'Events', icon: AlertTriangle, path: '/events' },
  { name: 'Violations', icon: ShieldAlert, path: '/violations' },
  { name: 'Users', icon: UserCog, path: '/users' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

const userMenu = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Sites', icon: MapPin, path: '/sites' },
  { name: 'Cameras', icon: Video, path: '/cameras' },
  { name: 'Employees', icon: Users, path: '/employees' },
  { name: 'Events', icon: AlertTriangle, path: '/events' },
  { name: 'Violations', icon: ShieldAlert, path: '/violations' },
];

const Sidebar = ({ role, userName }: SidebarProps) => {
  const navigate = useNavigate();
  const menuItems = role === 'admin' ? adminMenu : userMenu;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-slate-900 text-white flex flex-col h-full shrink-0">
      <div className="min-h-[80px] flex flex-col justify-center px-6 border-b border-slate-800 shrink-0">
        <div className="flex flex-col items-start gap-1">
          <div className="bg-white rounded-lg px-3 py-2 shadow-sm transition-transform hover:scale-[1.02] cursor-default">
            <HypersparkWordmark className="h-6 w-auto" />
          </div>
          <p className="text-[9px] text-slate-500 uppercase tracking-[0.2em] font-bold px-1">AI MONITOR</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pb-2">
          {role === 'admin' ? 'Admin Panel' : 'Operator View'}
        </p>
        {menuItems.map(({ name, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
            style={({ isActive }) => (isActive ? { backgroundColor: '#005baa' } : {})}
          >
            <Icon size={17} />
            {name}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-slate-800 pt-4 shrink-0">
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-left"
          title="My Profile"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userName ? userName.split(' ').map(name => name[0]).slice(0, 2).join('') : role[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName || 'User'}</p>
            <p className="text-xs text-slate-400 capitalize">{role}</p>
          </div>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
