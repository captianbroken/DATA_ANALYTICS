import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, PauseCircle, PlayCircle, Shield, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAccessLevelLabel, getRoleLabel, isSuperAdminRole } from '../lib/roles';
import { useAuth } from '../hooks/useAuth';
import { canInspectUserForActor, scopeSitesForActor, scopeUsersForActor } from '../lib/tenantScope';
import type { SiteServiceRecord } from '../lib/siteServices';
interface AIServiceRecord {
  id: number;
  service_code: string;
  display_name: string;
  description: string;
}

interface UserRecord {
  id: number;
  auth_user_id: string | null;
  name: string;
  email: string;
  status: string;
  is_deleted?: boolean;
  last_login: string | null;
  role_id: number | null;
  site_id: number | null;
  access_level?: 'full_access' | 'read_only';
  role_name?: 'super_admin' | 'admin' | 'user';
  site_name?: string | null;
  created_at?: string | null;
}

interface SummaryRecord {
  sites: number;
  users: number;
  cameras: number;
  cameras_online: number;
  cameras_offline: number;
  edge_servers: number;
  edge_servers_online: number;
  edge_servers_offline: number;
  employees: number;
  total_events: number;
  frs_detections?: number;
  unknown_faces?: number;
  ppe_detections: number;
  ppe_violations: number;
}

interface EventRecord {
  id: number;
  event_time: string;
  event_type: string;
  confidence_score?: number | null;
  camera_name?: string | null;
  employee_name?: string | null;
}

interface ViolationRecord {
  id: number;
  violation_time: string;
  violation_type: string;
  status: string;
  camera_name?: string | null;
  employee_name?: string | null;
}

const getRoleName = (user: UserRecord) => user.role_name ?? 'user';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const getSiteName = (user: UserRecord | null) => {
  if (!user) return 'Unassigned';
  if (getRoleName(user) === 'super_admin') return 'Global access';
  return user.site_name ?? 'Unassigned';
};

const serviceStatusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  inactive: 'bg-slate-100 text-slate-600',
};

