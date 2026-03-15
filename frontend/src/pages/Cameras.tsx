import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye, Edit2, Trash2, Video, Wifi, WifiOff, RefreshCw, Server } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, FormField, FormActions } from '../components/ui/Modal';

interface Camera {
  id: number;
  camera_name: string;
  rtsp_url: string;
  location: string;
  status: string;
  ai_model: string;
  site_id: number | null;
  edge_server_id: number | null;
  is_deleted?: boolean;
  created_at: string;
  sites?: { site_name: string };
}

interface Site { id: number; site_name: string; }
interface EdgeServer { id: number; server_name: string; }

const RTSP_TEST_PROTOCOL = import.meta.env.VITE_RTSP_TEST_PROTOCOL || 'http';
const RTSP_TEST_PORT = import.meta.env.VITE_RTSP_TEST_PORT || '5050';

const isProbablyValidRtsp = (url: string) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'rtsp:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

const callRtspTestApi = async (url: string, baseUrl?: string | null) => {
  if (!isProbablyValidRtsp(url)) {
    return { ok: false, message: 'Invalid RTSP URL format.' };
  }

  if (!baseUrl) {
    return { ok: false, message: 'Edge server test endpoint is not configured.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${baseUrl}/rtsp-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, message: payload?.message || 'RTSP test failed.' };
    }

    return { ok: Boolean(payload?.ok), message: payload?.message || '' };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'RTSP test timed out.' };
    }
    return { ok: false, message: 'Unable to reach RTSP test service.' };
  } finally {
    clearTimeout(timeoutId);
  }
};

const emptyForm = {
  camera_name: '',
  rtsp_url: '',
  location: '',
  status: 'active',
  ai_model: 'FRS+PPE',
  site_id: '',
  edge_server_id: '',
};

// CamForm component defined outside to fix focus issues
const CamForm = ({ 
  form, 
  setForm, 
  sites, 
  edgeServers, 
  saving, 
  rtspTestStatus,
  rtspTestMessage,
  rtspTestUrl,
  onTestRtsp,
  onCancel, 
  onSubmit 
}: { 
  form: any; 
  setForm: any; 
  sites: Site[]; 
  edgeServers: EdgeServer[]; 
  saving: boolean; 
  rtspTestStatus: 'idle' | 'testing' | 'online' | 'offline';
  rtspTestMessage: string;
  rtspTestUrl: string;
  rtspTestEdgeServerId: number | null;
  onTestRtsp: (url: string) => void;
  onCancel: () => void; 
  onSubmit: (event: React.FormEvent) => void;
}) => {
  const isTesting = rtspTestStatus === 'testing';
  const trimmedUrl = form.rtsp_url?.trim();
  const selectedEdgeServerId = form.edge_server_id ? Number(form.edge_server_id) : null;
  const isCurrentUrlTested =
    Boolean(trimmedUrl)
    && rtspTestUrl === trimmedUrl
    && rtspTestEdgeServerId === selectedEdgeServerId;
  const showStatus = isCurrentUrlTested && rtspTestStatus !== 'idle';
  const canTest = Boolean(trimmedUrl) && Boolean(selectedEdgeServerId);
  const missingEdgeServer = Boolean(trimmedUrl) && !selectedEdgeServerId;
  const needsTest = Boolean(trimmedUrl) && (!isCurrentUrlTested || rtspTestStatus !== 'online');
  const submitLabel = missingEdgeServer
    ? 'Select Edge Server'
    : (needsTest ? 'Test Connection First' : 'Save');

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Camera Name" value={form.camera_name} onChange={value => setForm((current: any) => ({ ...current, camera_name: value }))} placeholder="e.g. Gate A - Entry" required />
      
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">RTSP URL</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input 
              value={form.rtsp_url} 
              onChange={e => setForm((current: any) => ({ ...current, rtsp_url: e.target.value }))} 
              placeholder="rtsp://192.168.1.10:554/stream1"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
        </div>
        {showStatus && (
          <p className={`text-[10px] font-medium flex items-center gap-1 mt-1 ${rtspTestStatus === 'online' ? 'text-green-600' : 'text-red-500'}`}>
            {rtspTestStatus === 'online' ? <Wifi size={10} /> : <WifiOff size={10} />}
            {rtspTestStatus === 'online'
              ? (rtspTestMessage || 'Connection successful.')
              : (rtspTestMessage || 'Connection failed. Please check the URL or camera.')}
          </p>
        )}
        {!selectedEdgeServerId && trimmedUrl && (
          <p className="text-[10px] text-slate-400 mt-1">Select an edge server to enable connection testing.</p>
        )}
      </div>

      <FormField label="Location" value={form.location} onChange={value => setForm((current: any) => ({ ...current, location: value }))} placeholder="Physical location description" />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Site" value={String(form.site_id)} onChange={value => setForm((current: any) => ({ ...current, site_id: value }))} options={sites.map(site => ({ value: String(site.id), label: site.site_name }))} />
        <FormField label="Edge Server" value={String(form.edge_server_id)} onChange={value => setForm((current: any) => ({ ...current, edge_server_id: value }))} options={edgeServers.map(server => ({ value: String(server.id), label: server.server_name }))} />
      </div>
      <FormField label="AI Model" value={form.ai_model} onChange={value => setForm((current: any) => ({ ...current, ai_model: value }))} options={[{ value: 'FRS', label: 'FRS Only' }, { value: 'PPE', label: 'PPE Only' }, { value: 'FRS+PPE', label: 'FRS + PPE' }]} />
      <FormActions
        onCancel={onCancel}
        loading={saving}
        onSecondaryAction={() => onTestRtsp(form.rtsp_url)}
        secondaryDisabled={!canTest}
        secondaryLoading={isTesting}
        submitLabel={submitLabel}
        disabled={missingEdgeServer || needsTest}
      />
    </form>
  );
};

