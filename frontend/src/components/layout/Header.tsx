import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Search, LogOut, UserCircle, AlertTriangle, Activity } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface HeaderProps {
  userName?: string;
  role?: string;
}

interface NotificationItem {
  id: string;
  type: 'event' | 'violation';
  title: string;
  meta: string;
  href: string;
  severity: 'info' | 'warning' | 'danger';
  occurredAt: string;
}

const getRoleLabel = (role?: string) => {
  if (role === 'admin') return 'Admin';
  if (role === 'user') return 'Account';
  return role || 'Account';
};

const Header = ({ userName, role }: HeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { appUser } = useAuth();
  const [query, setQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const sourceRef = useRef<'header' | 'url'>('url');
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextQuery = params.get('q') ?? '';

    // When the header itself updates the URL, keep the in-progress input value
    // if it only differs by surrounding spaces. This prevents the debounce
    // sync from removing the space between words while the user is still typing.
    if (sourceRef.current === 'header' && query.trim() === nextQuery) {
      return;
    }

    sourceRef.current = 'url';
    setQuery(nextQuery);
  }, [location.search, query]);

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

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      if (role !== 'admin' && !appUser?.site_id) {
        setNotifications([]);
        return;
      }

      setNotificationsLoading(true);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);

      try {
        const params = {
          p_site_id: role === 'admin' ? null : appUser?.site_id ?? null,
          p_start: start.toISOString(),
          p_end: end.toISOString(),
        };

        const [{ data: eventsRaw, error: eventsError }, { data: violationsRaw, error: violationsError }] = await Promise.all([
          supabase.rpc('list_dashboard_events', params),
          supabase.rpc('list_dashboard_violations', params),
        ]);

        if (eventsError) throw eventsError;
        if (violationsError) throw violationsError;

        const eventItems = ((eventsRaw ?? []) as any[]).slice(0, 4).map(event => ({
          id: `event-${event.id}`,
          type: 'event' as const,
          title: event.event_type || 'Event detected',
          meta: [event.site_name, event.camera_name, event.employee_name].filter(Boolean).join(' - ') || 'Live event',
          href: '/events',
          severity: 'info' as const,
          occurredAt: event.event_time,
        }));

        const violationItems = ((violationsRaw ?? []) as any[]).slice(0, 4).map(violation => ({
          id: `violation-${violation.id}`,
          type: 'violation' as const,
          title: violation.violation_type || 'Violation detected',
          meta: [violation.site_name, violation.camera_name, violation.employee_name].filter(Boolean).join(' - ') || 'Open violation',
          href: '/violations',
          severity: violation.status === 'resolved' ? 'info' as const : 'danger' as const,
          occurredAt: violation.violation_time,
        }));

        const nextItems = [...violationItems, ...eventItems]
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
          .slice(0, 6);

        setNotifications(nextItems);
      } catch (error) {
        console.error('Failed to load notifications:', error);
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    void fetchNotifications();
    const intervalId = window.setInterval(() => {
      void fetchNotifications();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [appUser?.site_id, role]);

  const unreadCount = useMemo(
    () => notifications.filter(item => item.type === 'violation' || item.severity === 'danger').length,
    [notifications],
  );

  const formatRelative = (value: string) => {
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('hyperspark_user');
    localStorage.removeItem('hyperspark_fallback_auth');
    localStorage.removeItem('hyperspark_session');
    sessionStorage.removeItem('hyperspark_session');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 shrink-0 px-4 pt-4 md:px-6">
      <div className="glass-panel rounded-[1.4rem] px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="hidden lg:flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 border border-white/8">
              <span className="accent-dot" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300 font-semibold">Live System</p>
                <p className="text-xs text-slate-400">Dashboard control</p>
              </div>
            </div>
            <div className="relative hidden md:block w-64 xl:w-80">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
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
                className="w-full pl-9 pr-3 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 transition-all"
                placeholder="Search events, sites, cameras..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-emerald-500/10 text-emerald-300 px-3 py-2 border border-emerald-400/12">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.7)]" />
              <span className="text-xs font-medium">Synced</span>
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(value => !value)}
                className="relative p-2.5 text-slate-300 hover:text-white hover:bg-white/6 rounded-xl transition-colors"
                title="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full border-2 border-slate-950 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="notification-popover absolute right-0 top-[calc(100%+0.75rem)] w-[22rem] rounded-2xl overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Notifications</p>
                      <p className="text-xs text-slate-400">Recent events and violations</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate(unreadCount > 0 ? '/violations' : '/events');
                      }}
                      className="text-xs text-sky-300 hover:text-sky-200"
                    >
                      View all
                    </button>
                  </div>

                  <div className="max-h-[22rem] overflow-y-auto scrollbar-thin">
                    {notificationsLoading ? (
                      <div className="px-4 py-8 text-sm text-slate-400 text-center">Loading notifications...</div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-slate-400 text-center">No recent alerts.</div>
                    ) : (
                      notifications.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate(item.href);
                          }}
                          className="w-full text-left px-4 py-3 border-b border-white/6 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center ${item.type === 'violation' ? 'bg-red-500/12 text-red-300' : 'bg-sky-500/12 text-sky-300'}`}>
                              {item.type === 'violation' ? <AlertTriangle size={16} /> : <Activity size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-medium text-white leading-5">{item.title}</p>
                                <span className="text-[11px] text-slate-500 whitespace-nowrap">{formatRelative(item.occurredAt)}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 leading-5">{item.meta}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

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
              className="flex items-center gap-2 rounded-2xl bg-white/5 text-slate-200 pl-2 pr-3 py-1.5 border border-white/8 hover:bg-white/8 transition-colors"
              title="My Profile"
            >
              <div className="w-9 h-9 rounded-2xl brand-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {userName ? userName.split(' ').map(n => n[0]).slice(0, 2).join('') : <UserCircle size={18} />}
              </div>
              <div className="hidden sm:block min-w-0 text-left">
                <p className="text-sm font-semibold text-white leading-tight truncate max-w-[140px]">{userName || 'User'}</p>
                <p className="text-xs text-slate-400 leading-tight">{getRoleLabel(role)}</p>
              </div>
            </button>

            <button
              onClick={() => { void handleLogout(); }}
              className="p-2.5 text-slate-300 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        <div className="mt-3 md:hidden">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
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
              className="w-full pl-9 pr-3 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 transition-all"
              placeholder="Search events, sites, cameras..."
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