const UserOverview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<SummaryRecord | null>(null);
  const [recentEvents, setRecentEvents] = useState<EventRecord[]>([]);
  const [recentViolations, setRecentViolations] = useState<ViolationRecord[]>([]);
  const [aiServices, setAiServices] = useState<AIServiceRecord[]>([]);
  const [siteServices, setSiteServices] = useState<SiteServiceRecord[]>([]);
  const [savingServiceCode, setSavingServiceCode] = useState<string | null>(null);
  const [activityTab, setActivityTab] = useState<'events' | 'violations'>('events');

  const userId = useMemo(() => Number(id), [id]);

  useEffect(() => {
    if (!userId || Number.isNaN(userId)) {
      setError('Invalid client id.');
      setLoading(false);
      return;
    }

    let mounted = true;
    const loadClient = async () => {
      setLoading(true);
      setError('');

      const [{ data: usersData, error: userError }, { data: sitesData }] = await Promise.all([
        supabase.rpc('list_dashboard_users'),
        supabase.rpc('list_dashboard_sites'),
      ]);

      if (!mounted) return;

      if (userError) {
        setError(userError.message || 'Failed to load client.');
        setLoading(false);
        return;
      }

      const dashboardUsers = scopeUsersForActor((usersData as UserRecord[] | null) ?? [], appUser);
      const siteNameById = new Map<number, string>(
        scopeSitesForActor(((sitesData as { id: number; site_name: string }[] | null) ?? []), appUser).map(site => [site.id, site.site_name] as const),
      );
      const baseUser = dashboardUsers.find(item => item.id === userId);

      if (!baseUser || !canInspectUserForActor(baseUser, appUser)) {
        setError('Client not found.');
        setLoading(false);
        return;
      }

      const typedUser: UserRecord = {
        ...baseUser,
        role_name: baseUser.role_name ?? 'user',
        site_name: baseUser.site_id ? (siteNameById.get(baseUser.site_id) ?? null) : null,
      };

      const scopedSiteId = typedUser.site_id;
      const start = new Date();
      start.setDate(start.getDate() - 30);

      const [summaryResult, eventsResult, violationsResult, servicesResult, aiServicesResult] = await Promise.all([
        scopedSiteId
          ? supabase.rpc('get_dashboard_summary', {
              p_site_id: scopedSiteId,
              p_start: start.toISOString(),
              p_end: new Date().toISOString(),
            })
          : Promise.resolve({ data: null, error: null }),
        scopedSiteId
          ? supabase.rpc('list_dashboard_events', {
              p_site_id: scopedSiteId,
              p_start: start.toISOString(),
              p_end: new Date().toISOString(),
            })
          : Promise.resolve({ data: [], error: null }),
        scopedSiteId
          ? supabase.rpc('list_dashboard_violations', {
              p_site_id: scopedSiteId,
              p_start: start.toISOString(),
              p_end: new Date().toISOString(),
            })
          : Promise.resolve({ data: [], error: null }),
        scopedSiteId ? supabase.rpc('list_site_services', { p_site_id: scopedSiteId }) : Promise.resolve({ data: [], error: null }),
        supabase.rpc('list_ai_services'),
      ]);

      if (!mounted) return;

      setUser(typedUser);
      setSummary((Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data) as SummaryRecord | null);
      setRecentEvents((((eventsResult.data as unknown) as EventRecord[]) ?? []).slice(0, 25));
      setRecentViolations((((violationsResult.data as unknown) as ViolationRecord[]) ?? []).slice(0, 25));
      setAiServices(((aiServicesResult.data as unknown) as AIServiceRecord[]) ?? []);
      setSiteServices(((servicesResult.data as unknown) as SiteServiceRecord[]) ?? []);
      setLoading(false);
    };

    void loadClient();
    return () => {
      mounted = false;
    };
  }, [appUser, userId]);

  const roleName = user ? getRoleName(user) : 'user';
  const isActive = user?.status === 'active';
  const canManageServices = isSuperAdminRole(appUser?.role) && Boolean(user?.site_id);

  const updateServiceStatus = async (serviceCode: string, status: 'active' | 'suspended' | 'inactive') => {
    if (!user?.site_id) return;

    setSavingServiceCode(serviceCode);
    setError('');

    const existing = siteServices.find(service => service.service_code === serviceCode);
    const { error: updateError } = await supabase.rpc('upsert_site_service', {
      p_site_id: user.site_id,
      p_service_code: serviceCode,
      p_status: status,
      p_notes: existing?.notes ?? null,
    });

    if (updateError) {
      setError(updateError.message || 'Failed to update client services.');
      setSavingServiceCode(null);
      return;
    }

    const { data: refreshed } = await supabase.rpc('list_site_services', { p_site_id: user.site_id });
    setSiteServices(((refreshed as unknown) as SiteServiceRecord[]) ?? []);
    setSavingServiceCode(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400 animate-pulse">
        Loading client overview...
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
          {error || 'Client not found.'}
        </div>
      </div>
    );
  }

  const currentSummary = summary ?? {
    sites: 0,
    users: 0,
    cameras: 0,
    cameras_online: 0,
    cameras_offline: 0,
    edge_servers: 0,
    edge_servers_online: 0,
    edge_servers_offline: 0,
    employees: 0,
    total_events: 0,
    ppe_detections: 0,
    ppe_violations: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-slate-500 text-sm">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 hover:text-slate-700">
          <ArrowLeft size={14} /> Back
        </button>
        <span>/</span>
        <Link to="/users" className="hover:text-slate-700">Clients</Link>
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
              {getRoleLabel(roleName)}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {isActive ? <UserCheck size={10} /> : <UserX size={10} />}
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to={`/users?focus=${user.id}`} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Manage Client
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Assigned Site</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{getSiteName(user)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Access Level</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{getRoleName(user) === 'user' ? getAccessLevelLabel(user.access_level) : 'Full Access'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Last Login</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{formatDate(user.last_login)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Client Record Created</p>
          <p className="text-sm font-medium text-slate-800 mt-2">{formatDate(user.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Assigned Cameras</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{currentSummary.cameras}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Assigned Edge Servers</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{currentSummary.edge_servers}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Assigned Employees</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{currentSummary.employees}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-500">Recent Events (30d)</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{currentSummary.total_events}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-bold text-slate-800">Client Services</h3>
            <p className="text-xs text-slate-500 mt-1">Assign and suspend model services per client/site</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aiServices.map(serviceMeta => {
            const service = siteServices.find(item => item.service_code === serviceMeta.service_code);
            const status = service?.status ?? 'inactive';
            return (
              <div key={serviceMeta.service_code} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{serviceMeta.display_name}</p>
                    <p className="text-xs text-slate-500 mt-1">{serviceMeta.description}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${serviceStatusStyles[status] ?? serviceStatusStyles.inactive}`}>
                    {status}
                  </span>
                </div>
                {canManageServices && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => void updateServiceStatus(serviceMeta.service_code, 'active')}
                      disabled={savingServiceCode === serviceMeta.service_code}
                      className="px-3 py-2 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50"
                    >
                      <PlayCircle size={12} className="inline mr-1" />
                      Activate
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateServiceStatus(serviceMeta.service_code, 'suspended')}
                      disabled={savingServiceCode === serviceMeta.service_code}
                      className="px-3 py-2 text-xs rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <PauseCircle size={12} className="inline mr-1" />
                      Suspend
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateServiceStatus(serviceMeta.service_code, 'inactive')}
                      disabled={savingServiceCode === serviceMeta.service_code}
                      className="px-3 py-2 text-xs rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-50"
                    >
                      Stop
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" /> Client Activity
            </h3>
            <p className="text-xs text-slate-500 mt-1">Stay inside this client page while reviewing activity</p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-medium">
            {(['events', 'violations'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActivityTab(tab)}
                className={`px-4 py-2 ${activityTab === tab ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                style={activityTab === tab ? { backgroundColor: '#005baa' } : {}}
              >
                {tab === 'events' ? `Events (${recentEvents.length})` : `Violations (${recentViolations.length})`}
              </button>
            ))}
          </div>
        </div>

        {activityTab === 'events' ? (
          recentEvents.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No recent events found for this client/site.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Camera</th>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Event Type</th>
                  <th className="px-4 py-3 font-medium text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map(event => (
                  <tr key={event.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{new Date(event.event_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{event.camera_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{event.employee_name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{event.event_type}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {event.confidence_score != null ? `${Math.round(Number(event.confidence_score))}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          recentViolations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No recent violations found for this client/site.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Camera</th>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Violation</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentViolations.map(violation => (
                  <tr key={violation.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{new Date(violation.violation_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{violation.camera_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{violation.employee_name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{violation.violation_type}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{violation.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};

export default UserOverview;