const CamerasPage = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [edgeServers, setEdgeServers] = useState<EdgeServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const [selected, setSelected] = useState<Camera | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rtspTestStatus, setRtspTestStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');
  const [rtspTestUrl, setRtspTestUrl] = useState('');
  const [rtspTestMessage, setRtspTestMessage] = useState('');
  const [rtspTestEdgeServerId, setRtspTestEdgeServerId] = useState<number | null>(null);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());

  const buildEdgeServerBaseUrl = (edgeServerId: number | null) => {
    if (!edgeServerId) return null;
    const server = edgeServers.find(item => item.id === edgeServerId);
    const host = server?.ip_address?.trim();
    if (!host) return null;

    const hasPort = host.includes(':') && !host.startsWith('[');
    const baseHost = hasPort ? host : `${host}:${RTSP_TEST_PORT}`;
    return `${RTSP_TEST_PROTOCOL}://${baseHost}`;
  };

  const testConnection = async (camera: Camera) => {
    const rtspUrl = camera.rtsp_url?.trim() || '';
    if (!rtspUrl) {
      setError(`No RTSP URL provided for ${camera.camera_name}.`);
      return;
    }
    if (!camera.edge_server_id) {
      setError(`Select an edge server for ${camera.camera_name} before testing.`);
      return;
    }

    const baseUrl = buildEdgeServerBaseUrl(camera.edge_server_id);
    if (!baseUrl) {
      setError(`Edge server for ${camera.camera_name} does not have a valid IP address.`);
      return;
    }

    setTestingId(camera.id);
    setCheckingIds(prev => new Set(prev).add(camera.id));
    setError('');

    const { ok, message } = await callRtspTestApi(rtspUrl, baseUrl);
    const newStatus = ok ? 'active' : 'inactive';

    await supabase.from('cameras').update({ status: newStatus }).eq('id', camera.id);
    setCameras(prev => prev.map(c => c.id === camera.id ? { ...c, status: newStatus } : c));

    if (!ok && message) {
      setError(`RTSP test failed for ${camera.camera_name}: ${message}`);
    }
    
    setTestingId(null);
    setCheckingIds(prev => {
      const next = new Set(prev);
      next.delete(camera.id);
      return next;
    });
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const [{ data: cameraData, error: cameraError }, { data: siteData }, { data: serverData }] = await Promise.all([
      supabase.from('cameras').select('*, sites(site_name)').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('sites').select('id, site_name').order('site_name'),
      supabase.from('edge_servers').select('id, server_name').eq('is_deleted', false).order('server_name'),
    ]);

    if (cameraError) setError(cameraError.message);
    if (cameraData) setCameras(cameraData as Camera[]);
    if (siteData) setSites(siteData as Site[]);
    if (serverData) setEdgeServers(serverData as EdgeServer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  useEffect(() => {
    const trimmed = form.rtsp_url?.trim() || '';
    if (!trimmed) {
      if (rtspTestStatus !== 'idle') {
        setRtspTestStatus('idle');
        setRtspTestUrl('');
        setRtspTestMessage('');
        setRtspTestEdgeServerId(null);
      }
      return;
    }

    if (rtspTestUrl && trimmed !== rtspTestUrl && rtspTestStatus !== 'testing') {
      setRtspTestStatus('idle');
      setRtspTestMessage('');
    }
  }, [form.rtsp_url, rtspTestStatus, rtspTestUrl]);

  useEffect(() => {
    const selectedId = form.edge_server_id ? Number(form.edge_server_id) : null;
    if (rtspTestEdgeServerId && selectedId !== rtspTestEdgeServerId && rtspTestStatus !== 'testing') {
      setRtspTestStatus('idle');
      setRtspTestMessage('');
    }
  }, [form.edge_server_id, rtspTestEdgeServerId, rtspTestStatus]);

  const runFormRtspTest = async (url: string) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    const selectedId = form.edge_server_id ? Number(form.edge_server_id) : null;
    if (!selectedId) {
      setError('Select an edge server before testing the RTSP URL.');
      return;
    }

    const baseUrl = buildEdgeServerBaseUrl(selectedId);
    if (!baseUrl) {
      setError('Selected edge server does not have a valid IP address.');
      return;
    }

    setError('');
    setRtspTestStatus('testing');
    setRtspTestMessage('');
    setRtspTestUrl(trimmed);
    setRtspTestEdgeServerId(selectedId);

    const { ok, message } = await callRtspTestApi(trimmed, baseUrl);
    setRtspTestStatus(ok ? 'online' : 'offline');
    setRtspTestMessage(message);
  };

  const statusFilter = useMemo(() => {
    const value = (searchParams.get('status') || '').toLowerCase();
    return value === 'active' || value === 'inactive' ? value : '';
  }, [searchParams]);

  const filtered = cameras.filter(camera => {
    const matchSearch =
      camera.camera_name.toLowerCase().includes(search.toLowerCase()) ||
      (camera.sites?.site_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || camera.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const buildPayload = () => ({
    camera_name: form.camera_name.trim(),
    rtsp_url: form.rtsp_url.trim(),
    location: form.location.trim(),
    status: form.status,
    ai_model: form.ai_model,
    site_id: form.site_id ? Number(form.site_id) : null,
    edge_server_id: form.edge_server_id ? Number(form.edge_server_id) : null,
  });

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedRtsp = form.rtsp_url?.trim() || '';
    if (trimmedRtsp && !form.edge_server_id) {
      setError('Please select an edge server before saving.');
      return;
    }

    const rtspVerified =
      !trimmedRtsp
      || (rtspTestStatus === 'online'
        && rtspTestUrl === trimmedRtsp
        && rtspTestEdgeServerId === Number(form.edge_server_id || 0));
    if (!rtspVerified) {
      setError('Please test the RTSP URL connection before saving.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('cameras').insert([buildPayload()]);

    if (insertError) {
      setError(insertError.message);
    } else {
      setShowAdd(false);
      setForm(emptyForm);
      await fetchAll();
    }

    setSaving(false);
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const trimmedRtsp = form.rtsp_url?.trim() || '';
    if (trimmedRtsp && !form.edge_server_id) {
      setError('Please select an edge server before saving.');
      return;
    }

    const rtspVerified =
      !trimmedRtsp
      || (rtspTestStatus === 'online'
        && rtspTestUrl === trimmedRtsp
        && rtspTestEdgeServerId === Number(form.edge_server_id || 0));
    if (!rtspVerified) {
      setError('Please test the RTSP URL connection before saving.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase.from('cameras').update(buildPayload()).eq('id', selected.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setShowEdit(false);
      await fetchAll();
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;

    setSaving(true);
    await supabase.from('cameras').update({ is_deleted: true, status: 'inactive' }).eq('id', selected.id);
    setShowDelete(false);
    await fetchAll();
    setSaving(false);
  };

  const getServerName = (edgeServerId: number | null) => edgeServers.find(server => server.id === edgeServerId)?.server_name ?? '-';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Camera Management</h1>
          <p className="text-slate-500 text-sm mt-1">Configure RTSP streams and AI processing</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm(emptyForm); setError(''); setRtspTestStatus('idle'); setRtspTestUrl(''); setRtspTestMessage(''); setRtspTestEdgeServerId(null); setShowAdd(true); }} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 shadow-sm">
            <Plus size={16} /> Add Camera
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
            placeholder="Search cameras..."
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
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} cameras</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><Video className="mx-auto mb-3 text-slate-300" size={32} /><p className="text-slate-500 font-medium">No cameras found</p></div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">Camera</th>
                <th className="px-5 py-3 font-medium">Site</th>
                <th className="px-5 py-3 font-medium">RTSP URL</th>
                <th className="px-5 py-3 font-medium">Edge Server</th>
                <th className="px-5 py-3 font-medium text-center">AI Model</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(camera => (
                <tr key={camera.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0"><Video size={14} className="text-indigo-600" /></div>
                      <div><p className="font-medium text-slate-800">{camera.camera_name}</p>{camera.location && <p className="text-xs text-slate-400">{camera.location}</p>}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{camera.sites?.site_name ?? '-'}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-400 max-w-[160px] truncate" title={camera.rtsp_url}>{camera.rtsp_url || '-'}</td>
                  <td className="px-5 py-4 text-slate-500 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Server size={12} />
                      {getServerName(camera.edge_server_id)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">{camera.ai_model || 'PPE'}</span></td>
                  <td className="px-5 py-4 text-center">
                    {checkingIds.has(camera.id) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                        <RefreshCw size={10} className="animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${camera.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {camera.status === 'active' ? <Wifi size={10} /> : <WifiOff size={10} />}
                        {camera.status === 'active' ? 'Online' : 'Offline'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <button 
                        onClick={() => testConnection(camera)} 
                        disabled={testingId === camera.id}
                        className={`group relative flex items-center justify-center w-8 h-8 rounded-lg transition-all ${testingId === camera.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white hover:shadow-md'}`}
                        title="Test Connection"
                      >
                        {testingId === camera.id ? <RefreshCw size={15} className="animate-spin" /> : <Wifi size={15} />}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">Test Connection</span>
                      </button>
                      <button onClick={() => { setSelected(camera); setShowView(true); }} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="View"><Eye size={15} /></button>
                      <button onClick={() => { setSelected(camera); setForm({ camera_name: camera.camera_name, rtsp_url: camera.rtsp_url ?? '', location: camera.location ?? '', status: camera.status ?? 'active', ai_model: camera.ai_model ?? 'PPE', site_id: String(camera.site_id ?? ''), edge_server_id: String(camera.edge_server_id ?? '') }); setRtspTestStatus('idle'); setRtspTestUrl(''); setRtspTestMessage(''); setRtspTestEdgeServerId(null); setShowEdit(true); }} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Edit"><Edit2 size={15} /></button>
                      <button onClick={() => { setSelected(camera); setShowDelete(true); }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Camera">
        <CamForm form={form} setForm={setForm} sites={sites} edgeServers={edgeServers} saving={saving} rtspTestStatus={rtspTestStatus} rtspTestMessage={rtspTestMessage} rtspTestUrl={rtspTestUrl} rtspTestEdgeServerId={rtspTestEdgeServerId} onTestRtsp={runFormRtspTest} onCancel={() => setShowAdd(false)} onSubmit={handleAdd} />
      </Modal>
      <Modal isOpen={showView} onClose={() => setShowView(false)} title="Camera Details">
        {selected && (
          <div className="space-y-3">
            {[
              ['Camera Name', selected.camera_name],
              ['Site', selected.sites?.site_name ?? '-'],
              ['RTSP URL', selected.rtsp_url ?? '-'],
              ['AI Model', selected.ai_model ?? '-'],
              ['Edge Server', getServerName(selected.edge_server_id)],
              ['Status', selected.status ?? '-'],
              ['Location', selected.location ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800 font-mono">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${selected?.camera_name}`}>
        <CamForm form={form} setForm={setForm} sites={sites} edgeServers={edgeServers} saving={saving} rtspTestStatus={rtspTestStatus} rtspTestMessage={rtspTestMessage} rtspTestUrl={rtspTestUrl} rtspTestEdgeServerId={rtspTestEdgeServerId} onTestRtsp={runFormRtspTest} onCancel={() => setShowEdit(false)} onSubmit={handleEdit} />
      </Modal>
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete Camera" maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Delete "{selected?.camera_name}"?</p>
            <p className="text-sm text-slate-500 mt-1">This will archive the camera and hide it from the dashboard.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowDelete(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium disabled:opacity-50">
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CamerasPage;
