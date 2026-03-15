import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Server, Wifi, WifiOff, Network, RefreshCw, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FormActions, FormField, Modal } from '../components/ui/Modal';

interface SiteRecord {
  id: number;
  site_name: string;
}

interface CameraLink {
  edge_server_id: number | null;
}

interface EdgeServerRecord {
  id: number;
  site_id: number | null;
  server_name: string;
  ip_address: string | null;
  mac_address: string | null;
  status: string;
  is_deleted: boolean;
  created_at: string;
  sites?: { site_name: string } | { site_name: string }[];
  camera_count?: number;
}

const emptyForm = {
  site_id: '',
  server_name: '',
  ip_address: '',
  mac_address: '',
  status: 'active',
};

const EdgeServersPage = () => {
  const [servers, setServers] = useState<EdgeServerRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const [selected, setSelected] = useState<EdgeServerRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const [{ data: serverData, error: serverError }, { data: siteData }, { data: cameraData }] = await Promise.all([
      supabase
        .from('edge_servers')
        .select('id, site_id, server_name, ip_address, mac_address, status, is_deleted, created_at, sites(site_name)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      supabase.from('sites').select('id, site_name').order('site_name'),
      supabase.from('cameras').select('edge_server_id').eq('is_deleted', false),
    ]);

    if (serverError) setError(serverError.message);

    const counts = new Map<number, number>();
    (cameraData as CameraLink[] | null)?.forEach(camera => {
      if (!camera.edge_server_id) return;
      counts.set(camera.edge_server_id, (counts.get(camera.edge_server_id) ?? 0) + 1);
    });

    if (serverData) {
      setServers(
        ((serverData as unknown) as EdgeServerRecord[]).map(server => ({
          ...server,
          camera_count: counts.get(server.id) ?? 0,
        })),
      );
    }

    if (siteData) setSites(siteData as SiteRecord[]);
    setLoading(false);
  }, []);

  const getSiteName = (siteRelation: EdgeServerRecord['sites']) =>
    Array.isArray(siteRelation) ? (siteRelation[0]?.site_name ?? '-') : (siteRelation?.site_name ?? '-');

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const statusFilter = useMemo(() => {
    const value = (searchParams.get('status') || '').toLowerCase();
    return value === 'active' || value === 'inactive' ? value : '';
  }, [searchParams]);

  const filtered = servers.filter(server => {
    const matchSearch =
      server.server_name.toLowerCase().includes(search.toLowerCase()) ||
      getSiteName(server.sites).toLowerCase().includes(search.toLowerCase()) ||
      (server.ip_address ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || server.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const closeForms = () => {
    setShowAdd(false);
    setShowEdit(false);
    setForm(emptyForm);
    setError('');
  };

  const buildPayload = () => ({
    site_id: form.site_id ? Number(form.site_id) : null,
    server_name: form.server_name.trim(),
    ip_address: form.ip_address.trim() || null,
    mac_address: form.mac_address.trim() || null,
    status: form.status,
  });

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('edge_servers').insert([buildPayload()]);

    if (insertError) {
      setError(insertError.message);
    } else {
      closeForms();
      await fetchAll();
    }

    setSaving(false);
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase
      .from('edge_servers')
      .update(buildPayload())
      .eq('id', selected.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      closeForms();
      await fetchAll();
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase
      .from('edge_servers')
      .update({ is_deleted: true, status: 'inactive' })
      .eq('id', selected.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setShowDelete(false);
      setSelected(null);
      await fetchAll();
    }

    setSaving(false);
  };

  const ServerForm = ({ onSubmit }: { onSubmit: (event: React.FormEvent) => void }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
      <FormField
        label="Server Name"
        value={form.server_name}
        onChange={value => setForm(current => ({ ...current, server_name: value }))}
        placeholder="e.g. Edge-01"
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Site"
          value={form.site_id}
          onChange={value => setForm(current => ({ ...current, site_id: value }))}
          options={sites.map(site => ({ value: String(site.id), label: site.site_name }))}
        />
        <FormField
          label="Status"
          value={form.status}
          onChange={value => setForm(current => ({ ...current, status: value }))}
          options={[
            { value: 'active', label: 'Online' },
            { value: 'inactive', label: 'Offline' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="IP Address"
          value={form.ip_address}
          onChange={value => setForm(current => ({ ...current, ip_address: value }))}
          placeholder="e.g. 192.168.1.10"
        />
        <FormField
          label="MAC Address"
          value={form.mac_address}
          onChange={value => setForm(current => ({ ...current, mac_address: value }))}
          placeholder="e.g. 00:1A:2B:3C:4D:5E"
        />
      </div>
      <FormActions onCancel={closeForms} loading={saving} submitLabel={selected ? 'Update Server' : 'Create Server'} />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Edge Servers</h1>
          <p className="text-slate-500 text-sm mt-1">Manage on-premise AI inference servers</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAll}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              setForm(emptyForm);
              setError('');
              setShowAdd(true);
            }}
            style={{ backgroundColor: '#005baa' }}
            className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus size={16} /> Add Server
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
            placeholder="Search servers..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        {statusFilter && (
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('status');
              setSearchParams(params);
            }}
            className="text-xs px-3 py-2 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            Status: {statusFilter === 'active' ? 'Online' : 'Offline'} x
          </button>
        )}
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} servers</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center text-slate-400 animate-pulse">
          Loading from database...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <Server className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-slate-500 font-medium">No edge servers found</p>
          <p className="text-slate-400 text-sm mt-1">Add your first edge server to connect cameras.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(server => {
            const online = server.status === 'active';

            return (
              <div key={server.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${online ? 'bg-blue-100' : 'bg-slate-100'}`}>
                      <Server size={18} className={online ? 'text-blue-600' : 'text-slate-400'} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{server.server_name}</p>
                      <p className="text-xs text-slate-400">{getSiteName(server.sites) || 'No site assigned'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {online ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 mb-1">IP Address</p>
                    <p className="font-mono font-medium text-slate-700">{server.ip_address || '-'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 mb-1">Connected Cameras</p>
                    <p className="font-bold text-slate-700">{server.camera_count ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                    <p className="text-slate-400 mb-1 flex items-center gap-1">
                      <Network size={10} /> MAC Address
                    </p>
                    <p className="font-medium text-slate-700 font-mono">{server.mac_address || '-'}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setSelected(server);
                      setShowView(true);
                    }}
                    className="flex-1 text-xs py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Eye size={12} /> View
                  </button>
                  <button
                    onClick={() => {
                      setSelected(server);
                      setForm({
                        site_id: String(server.site_id ?? ''),
                        server_name: server.server_name,
                        ip_address: server.ip_address ?? '',
                        mac_address: server.mac_address ?? '',
                        status: server.status ?? 'active',
                      });
                      setError('');
                      setShowEdit(true);
                    }}
                    className="flex-1 text-xs py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  <button
                    onClick={() => {
                      setSelected(server);
                      setShowDelete(true);
                    }}
                    className="flex-1 text-xs py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={closeForms} title="Add Edge Server">
        <ServerForm onSubmit={handleAdd} />
      </Modal>

      <Modal isOpen={showView} onClose={() => setShowView(false)} title="Edge Server Details">
        {selected && (
          <div className="space-y-3">
            {[
              ['Server Name', selected.server_name],
              ['Site', getSiteName(selected.sites)],
              ['IP Address', selected.ip_address ?? '-'],
              ['MAC Address', selected.mac_address ?? '-'],
              ['Status', selected.status === 'active' ? 'Online' : 'Offline'],
              ['Connected Cameras', String(selected.camera_count ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal isOpen={showEdit} onClose={closeForms} title={`Edit: ${selected?.server_name}`}>
        <ServerForm onSubmit={handleEdit} />
      </Modal>

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Remove Edge Server" maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Remove "{selected?.server_name}"?</p>
            <p className="text-sm text-slate-500 mt-1">This will archive the server record and hide it from the dashboard.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDelete(false)}
              className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium disabled:opacity-50"
            >
              {saving ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EdgeServersPage;
