import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Camera, Filter, Download, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { selectUsersWithOptionalSite } from '../lib/userQueries';
import { resolveSnapshotUrl } from '../lib/snapshotUrl';
import { Modal } from '../components/ui/Modal';

interface EventRecord {
  id: number;
  event_time: string;
  event_type: string;
  face_detected: boolean | null;
  confidence_score: number | null;
  image_path: string | null;
  cameras?:
    | { camera_name: string; location?: string | null; sites?: { site_name: string } | { site_name: string }[] }
    | { camera_name: string; location?: string | null; sites?: { site_name: string } | { site_name: string }[] }[];
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

const getEventCategory = (value: string | null | undefined) => {
  const normalized = (value ?? '').toString().trim().toUpperCase();
  if (!normalized) return 'Other';
  if (normalized.includes('FRS') || normalized.includes('FACE')) return 'FRS';
  if (
    normalized.includes('PPE')
    || normalized.includes('HELMET')
    || normalized.includes('VEST')
    || normalized.includes('GLOVE')
    || normalized.includes('GOGGLES')
  ) {
    return 'PPE';
  }
  return 'Other';
};

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

const EventsPage = () => {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin';
  const assignedSiteId = appUser?.site_id ?? null;
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const initialType = useMemo(() => {
    const value = (searchParams.get('type') || '').toLowerCase();
    if (value === 'frs') return 'FRS';
    if (value === 'ppe') return 'PPE';
    if (value === 'other') return 'Other';
    return 'All';
  }, [searchParams]);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const unknownOnly = searchParams.get('unknown') === 'true';
  const [error, setError] = useState('');
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [users, setUsers] = useState<UserScope[]>([]);
  const [snapshotPreview, setSnapshotPreview] = useState<{ url: string; title: string } | null>(null);
  const selectedSiteId = searchParams.get('site') ?? '';
  const selectedUserId = searchParams.get('user') ?? '';

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!isAdmin && !assignedSiteId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('events')
      .select('id, event_time, event_type, face_detected, confidence_score, image_path, cameras(camera_name, location, sites(site_name)), employees(name)')
      .order('event_time', { ascending: false });

    if (!isAdmin && assignedSiteId) {
      query = query.eq('site_id', assignedSiteId);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setEvents(((data as unknown) as EventRecord[]) ?? []);
    }

    setLoading(false);
  }, [assignedSiteId, isAdmin]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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
    setTypeFilter(initialType);
  }, [initialType]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const typeOptions = useMemo(() => {
    const categories = new Set(events.map(event => getEventCategory(event.event_type)));
    const options = ['All', 'FRS', 'PPE'];
    if (categories.has('Other')) options.push('Other');
    return options;
  }, [events]);

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'All') {
      params.delete('type');
    } else {
      params.set('type', value.toLowerCase());
    }
    setSearchParams(params);
  };

  const clearUnknownFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('unknown');
    setSearchParams(params);
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

  const getCamera = (cameraRelation: EventRecord['cameras']) => Array.isArray(cameraRelation) ? cameraRelation[0] : cameraRelation;
  const getEmployee = (employeeRelation: EventRecord['employees']) => Array.isArray(employeeRelation) ? employeeRelation[0] : employeeRelation;
  const getSiteName = (cameraRelation: EventRecord['cameras']) => {
    const camera = getCamera(cameraRelation);
    const sites = camera?.sites;
    return Array.isArray(sites) ? (sites[0]?.site_name ?? '') : (sites?.site_name ?? '');
  };

  const filtered = events.filter(event => {
    const isUnknown = !getEmployee(event.employees);
    const siteName = getSiteName(event.cameras);
    const selectedSiteName = sites.find(site => String(site.id) === selectedSiteId)?.site_name ?? '';
    const selectedUserSiteId = users.find(user => String(user.id) === selectedUserId)?.site_id;
    const matchSearch =
      (getEmployee(event.employees)?.name ?? 'Unknown').toLowerCase().includes(search.toLowerCase()) ||
      siteName.toLowerCase().includes(search.toLowerCase()) ||
      event.event_type.toLowerCase().includes(search.toLowerCase()) ||
      (getCamera(event.cameras)?.camera_name ?? '').toLowerCase().includes(search.toLowerCase());

    const matchType = typeFilter === 'All' || getEventCategory(event.event_type) === typeFilter;
    const matchSite = !selectedSiteId || siteName === selectedSiteName;
    const matchUserScope = !selectedUserId || (selectedUserSiteId != null && selectedSiteId === String(selectedUserSiteId));
    const matchUnknown = !unknownOnly || isUnknown;
    return matchSearch && matchType && matchSite && matchUserScope && matchUnknown;
  });

  const handleExport = () => {
    downloadCsv(
      'events.csv',
      filtered.map(event => ({
        timestamp: event.event_time,
        site: getSiteName(event.cameras),
        camera: getCamera(event.cameras)?.camera_name ?? '',
        employee: getEmployee(event.employees)?.name ?? 'Unknown',
        event_type: event.event_type,
        face_detected: event.face_detected ?? false,
        confidence_score: event.confidence_score,
        image_path: event.image_path,
      })),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">AI Events Log</h1>
          <p className="text-slate-500 text-sm mt-1">All FRS and PPE detection events</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchEvents} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExport} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm">
            <Download size={15} /> Export CSV
          </button>
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
            placeholder="Search events..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <Filter size={13} className="text-slate-400" />
          <select value={typeFilter} onChange={event => handleTypeChange(event.target.value)} className="text-slate-700 text-sm bg-transparent outline-none">
            {typeOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
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
        {unknownOnly && (
          <button
            onClick={clearUnknownFilter}
            className="text-xs px-3 py-2 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            Unknown faces only x
          </button>
        )}
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} events</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No events found for the current filter.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">Timestamp</th>
                <th className="px-5 py-3 font-medium">Site / Camera</th>
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 font-medium">Event Type</th>
                <th className="px-5 py-3 font-medium text-center">Face</th>
                <th className="px-5 py-3 font-medium text-center">Confidence</th>
                <th className="px-5 py-3 font-medium text-right">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(event => {
                const snapshotUrl = resolveSnapshotUrl(event.image_path);

                return (
                <tr key={event.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">{new Date(event.event_time).toLocaleString()}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800 text-xs">{getSiteName(event.cameras) || '-'}</p>
                    <p className="text-xs text-slate-400">{getCamera(event.cameras)?.camera_name ?? '-'}</p>
                    <p className="text-xs text-slate-400">{getCamera(event.cameras)?.location ?? '-'}</p>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-700 text-xs">{getEmployee(event.employees)?.name ?? 'Unknown'}</td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {getEventCategory(event.event_type) === 'Other' ? event.event_type : getEventCategory(event.event_type)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${event.face_detected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {event.face_detected ? 'Detected' : 'Not Found'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-500">
                    {event.confidence_score != null ? `${Math.round(Number(event.confidence_score))}%` : '-'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {snapshotUrl ? (
                      <button
                        type="button"
                        onClick={() => setSnapshotPreview({
                          url: snapshotUrl,
                          title: `${event.event_type} - ${new Date(event.event_time).toLocaleString()}`,
                        })}
                        className="w-7 h-7 rounded bg-slate-100 inline-flex items-center justify-center hover:bg-slate-200 transition-colors"
                        title="Open snapshot"
                      >
                        <Camera size={13} className="text-slate-500" />
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={Boolean(snapshotPreview)}
        onClose={() => setSnapshotPreview(null)}
        title={snapshotPreview?.title ?? 'Snapshot'}
        maxWidth="max-w-5xl"
      >
        {snapshotPreview && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
              <img
                src={snapshotPreview.url}
                alt={snapshotPreview.title}
                className="w-full h-auto max-h-[75vh] object-contain mx-auto"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSnapshotPreview(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EventsPage;
