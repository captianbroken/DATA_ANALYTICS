import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye, Edit2, Trash2, MapPin, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, FormField, FormActions } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { selectUsersWithOptionalSite } from '../lib/userQueries';

interface Site {
  id: number;
  site_name: string;
  address: string;
  description: string;
  status: string;
  created_at: string;
  _cameras?: number;
  _employees?: number;
  linked_users?: number;
}

interface UserScope {
  id: number;
  name: string;
  site_id?: number | null;
}

const emptySite = { site_name: '', address: '', description: '', status: 'active', user_id: '' };

const SitesPage = () => {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin';
  const assignedSiteId = appUser?.site_id ?? null;
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const [selected, setSelected] = useState<Site | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState(emptySite);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [siteAssignmentAvailable, setSiteAssignmentAvailable] = useState(true);
  const [users, setUsers] = useState<UserScope[]>([]);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!isAdmin && !assignedSiteId) {
      setSites([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    let query = supabase.from('sites').select('*').order('created_at', { ascending: false });
    if (!isAdmin && assignedSiteId) {
      query = query.eq('id', assignedSiteId);
    }

    const [{ data, error: sitesError }, usersResult] = await Promise.all([
      query,
      isAdmin
        ? selectUsersWithOptionalSite<UserScope>('id, name, site_id', 'id, name', userQuery => userQuery.eq('is_deleted', false).not('site_id', 'is', null).order('name'))
        : Promise.resolve({ data: [], error: null, siteAssignmentAvailable: true }),
    ]);

    if (sitesError) setError(sitesError.message);
    setSiteAssignmentAvailable(usersResult.siteAssignmentAvailable);
    setUsers((usersResult.data as UserScope[] | null) ?? []);

    if (!sitesError && data) {
      const usersBySite = new Map<number, number>();
      (usersResult.data as UserScope[] | null)?.forEach(user => {
        if (!user.site_id) return;
        usersBySite.set(user.site_id, (usersBySite.get(user.site_id) ?? 0) + 1);
      });

      setSites((data as Site[]).map(site => ({ ...site, linked_users: usersBySite.get(site.id) ?? 0 })));
    }

    setLoading(false);
  }, [assignedSiteId, isAdmin]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const selectedUserId = searchParams.get('user') ?? '';

  const filtered = sites.filter(site => {
    const selectedUser = users.find(user => String(user.id) === selectedUserId);
    const matchSearch =
      site.site_name.toLowerCase().includes(search.toLowerCase()) ||
      (site.address ?? '').toLowerCase().includes(search.toLowerCase());
    const matchUser = !selectedUser || site.id === selectedUser.site_id;
    return matchSearch && matchUser;
  });

  const openEdit = (site: Site) => {
    setSelected(site);
    setForm({
      site_name: site.site_name,
      address: site.address ?? '',
      description: site.description ?? '',
      status: site.status ?? 'active',
      user_id: '',
    });
    setShowEdit(true);
  };

  const openView = (site: Site) => {
    setSelected(site);
    setShowView(true);
  };

  const openDelete = (site: Site) => {
    setSelected(site);
    setShowDelete(true);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const { data: insertData, error: insertError } = await supabase.from('sites').insert([{ 
      site_name: form.site_name,
      address: form.address,
      description: form.description,
      status: form.status
    }]).select();

    if (insertError) {
      setError(insertError.message);
    } else {
      if (form.user_id && insertData && insertData[0]) {
        await supabase.from('users').update({ site_id: insertData[0].id }).eq('id', Number(form.user_id));
      }
      setShowAdd(false);
      setForm(emptySite);
      fetchSites();
    }

    setSaving(false);
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase.from('sites').update({ ...form }).eq('id', selected.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      if (form.user_id) {
        await supabase.from('users').update({ site_id: selected.id }).eq('id', Number(form.user_id));
      }
      setShowEdit(false);
      fetchSites();
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    await supabase.from('sites').delete().eq('id', selected.id);
    setShowDelete(false);
    fetchSites();
    setSaving(false);
  };

  const renderSiteForm = (onSubmit: (event: React.FormEvent) => void) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <FormField label="Site Name" value={form.site_name} onChange={value => setForm(current => ({ ...current, site_name: value }))} placeholder="e.g. Metro Construction HQ" required />
      <FormField label="Address" value={form.address} onChange={value => setForm(current => ({ ...current, address: value }))} placeholder="Full address" />
      <FormField label="Description" value={form.description} onChange={value => setForm(current => ({ ...current, description: value }))} placeholder="Optional description" />
      <FormField label="Status" value={form.status} onChange={value => setForm(current => ({ ...current, status: value }))} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      {isAdmin && (
        <FormField 
          label="Link a User" 
          value={form.user_id} 
          onChange={value => setForm(current => ({ ...current, user_id: value }))} 
          options={[
            { value: '', label: 'Select user to link' },
            ...users.map(u => ({ value: String(u.id), label: u.name }))
          ]} 
        />
      )}
      <FormActions onCancel={() => { setShowAdd(false); setShowEdit(false); }} loading={saving} />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sites Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? 'Manage construction sites and facilities' : 'Your assigned site and facility details'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSites} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button onClick={() => { setForm(emptySite); setError(''); setShowAdd(true); }} style={{ backgroundColor: '#005baa' }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90">
              <Plus size={16} /> Add Site
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
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
            placeholder="Search sites..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {isAdmin && users.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-400">User</span>
            <select
              value={selectedUserId}
              onChange={event => {
                const params = new URLSearchParams(searchParams);
                if (event.target.value) params.set('user', event.target.value);
                else params.delete('user');
                setSearchParams(params);
              }}
              className="bg-transparent text-sm text-slate-700 outline-none"
            >
              <option value="">All</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
        )}
        {isAdmin && users.length === 0 && (
          <span className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-600">
            Assign a site to a user in Users before filtering by user.
          </span>
        )}
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">{filtered.length} sites</span>
      </div>

      {isAdmin && !siteAssignmentAvailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          User-to-site ownership is not available in the current database yet, so this page cannot show which users belong to this site.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <MapPin className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="font-medium text-slate-500">No sites found</p>
            <p className="mt-1 text-sm text-slate-400">Add your first site to get started</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Site Name</th>
                {isAdmin && <th className="px-5 py-3 text-center font-medium">Linked Users</th>}
                <th className="px-5 py-3 font-medium">Address</th>
                <th className="px-5 py-3 text-center font-medium">Status</th>
                <th className="px-5 py-3 text-center font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(site => (
                <tr key={site.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
                        <MapPin size={14} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{site.site_name}</p>
                        {site.description && <p className="max-w-[180px] truncate text-xs text-slate-400">{site.description}</p>}
                      </div>
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {site.linked_users ?? 0}
                      </span>
                    </td>
                  )}
                  <td className="px-5 py-4 text-xs text-slate-500">{site.address || '-'}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${site.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {site.status === 'active' ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {site.status ?? 'active'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-400">{new Date(site.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openView(site)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="View"><Eye size={15} /></button>
                      {isAdmin && <button onClick={() => openEdit(site)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600" title="Edit"><Edit2 size={15} /></button>}
                      {isAdmin && <button onClick={() => openDelete(site)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Site">
        {renderSiteForm(handleAdd)}
      </Modal>

      <Modal isOpen={showView} onClose={() => setShowView(false)} title="Site Details">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Site Name', value: selected.site_name },
                { label: 'Status', value: selected.status ?? 'active' },
                { label: 'Address', value: selected.address ?? '-' },
                { label: 'Created', value: new Date(selected.created_at).toLocaleString() },
                ...(isAdmin ? [{ label: 'Linked Users', value: String(selected.linked_users ?? 0) }] : []),
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="text-sm font-medium text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
            {selected.description && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
                <p className="text-sm text-slate-700">{selected.description}</p>
              </div>
            )}
            {isAdmin && (
              <div className="flex justify-end pt-2">
                <button onClick={() => { setShowView(false); openEdit(selected); }} className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: '#005baa' }}>Edit Site</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={showEdit && isAdmin} onClose={() => setShowEdit(false)} title={`Edit: ${selected?.site_name}`}>
        {renderSiteForm(handleEdit)}
      </Modal>

      <Modal isOpen={showDelete && isAdmin} onClose={() => setShowDelete(false)} title="Delete Site" maxWidth="max-w-sm">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Delete "{selected?.site_name}"?</p>
            <p className="mt-1 text-sm text-slate-500">This action cannot be undone.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowDelete(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SitesPage;
