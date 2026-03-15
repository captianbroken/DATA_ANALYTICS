import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Shield, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserRecord {
  id: number;
  auth_user_id: string | null;
  name: string;
  email: string;
  status: string;
  last_login: string | null;
  role_id: number | null;
  roles?: { role_name: 'admin' | 'user' } | { role_name: 'admin' | 'user' }[];
  created_at?: string | null;
}

interface EventRecord {
  id: number;
  event_time: string;
  event_type: string;
}

const getRoleName = (user: UserRecord) => {
  if (Array.isArray(user.roles)) return user.roles[0]?.role_name ?? 'user';
  return user.roles?.role_name ?? 'user';
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const UserOverview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventCount, setEventCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<EventRecord[]>([]);

  const userId = useMemo(() => Number(id), [id]);

  useEffect(() => {
    if (!userId || Number.isNaN(userId)) {
      setError('Invalid user id.');
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchUser = async () => {
      setLoading(true);
      setError('');

      const [{ data: userData, error: userError }, { count: eventsCount }, { data: eventsData }] = await Promise.all([
        supabase
          .from('users')
          .select('id, auth_user_id, name, email, status, last_login, role_id, roles(role_name), created_at')
          .eq('id', userId)
          .single(),
        supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', userId),
        supabase
          .from('events')
          .select('id, event_time, event_type')
          .eq('created_by', userId)
          .order('event_time', { ascending: false })
          .limit(6),
      ]);

      if (!mounted) return;

      if (userError) {
        setError(userError.message || 'Failed to load user.');
        setLoading(false);
        return;
      }

      setUser(userData as UserRecord);
      setEventCount(eventsCount ?? 0);
      setRecentEvents((eventsData as EventRecord[]) ?? []);
      setLoading(false);
    };

    fetchUser();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const roleName = user ? getRoleName(user) : 'user';
  const isActive = user?.status === 'active';

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400 animate-pulse">
        Loading user overview...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-2">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center text-red-500">
          {error || 'User not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-slate-500 text-sm">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 hover:text-slate-700">
          <ArrowLeft size={14} /> Back
        </button>
        <span>/</span>
        <Link to="/users" className="hover:text-slate-700">Users</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{user.name}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col lg:flex-row gap-6 lg:items-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
          {user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">{user.name}</h1>
          <p className="text-slate-500 text-sm mt-1">{user.email}</p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${roleName === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {roleName === 'admin' ? <ShieldCheck size={10} /> : <Shield size={10} />}
              {roleName}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {isActive ? <UserCheck size={10} /> : <UserX size={10} />}
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to={`/users?focus=${user.id}`} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Manage User
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Last Login</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{formatDate(user.last_login)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Account Created</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{formatDate(user.created_at)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Events Created</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{eventCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Activity size={16} className="text-blue-500" /> Recent Events Created
          </h3>
          <Link to="/events" className="text-xs text-blue-600">View all events</Link>
        </div>
        {recentEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No events created by this user yet.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Event Type</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map(event => (
                <tr key={event.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{new Date(event.event_time).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{event.event_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default UserOverview;
