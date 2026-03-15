import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye, Edit2, Trash2, MapPin, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, FormField, FormActions } from '../components/ui/Modal';

interface Site {
  id: number;
  site_name: string;
  address: string;
  description: string;
  status: string;
  created_at: string;
  _cameras?: number;
  _employees?: number;
}

const emptySite = { site_name: '', address: '', description: '', status: 'active' };

const SitesPage = () => {
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

  const fetchSites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sites').select('*').order('created_at', { ascending: false });
    if (!error && data) setSites(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const filtered = sites.filter(s =>
    s.site_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (site: Site) => { setSelected(site); setForm({ site_name: site.site_name, address: site.address ?? '', description: site.description ?? '', status: site.status ?? 'active' }); setShowEdit(true); };
  const openView = (site: Site) => { setSelected(site); setShowView(true); };
  const openDelete = (site: Site) => { setSelected(site); setShowDelete(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    const { error } = await supabase.from('sites').insert([{ ...form }]);
    if (error) { setError(error.message); } else { setShowAdd(false); setForm(emptySite); fetchSites(); }
    setSaving(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selected) return; setSaving(true); setError('');
    const { error } = await supabase.from('sites').update({ ...form }).eq('id', selected.id);
    if (error) { setError(error.message); } else { setShowEdit(false); fetchSites(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return; setSaving(true);
    await supabase.from('sites').delete().eq('id', selected.id);
    setShowDelete(false); fetchSites(); setSaving(false);
  };

  const SiteForm = ({ onSubmit }: { onSubmit: (e: React.FormEvent) => void }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
      <FormField label="Site Name" value={form.site_name} onChange={v => setForm(f => ({ ...f, site_name: v }))} placeholder="e.g. Metro Construction HQ" required />
      <FormField label="Address" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="Full address" />
      <FormField label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Optional description" />
      <FormField label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      <FormActions onCancel={() => { setShowAdd(false); setShowEdit(false); }} loading={saving} />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sites Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage construction sites and facilities</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSites} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setForm(emptySite); setError(''); setShowAdd(true); }} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm">
            <Plus size={16} /> Add Site
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
            placeholder="Search sites..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} sites</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <MapPin className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="text-slate-500 font-medium">No sites found</p>
            <p className="text-slate-400 text-sm mt-1">Add your first site to get started</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">Site Name</th>
                <th className="px-5 py-3 font-medium">Address</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium text-center">Created</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(site => (
                <tr key={site.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <MapPin size={14} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{site.site_name}</p>
                        {site.description && <p className="text-xs text-slate-400 truncate max-w-[180px]">{site.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{site.address || '—'}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${site.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {site.status === 'active' ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {site.status ?? 'active'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-400">{new Date(site.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openView(site)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="View"><Eye size={15} /></button>
                      <button onClick={() => openEdit(site)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Edit"><Edit2 size={15} /></button>
                      <button onClick={() => openDelete(site)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Site">
        <SiteForm onSubmit={handleAdd} />
      </Modal>

      {/* View Modal */}
      <Modal isOpen={showView} onClose={() => setShowView(false)} title="Site Details">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Site Name', value: selected.site_name },
                { label: 'Status', value: selected.status ?? 'active' },
                { label: 'Address', value: selected.address ?? '—' },
                { label: 'Created', value: new Date(selected.created_at).toLocaleString() },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{item.label}</p>
                  <p className="text-sm font-medium text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
            {selected.description && (
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-700">{selected.description}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => { setShowView(false); openEdit(selected); }} className="px-4 py-2 text-sm rounded-lg text-white" style={{ backgroundColor: '#005baa' }}>Edit Site</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${selected?.site_name}`}>
        <SiteForm onSubmit={handleEdit} />
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete Site" maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Delete "{selected?.site_name}"?</p>
            <p className="text-sm text-slate-500 mt-1">This action cannot be undone.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowDelete(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50">
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SitesPage;
