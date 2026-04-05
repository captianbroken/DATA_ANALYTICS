import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, Video, Server, Users, AlertTriangle,
  ShieldAlert, UserCog, Settings, LogOut, ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';
import { HypersparkWordmark } from '../brand/HypersparkBrand';
import { supabase } from '../../lib/supabase';
import { getRoleLabel, isClientAdminRole, isSuperAdminRole, type AppRole } from '../../lib/roles';

interface SidebarProps {
  role: AppRole;
  userName?: string;
}

const superAdminMenu = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Sites', icon: MapPin, path: '/sites' },
  { name: 'Cameras', icon: Video, path: '/cameras' },
  { name: 'Edge Servers', icon: Server, path: '/edge-servers' },
  { name: 'Clients', icon: UserCog, path: '/users' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

const adminMenu = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Sites', icon: MapPin, path: '/sites' },
  { name: 'Cameras', icon: Video, path: '/cameras' },
  { name: 'Edge Servers', icon: Server, path: '/edge-servers' },
  { name: 'Employees', icon: Users, path: '/employees' },
  { name: 'Events', icon: AlertTriangle, path: '/events' },
  { name: 'Violations', icon: ShieldAlert, path: '/violations' },
  { name: 'Clients', icon: UserCog, path: '/users' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

const userMenu = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Sites', icon: MapPin, path: '/sites' },
  { name: 'Cameras', icon: Video, path: '/cameras' },
  { name: 'Edge Servers', icon: Server, path: '/edge-servers' },
  { name: 'Employees', icon: Users, path: '/employees' },
  { name: 'Events', icon: AlertTriangle, path: '/events' },
  { name: 'Violations', icon: ShieldAlert, path: '/violations' },
];

const Sidebar = ({ role, userName }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const menuItems = isSuperAdminRole(role) ? superAdminMenu : isClientAdminRole(role) ? adminMenu : userMenu;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('hyperspark_user');
    localStorage.removeItem('hyperspark_fallback_auth');
    localStorage.removeItem('hyperspark_session');
    sessionStorage.removeItem('hyperspark_session');
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`glass-panel relative hidden md:flex flex-col h-screen shrink-0 border-r border-white/8 transition-all duration-300 ${collapsed ? 'w-[88px]' : 'w-[280px]'}`}>
      <button
        type="button"
        onClick={() => setCollapsed(value => !value)}
        className="absolute -right-3 top-8 h-7 w-7 rounded-full bg-slate-900 text-slate-300 border border-slate-700 flex items-center justify-center hover:border-sky-400 hover:text-white transition-colors shadow-lg"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft size={14} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </button>

      <div className={`min-h-[96px] flex items-center border-b border-white/8 shrink-0 ${collapsed ? 'justify-center px-3' : 'justify-between px-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className={`brand-logo-frame brand-outline flex items-center justify-center rounded-xl ${collapsed ? 'h-10 w-10 p-2' : 'h-10 px-2.5 py-1.5'}`}>
            <HypersparkWordmark className={collapsed ? 'h-4.5 w-auto max-w-[26px] object-contain' : 'h-5.5 w-auto max-w-[92px] object-contain'} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[10px] text-sky-300 uppercase tracking-[0.3em] font-bold">AI MONITOR</p>
              <p className="text-xs text-slate-400">Operational control center</p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-5 px-3 space-y-1">
        {!collapsed && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.28em] px-3 pb-2">
            {role === 'super_admin' ? 'Platform Control' : role === 'admin' ? 'Client Workspace' : 'Operations Workspace'}
          </p>
        )}
        {menuItems.map(({ name, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `sidebar-link flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-3 rounded-2xl text-sm font-medium ${
                isActive
                  ? 'nav-active-glow text-white bg-sky-500/14'
                  : 'text-slate-400 hover:text-white hover:bg-white/6'
              }`
            }
            title={collapsed ? name : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{name}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-white/8 pt-4 shrink-0">
        <button
          onClick={() => navigate('/profile')}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} p-3 rounded-2xl glass-subtle hover:bg-white/8 transition-colors mb-2 text-left`}
          title="My Profile"
        >
          <div className="w-10 h-10 rounded-2xl brand-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userName ? userName.split(' ').map(name => name[0]).slice(0, 2).join('') : role[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName || 'User'}</p>
              <p className="text-xs text-slate-400">{getRoleLabel(role)}</p>
            </div>
          )}
        </button>
        <button
          onClick={() => { void handleLogout(); }}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-3 py-2.5 rounded-2xl text-sm text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors`}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
