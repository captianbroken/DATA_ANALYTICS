import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Download, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { selectUsersWithOptionalSite } from '../lib/userQueries';

interface ViolationRecord {
  id: number;
  timestamp: string;
  violation_type: string;
  status: string;
  image_path: string | null;
  cameras?: { site_id?: number | null; camera_name: string; sites?: { site_name: string } | { site_name: string }[] } | { site_id?: number | null; camera_name: string; sites?: { site_name: string } | { site_name: string }[] }[];
  employees?: { name: string } | { name: string }[];
}

interface SiteRecord {
  id: number;
  site_name: string;
}

interface UserScope {
  id: number;
  name: string;
  site_id?: number | null;
}

const downloadCsv = (filename: string, rows: Record<string, string | number | boolean | null>[]) => {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers
        .map(header => {
          const value = row[header];
          const normalized = value == null ? '' : String(value);
          return `"${normalized.replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const deriveSeverity = (violationType: string) => {
  const normalized = violationType.toLowerCase();
  if (normalized.includes('unauthorized') || normalized.includes('intrusion')) return 'Critical';
  if (normalized.includes('helmet') || normalized.includes('vest') || normalized.includes('entry')) return 'High';
  return 'Medium';
};

const severityColor = (severity: string) => {
  if (severity === 'Critical') return 'bg-red-100 text-red-700 border border-red-200';
  if (severity === 'High') return 'bg-orange-100 text-orange-700 border border-orange-200';
  return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
};

const ViolationsPage = () => {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin';
  const assignedSiteId = appUser?.site_id ?? null;
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const initialFilter = useMemo(() => {
    const value = (searchParams.get('status') || '').toLowerCase();
    if (value === 'open') return 'Open';
    if (value === 'resolved') return 'Resolved';
    return 'All';
  }, [searchParams]);
  const [filter, setFilter] = useState<'All' | 'Open' | 'Resolved'>(initialFilter);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [users, setUsers] = useState<UserScope[]>([]);
  const selectedSiteId = searchParams.get('site') ?? '';
  const selectedUserId = searchParams.get('user') ?? '';

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!isAdmin && !assignedSiteId) {
      setViolations([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('violations')
      .select('id, timestamp, violation_type, status, image_path, cameras!inner(site_id, camera_name, sites(site_name)), employees(name)')
      .order('timestamp', { ascending: false });

    if (!isAdmin && assignedSiteId) {
      query = query.eq('cameras.site_id', assignedSiteId);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setViolations(((data as unknown) as ViolationRecord[]) ?? []);
    }

    setLoading(false);
  }, [assignedSiteId, isAdmin]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  useEffect(() => {
    const fetchSites = async () => {
      let query = supabase.from('sites').select('id, site_name').order('site_name');
      if (!isAdmin && assignedSiteId) {
        query = query.eq('id', assignedSiteId);
      }
      const { data } = await query;
      setSites((data as SiteRecord[]) ?? []);
    };

    fetchSites();
  }, [assignedSiteId, isAdmin]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!isAdmin) {
        setUsers([]);
        return;
      }

      const result = await selectUsersWithOptionalSite<UserScope>(
        'id, name, site_id',
        'id, name',
        query => query.eq('is_deleted', false).order('name'),
      );

      setUsers(((result.data as UserScope[] | null) ?? []).filter(user => !!user.site_id));
    };

    fetchUsers();
  }, [isAdmin]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const getCamera = (cameraRelation: ViolationRecord['cameras']) => Array.isArray(cameraRelation) ? cameraRelation[0] : cameraRelation;
  const getEmployee = (employeeRelation: ViolationRecord['employees']) => Array.isArray(employeeRelation) ? employeeRelation[0] : employeeRelation;
  const getSiteName = (cameraRelation: ViolationRecord['cameras']) => {
    const camera = getCamera(cameraRelation);
    const sites = camera?.sites;
    return Array.isArray(sites) ? (sites[0]?.site_name ?? '') : (sites?.site_name ?? '');
  };

  const filtered = violations.filter(violation => {
    const siteName = getSiteName(violation.cameras);
    const selectedSiteName = sites.find(site => String(site.id) === selectedSiteId)?.site_name ?? '';
    const selectedUserSiteId = users.find(user => String(user.id) === selectedUserId)?.site_id;
    const matchSearch =
      (getEmployee(violation.employees)?.name ?? 'Unknown').toLowerCase().includes(search.toLowerCase()) ||
      violation.violation_type.toLowerCase().includes(search.toLowerCase()) ||
      siteName.toLowerCase().includes(search.toLowerCase());
    const isResolved = violation.status === 'resolved';
    const matchFilter = filter === 'All' || (filter === 'Open' && !isResolved) || (filter === 'Resolved' && isResolved);
    const matchSite = !selectedSiteId || siteName === selectedSiteName;
    const matchUserScope = !selectedUserId || (selectedUserSiteId != null && selectedSiteId === String(selectedUserSiteId));
    return matchSearch && matchFilter && matchSite && matchUserScope;
  });

  const openCount = violations.filter(violation => violation.status !== 'resolved').length;
  const resolvedCount = violations.filter(violation => violation.status === 'resolved').length;

  const handleExport = () => {
    downloadCsv(
      'violations.csv',
      filtered.map(violation => ({
        timestamp: violation.timestamp,
        site: getSiteName(violation.cameras),
        camera: getCamera(violation.cameras)?.camera_name ?? '',
        employee: getEmployee(violation.employees)?.name ?? 'Unknown',
        violation_type: violation.violation_type,
        severity: deriveSeverity(violation.violation_type),
        status: violation.status,
        image_path: violation.image_path,
      })),
    );
  };

  const markResolved = async (violationId: number) => {
    setResolvingId(violationId);
    const { error: updateError } = await supabase.from('violations').update({ status: 'resolved' }).eq('id', violationId);
    if (updateError) setError(updateError.message);
    await fetchViolations();
    setResolvingId(null);
  };

  const handleSiteChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('site', value);
    else params.delete('site');
    params.delete('user');
    setSearchParams(params);
  };

  const handleUserChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('user', value);
      const user = users.find(entry => String(entry.id) === value);
      if (user?.site_id) {
        params.set('site', String(user.site_id));
      }
    } else {
      params.delete('user');
    }
    setSearchParams(params);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Violations</h1>
          <p className="text-slate-500 text-sm mt-1">PPE and unauthorized access violations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchViolations} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExport} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm">
            <Download size={15} /> Export Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-slate-800">{violations.length}</p>
          <p className="text-xs text-slate-500 mt-1">Total</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-red-600">{openCount}</p>
          <p className="text-xs text-red-500 mt-1">Open</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">{resolvedCount}</p>
          <p className="text-xs text-green-500 mt-1">Resolved</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={event => {
              const value = event.target.value;
              setSearch(value);
              const params = new URLSearchParams(searchParams);
              if (value.trim()) {
                params.set('q', value.trim());
              } else {
                params.delete('q');
              }
              setSearchParams(params);
            }}
            placeholder="Search violations..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-medium">
          {(['All', 'Open', 'Resolved'] as const).map(option => (
            <button
              key={option}
              onClick={() => {
                setFilter(option);
                const params = new URLSearchParams(searchParams);
                if (option === 'All') {
                  params.delete('status');
                } else {
                  params.set('status', option.toLowerCase());
                }
                setSearchParams(params);
              }}
              className={`px-4 py-2 ${filter === option ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              style={filter === option ? { backgroundColor: '#005baa' } : {}}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Site</span>
          <select value={selectedSiteId} onChange={event => handleSiteChange(event.target.value)} className="text-slate-700 text-sm bg-transparent outline-none">
            <option value="">All</option>
            {sites.map(site => <option key={site.id} value={site.id}>{site.site_name}</option>)}
          </select>
        </div>
        {isAdmin && users.length > 0 && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wide">User</span>
            <select value={selectedUserId} onChange={event => handleUserChange(event.target.value)} className="text-slate-700 text-sm bg-transparent outline-none">
              <option value="">All</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
        )}
        {isAdmin && users.length === 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
            Assign a site to a user in Users before filtering by user.
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No violations found for the current filter.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">Timestamp</th>
                <th className="px-5 py-3 font-medium">Site / Camera</th>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-5 py-3 font-medium">Violation</th>
                <th className="px-5 py-3 font-medium text-center">Severity</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(violation => {
                const resolved = violation.status === 'resolved';
                const severity = deriveSeverity(violation.violation_type);

                return (
                  <tr key={violation.id} className="border-b border-slate-50 hover:bg-red-50/20 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-slate-600">{new Date(violation.timestamp).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800 text-xs">{getSiteName(violation.cameras) || '-'}</p>
                      <p className="text-xs text-slate-400">{getCamera(violation.cameras)?.camera_name ?? '-'}</p>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-700">{getEmployee(violation.employees)?.name ?? 'Unknown'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                        <AlertTriangle size={12} />
                        {violation.violation_type}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityColor(severity)}`}>{severity}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {resolved
                        ? <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />Resolved</span>
                        : <span className="inline-flex items-center gap-1 text-red-500 text-xs"><AlertTriangle size={12} />Open</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {!resolved && (
                        <button onClick={() => markResolved(violation.id)} disabled={resolvingId === violation.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100 transition-colors font-medium disabled:opacity-50">
                          {resolvingId === violation.id ? 'Saving...' : 'Mark Resolved'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ViolationsPage;
