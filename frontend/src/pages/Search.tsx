import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Activity, Camera, MapPin, Server, ShieldAlert, Users } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface SiteResult {
  id: number;
  site_name: string;
  address: string | null;
  status: string | null;
}

interface CameraResult {
  id: number;
  camera_name: string;
  location: string | null;
  status: string | null;
  sites?: { site_name: string } | { site_name: string }[];
}

interface EdgeServerResult {
  id: number;
  server_name: string;
  ip_address: string | null;
  status: string | null;
  sites?: { site_name: string } | { site_name: string }[];
}

interface EmployeeResult {
  id: number;
  name: string;
  employee_code: string | null;
  department: string | null;
  sites?: { site_name: string } | { site_name: string }[];
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  status: string | null;
  roles?: { role_name: 'super_admin' | 'admin' | 'user' } | { role_name: 'super_admin' | 'admin' | 'user' }[];
}

interface EventResult {
  id: number;
  event_time: string;
  event_type: string | null;
  cameras?: { camera_name: string; sites?: { site_name: string } | { site_name: string }[] } | { camera_name: string; sites?: { site_name: string } | { site_name: string }[] }[];
  employees?: { name: string } | { name: string }[];
}

interface ViolationResult {
  id: number;
  timestamp: string;
  violation_type: string;
  status: string;
  cameras?: { camera_name: string; sites?: { site_name: string } | { site_name: string }[] } | { camera_name: string; sites?: { site_name: string } | { site_name: string }[] }[];
  employees?: { name: string } | { name: string }[];
}

const emptyResults = {
  sites: [] as SiteResult[],
  cameras: [] as CameraResult[],
  edgeServers: [] as EdgeServerResult[],
  employees: [] as EmployeeResult[],
  users: [] as UserResult[],
  events: [] as EventResult[],
  violations: [] as ViolationResult[],
};

const getSiteName = (relation: { site_name: string } | { site_name: string }[] | undefined) =>
  Array.isArray(relation) ? (relation[0]?.site_name ?? '-') : (relation?.site_name ?? '-');

const getCameraName = (relation: EventResult['cameras'] | ViolationResult['cameras']) =>
  Array.isArray(relation) ? (relation[0]?.camera_name ?? '-') : (relation?.camera_name ?? '-');

