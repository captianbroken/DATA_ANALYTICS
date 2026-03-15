import { useEffect, useRef, useState } from 'react';
import { Bell, Search, LogOut, UserCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface HeaderProps {
  userName?: string;
  role?: string;
}

const Header = ({ userName, role }: HeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const debounceRef = useRef<number | null>(null);
  const sourceRef = useRef<'header' | 'url'>('url');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    sourceRef.current = 'url';
    setQuery(params.get('q') ?? '');
  }, [location.search]);

  const isAdmin = role === 'admin';

  const applySearch = (value: string) => {
    const trimmed = value.trim();
    const currentUrl = location.search ? `${location.pathname}${location.search}` : location.pathname;

    if (!isAdmin) {
      const params = new URLSearchParams(location.search);
      if (trimmed) {
        params.set('q', trimmed);
      } else {
        params.delete('q');
      }
      const next = params.toString();
      const nextUrl = next ? `${location.pathname}?${next}` : location.pathname;
      if (nextUrl === currentUrl) return;
      navigate(nextUrl);
      return;
    }

    if (trimmed) {
      const nextUrl = `/search?q=${encodeURIComponent(trimmed)}`;
      if (nextUrl === currentUrl) return;
      navigate(nextUrl);
      return;
    }

    if (location.pathname === '/search') {
      navigate('/');
      return;
    }

    const params = new URLSearchParams(location.search);
    params.delete('q');
    const next = params.toString();
    const nextUrl = next ? `${location.pathname}?${next}` : location.pathname;
    if (nextUrl === currentUrl) return;
    navigate(nextUrl);
  };
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      if (sourceRef.current === 'header') {
        applySearch(query);
      }
    }, 350);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, location.pathname, location.search]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('hyperspark_user');
    localStorage.removeItem('hyperspark_fallback_auth');
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={event => {
              sourceRef.current = 'header';
              setQuery(event.target.value);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                applySearch(query);
              }
            }}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
            placeholder="Search events, sites, cameras..."
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={19} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full" />
        </button>

        {/* User pill */}
        <button
          onClick={() => {
            if (location.pathname === '/profile') {
              if (window.history.length > 2) {
                navigate(-1);
              } else {
                navigate('/');
              }
              return;
            }
            navigate('/profile');
          }}
          className="flex items-center gap-2 pl-3 border-l border-slate-200 hover:bg-slate-50 rounded-lg pr-2 py-1.5 transition-colors"
          title="My Profile"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userName ? userName.split(' ').map(n => n[0]).slice(0,2).join('') : <UserCircle size={18} />}
          </div>
          <div className="hidden sm:block min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-800 leading-tight truncate max-w-[120px]">{userName || 'User'}</p>
            <p className="text-xs text-slate-400 capitalize leading-tight">{role || 'user'}</p>
          </div>
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Sign out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
};

export default Header;