const getEmployeeName = (relation: EventResult['employees'] | ViolationResult['employees']) =>
  Array.isArray(relation) ? (relation[0]?.name ?? 'Unknown') : (relation?.name ?? 'Unknown');

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => (searchParams.get('q') ?? '').trim(), [searchParams]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(emptyResults);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!query) {
      setResults(emptyResults);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      const like = `%${query}%`;

      try {
        const [
          { data: sites },
          { data: cameras },
          { data: edgeServers },
          { data: employees },
          { data: users },
          { data: events },
          { data: violations },
        ] = await Promise.all([
          supabase
            .from('sites')
            .select('id, site_name, address, status')
            .or(`site_name.ilike.${like},address.ilike.${like}`)
            .order('site_name')
            .limit(6),
          supabase
            .from('cameras')
            .select('id, camera_name, location, status, sites(site_name)')
            .eq('is_deleted', false)
            .or(`camera_name.ilike.${like},location.ilike.${like},rtsp_url.ilike.${like}`)
            .order('camera_name')
            .limit(6),
          supabase
            .from('edge_servers')
            .select('id, server_name, ip_address, status, sites(site_name)')
            .eq('is_deleted', false)
            .or(`server_name.ilike.${like},ip_address.ilike.${like}`)
            .order('server_name')
            .limit(6),
          supabase
            .from('employees')
            .select('id, name, employee_code, department, sites(site_name)')
            .eq('is_deleted', false)
            .or(`name.ilike.${like},employee_code.ilike.${like},department.ilike.${like}`)
            .order('name')
            .limit(6),
          supabase
            .from('users')
            .select('id, name, email, status, roles(role_name)')
            .eq('is_deleted', false)
            .or(`name.ilike.${like},email.ilike.${like}`)
            .order('name')
            .limit(6),
          supabase
            .from('events')
            .select('id, event_time, event_type, cameras(camera_name, sites(site_name)), employees(name)')
            .gte('event_time', new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString())
            .order('event_time', { ascending: false })
            .limit(20),
          supabase
            .from('violations')
            .select('id, timestamp, violation_type, status, cameras(camera_name, sites(site_name)), employees(name)')
            .gte('timestamp', new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString())
            .order('timestamp', { ascending: false })
            .limit(20),
        ]);

        if (cancelled) return;

        const lower = query.toLowerCase();
        const filteredEvents =
          (events as EventResult[] | null)?.filter(event => {
            const site = getSiteName(Array.isArray(event.cameras) ? event.cameras[0]?.sites : event.cameras?.sites);
            const camera = getCameraName(event.cameras);
            const employee = getEmployeeName(event.employees);
            const eventType = event.event_type ?? '';
            return [site, camera, employee, eventType].some(value => value.toLowerCase().includes(lower));
          }) ?? [];

        const filteredViolations =
          (violations as ViolationResult[] | null)?.filter(violation => {
            const site = getSiteName(Array.isArray(violation.cameras) ? violation.cameras[0]?.sites : violation.cameras?.sites);
            const camera = getCameraName(violation.cameras);
            const employee = getEmployeeName(violation.employees);
            const violationType = violation.violation_type ?? '';
            return [site, camera, employee, violationType].some(value => value.toLowerCase().includes(lower));
          }) ?? [];

        setResults({
          sites: (sites as SiteResult[]) ?? [],
          cameras: (cameras as CameraResult[]) ?? [],
          edgeServers: (edgeServers as EdgeServerResult[]) ?? [],
          employees: (employees as EmployeeResult[]) ?? [],
          users: (users as UserResult[]) ?? [],
          events: filteredEvents.slice(0, 6),
          violations: filteredViolations.slice(0, 6),
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Search failed. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Server size={28} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Database Not Connected</h2>
        <p className="text-slate-500 text-sm text-center max-w-md">
          Configure your Supabase environment variables to enable global search.
        </p>
      </div>
    );
  }

  const totalResults = Object.values(results).reduce((sum, list) => sum + list.length, 0);
  const sections: Array<{
    key: string;
    title: string;
    icon: typeof MapPin;
    viewAll: string;
    items: ReactNode[];
  }> = [
    {
      key: 'sites',
      title: 'Sites',
      icon: MapPin,
      viewAll: `/sites?q=${encodeURIComponent(query)}`,
      items: results.sites.map(site => (
        <li key={site.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{site.site_name}</p>
          <p className="text-xs text-slate-400">{site.address || '-'}</p>
        </li>
      )),
    },
    {
      key: 'cameras',
      title: 'Cameras',
      icon: Camera,
      viewAll: `/cameras?q=${encodeURIComponent(query)}`,
      items: results.cameras.map(camera => (
        <li key={camera.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{camera.camera_name}</p>
          <p className="text-xs text-slate-400">{getSiteName(camera.sites)}</p>
        </li>
      )),
    },
    {
      key: 'edgeServers',
      title: 'Edge Servers',
      icon: Server,
      viewAll: `/edge-servers?q=${encodeURIComponent(query)}`,
      items: results.edgeServers.map(server => (
        <li key={server.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{server.server_name}</p>
          <p className="text-xs text-slate-400">{server.ip_address || '-'}</p>
        </li>
      )),
    },
    {
      key: 'employees',
      title: 'Employees',
      icon: Users,
      viewAll: `/employees?q=${encodeURIComponent(query)}`,
      items: results.employees.map(employee => (
        <li key={employee.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{employee.name}</p>
          <p className="text-xs text-slate-400">
            {employee.employee_code || '-'} - {employee.department || '-'}
          </p>
        </li>
      )),
    },
    {
      key: 'users',
      title: 'Clients',
      icon: Users,
      viewAll: `/users?q=${encodeURIComponent(query)}`,
      items: results.users.map(user => (
        <li key={user.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{user.name}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </li>
      )),
    },
    {
      key: 'events',
      title: 'Events',
      icon: Activity,
      viewAll: `/events?q=${encodeURIComponent(query)}`,
      items: results.events.map(event => (
        <li key={event.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{event.event_type || 'Event'}</p>
          <p className="text-xs text-slate-400">
            {getCameraName(event.cameras)} - {getEmployeeName(event.employees)}
          </p>
        </li>
      )),
    },
    {
      key: 'violations',
      title: 'Violations',
      icon: ShieldAlert,
      viewAll: `/violations?q=${encodeURIComponent(query)}`,
      items: results.violations.map(violation => (
        <li key={violation.id} className="py-2">
          <p className="text-sm font-medium text-slate-700">{violation.violation_type}</p>
          <p className="text-xs text-slate-400">
            {getCameraName(violation.cameras)} - {getEmployeeName(violation.employees)}
          </p>
        </li>
      )),
    },
  ].filter(section => section.items.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Global Search</h1>
        <p className="text-slate-500 text-sm mt-1">
          {query ? `Results for "${query}" (${totalResults})` : 'Type in the top search bar to find clients, sites, cameras, and events.'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400 animate-pulse">
          Searching your database...
        </div>
      ) : !query ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">
          Start typing to see results.
        </div>
      ) : totalResults === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">
          No matches found.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sections.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.key} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-blue-500" />
                    <h3 className="font-semibold text-slate-800">{section.title}</h3>
                  </div>
                  <Link to={section.viewAll} className="text-xs text-blue-600 font-medium">
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-slate-100">
                  {section.items}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
