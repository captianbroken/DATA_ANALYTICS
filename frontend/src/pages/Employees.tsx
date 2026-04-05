import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye, Edit2, Trash2, UserCheck, UserX, RefreshCw, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, FormField, FormActions } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { selectUsersWithOptionalSite } from '../lib/userQueries';
import { getScopeSiteId, isAdminRole, isSuperAdminRole } from '../lib/roles';
import { scopeSitesForActor, scopeUsersForActor } from '../lib/tenantScope';

interface Employee {
  id: number;
  name: string;
  employee_code: string;
  department: string;
  designation?: string;
  site_id?: number | null;
  is_deleted: boolean;
  created_at: string;
  sites?: { site_name: string };
  face_registered?: boolean;
  has_spectacles?: boolean;
  face_image_paths?: string[] | null;
  linked_users?: number;
}

interface Site { id: number; site_name: string; }
interface UserOption { id: number; name: string; site_id?: number | null; }

const FACE_BUCKET = 'employee-faces';

const emptyForm = { name: '', employee_code: '', department: '', designation: '', site_id: '', has_spectacles: '' };

const EmployeesPage = () => {
  const { appUser } = useAuth();
  const isAdmin = isAdminRole(appUser?.role);
  const isSuperAdmin = isSuperAdminRole(appUser?.role);
  const { canWrite, isReadOnly } = usePermissions();
  const assignedSiteId = getScopeSiteId(appUser);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [faceFiles, setFaceFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const resetFaceUploads = () => {
    setFaceFiles([]);
    setFileInputKey(value => value + 1);
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    employee_code: form.employee_code.trim(),
    department: form.department.trim(),
    designation: form.designation.trim(),
    site_id: isSuperAdmin ? (form.site_id ? Number(form.site_id) : null) : assignedSiteId,
    created_by: appUser?.id ?? null,
    has_spectacles: form.has_spectacles === 'yes',
  });

  const uploadFaceImages = async (employeeCode: string, files: File[]) => {
    const safeCode = employeeCode.trim().replace(/[^a-zA-Z0-9-_]/g, '-');
    const uploads: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `employees/${safeCode}/${Date.now()}-${index}.${ext}`;

      const { error: uploadError } = await supabase
        .storage
        .from(FACE_BUCKET)
        .upload(filePath, file, { upsert: false, contentType: file.type || 'image/jpeg' });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      uploads.push(filePath);
    }

    return uploads;
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!isSuperAdmin && !assignedSiteId) {
      setEmployees([]);
      setSites([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    let employeeQuery = supabase.from('employees').select('*, sites(site_name)').eq('is_deleted', false).order('name');
    let siteQuery = supabase.from('sites').select('id, site_name').order('site_name');

    if (!isSuperAdmin && assignedSiteId) {
      employeeQuery = employeeQuery.eq('site_id', assignedSiteId);
      siteQuery = siteQuery.eq('id', assignedSiteId);
    }

    const [{ data: empData, error: empError }, { data: siteData }, usersResult] = await Promise.all([
      employeeQuery,
      siteQuery,
      isAdmin
        ? selectUsersWithOptionalSite<UserOption>('id, name, site_id', 'id, name', query => query.eq('is_deleted', false).not('site_id', 'is', null).order('name'))
        : Promise.resolve({ data: [], error: null, siteAssignmentAvailable: true }),
    ]);

    if (empError) setError(empError.message);
    if (empData) {
      const usersBySite = new Map<number, number>();
      scopeUsersForActor((usersResult.data as UserOption[] | null) ?? [], appUser).forEach(user => {
        if (!user.site_id) return;
        usersBySite.set(user.site_id, (usersBySite.get(user.site_id) ?? 0) + 1);
      });

      setEmployees((empData as Employee[]).map(employee => ({
        ...employee,
        linked_users: employee.site_id ? (usersBySite.get(employee.site_id) ?? 0) : 0,
      })));
    }
    if (siteData) setSites(scopeSitesForActor(siteData as Site[], appUser));
    setUsers(scopeUsersForActor((usersResult.data as UserOption[] | null) ?? [], appUser));
    setLoading(false);
  }, [appUser, assignedSiteId, isSuperAdmin, isAdmin]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const selectedUserId = searchParams.get('user') ?? '';

  const filtered = employees.filter(employee => {
    const selectedUser = users.find(user => String(user.id) === selectedUserId);
    const matchSearch =
      employee.name.toLowerCase().includes(search.toLowerCase()) ||
      (employee.employee_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (employee.department ?? '').toLowerCase().includes(search.toLowerCase());
    const matchUser = !selectedUser || employee.site_id === selectedUser.site_id;
    return matchSearch && matchUser;
  });

  const closeForms = () => {
    setShowAdd(false);
    setShowEdit(false);
    setForm(emptyForm);
    setError('');
    resetFaceUploads();
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    if (!form.has_spectacles) {
      setSaving(false);
      setError('Please select whether the employee wears spectacles.');
      return;
    }
    const requiredCount = form.has_spectacles === 'yes' ? 4 : 3;
    if (faceFiles.length !== requiredCount) {
      setSaving(false);
      setError(`Please upload exactly ${requiredCount} face photos ${form.has_spectacles === 'yes' ? 'with' : 'without'} spectacles.`);
      return;
    }

    const payload: any = buildPayload();

    try {
      const uploadedPaths = await uploadFaceImages(payload.employee_code, faceFiles);
      payload.face_image_paths = uploadedPaths;
      payload.face_registered = true;
    } catch (err: any) {
      setSaving(false);
      setError(err?.message || 'Failed to upload face photos.');
      return;
    }

    const { error: insertError } = await supabase.from('employees').insert([payload]);

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

    if (!form.has_spectacles) {
      setSaving(false);
      setError('Please select whether the employee wears spectacles.');
      return;
    }
    const payload: any = buildPayload();
    const spectaclesChanged = Boolean(selected.has_spectacles) !== (form.has_spectacles === 'yes');

    if (!form.has_spectacles) {
      setSaving(false);
      setError('Please select whether the employee wears spectacles.');
      return;
    }

    if (spectaclesChanged && faceFiles.length === 0) {
      setSaving(false);
      setError('Please upload new face photos to match the spectacles selection.');
      return;
    }

    if (faceFiles.length > 0) {
      const requiredCount = form.has_spectacles === 'yes' ? 4 : 3;
      if (faceFiles.length !== requiredCount) {
        setSaving(false);
        setError(`Please upload exactly ${requiredCount} face photos ${form.has_spectacles === 'yes' ? 'with' : 'without'} spectacles.`);
        return;
      }

      try {
        const uploadedPaths = await uploadFaceImages(payload.employee_code, faceFiles);
        payload.face_image_paths = uploadedPaths;
        payload.face_registered = true;
      } catch (err: any) {
        setSaving(false);
        setError(err?.message || 'Failed to upload face photos.');
        return;
      }
    }

    const { error: updateError } = await supabase.from('employees').update(payload).eq('id', selected.id);

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
    await supabase.from('employees').update({ is_deleted: true }).eq('id', selected.id);
    setShowDelete(false);
    await fetchAll();
    setSaving(false);
  };

  const renderEmpForm = (onSubmit: (event: React.FormEvent) => void) => {
    const requiredCount = form.has_spectacles === 'yes' ? 4 : 3;

    return (
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
        <FormField label="Full Name" value={form.name} onChange={value => setForm((current: any) => ({ ...current, name: value }))} placeholder="e.g. John Doe" required />
        <FormField label="Employee ID" value={form.employee_code} onChange={value => setForm((current: any) => ({ ...current, employee_code: value }))} placeholder="e.g. EMP-001" required />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Department" value={form.department} onChange={value => setForm((current: any) => ({ ...current, department: value }))} placeholder="e.g. Safety" />
          <FormField label="Designation" value={form.designation} onChange={value => setForm((current: any) => ({ ...current, designation: value }))} placeholder="e.g. Supervisor" />
        </div>
      <FormField
        label="Wears Spectacles?"
        value={form.has_spectacles}
        onChange={value => {
          setForm((current: any) => ({ ...current, has_spectacles: value }));
          setError('');
          resetFaceUploads();
        }}
        options={[
          { value: '', label: 'Select option' },
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ]}
      />
        <FormField
          label="Site"
          value={String(form.site_id)}
          onChange={value => setForm((current: any) => ({ ...current, site_id: value }))}
          options={sites.map(site => ({ value: String(site.id), label: site.site_name }))}
        />
        {form.has_spectacles ? (
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Face Photos ({requiredCount} {form.has_spectacles === 'yes' ? 'with spectacles' : 'without spectacles'})
            </label>
            <div className="relative">
              <FolderOpen size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                key={fileInputKey}
                type="file"
                accept="image/*"
                multiple
                onChange={event => {
                  const files = Array.from(event.target.files ?? []);
                  setError('');
                  setFaceFiles(files);
                }}
                className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Selected {faceFiles.length} photo(s).</p>
            {faceFiles.length > 0 && faceFiles.length !== requiredCount && (
              <p className="text-[11px] text-red-500 mt-1">Please select exactly {requiredCount} photos.</p>
            )}
            {showEdit && faceFiles.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1">Leave empty to keep existing photos.</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">Select spectacles status to upload face photos.</p>
        )}
      <FormActions onCancel={closeForms} loading={saving} />
    </form>
  );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin ? 'Register personnel for face recognition and PPE monitoring' : 'Manage employees for your assigned site'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {canWrite && <button onClick={() => { setForm({ ...emptyForm, site_id: assignedSiteId ? String(assignedSiteId) : '' }); setError(''); resetFaceUploads(); setShowAdd(true); }} style={{ backgroundColor: '#005baa' }} className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 shadow-sm">
            <Plus size={16} /> Add Employee
          </button>}
        </div>
      </div>
      {isReadOnly && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Read-only access: you can view employees, but you cannot add, edit, or delete them.</div>}

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
            placeholder="Search by name, ID or dept..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        {isAdmin && users.length > 0 && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Client</span>
            <select value={selectedUserId} onChange={event => {
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set('user', event.target.value);
              else params.delete('user');
              setSearchParams(params);
            }} className="text-slate-700 text-sm bg-transparent outline-none">
              <option value="">All</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
        )}
        {isAdmin && users.length === 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
            Assign a client user to a site in Clients before filtering by client.
          </span>
        )}
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} employees</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-slate-500">No employees found. Add your first employee above.</p></div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 font-medium">ID / Dept</th>
                <th className="px-5 py-3 font-medium">Site</th>
                {isAdmin && <th className="px-5 py-3 font-medium text-center">Client Access</th>}
                <th className="px-5 py-3 font-medium text-center">FRS Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(employee => (
                <tr key={employee.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {employee.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{employee.name}</p>
                        {employee.designation && <p className="text-xs text-slate-400">{employee.designation}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs text-slate-600">{employee.employee_code || '-'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{employee.department || '-'}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{employee.sites?.site_name || '-'}</td>
                  {isAdmin && <td className="px-5 py-4 text-center text-xs font-medium text-blue-700">{employee.linked_users ?? 0}</td>}
                  <td className="px-5 py-4 text-center">
                    {employee.face_registered
                      ? <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><UserCheck size={13} />Enrolled</span>
                      : <span className="inline-flex items-center gap-1 text-slate-400 text-xs"><UserX size={13} />Not Enrolled</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setSelected(employee); setShowView(true); }} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="View"><Eye size={15} /></button>
                      {canWrite && <button onClick={() => { setSelected(employee); setForm({ name: employee.name, employee_code: employee.employee_code ?? '', department: employee.department ?? '', designation: employee.designation ?? '', site_id: String(employee.site_id ?? ''), has_spectacles: employee.has_spectacles ? 'yes' : 'no' }); resetFaceUploads(); setShowEdit(true); }} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Edit"><Edit2 size={15} /></button>}
                      {canWrite && <button onClick={() => { setSelected(employee); setShowDelete(true); }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={closeForms} title="Add Employee">{renderEmpForm(handleAdd)}</Modal>
      <Modal isOpen={showView} onClose={() => setShowView(false)} title="Employee Details">
        {selected && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                {selected.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{selected.name}</p>
                <p className="text-sm text-slate-500">{selected.designation || 'No designation'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Employee ID', selected.employee_code ?? '-'],
                ['Department', selected.department ?? '-'],
                ['Site', selected.sites?.site_name ?? '-'],
                ...(isAdmin ? [['Clients With Access', String(selected.linked_users ?? 0)] as [string, string]] : []),
                ['FRS Status', selected.face_registered ? 'Enrolled' : 'Not Enrolled'],
                ['Spectacles', selected.has_spectacles ? 'Yes' : 'No'],
                ['Photos', Array.isArray(selected.face_image_paths) ? String(selected.face_image_paths.length) : '0'],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">{label}</p>
                  <p className="text-sm font-medium text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={showEdit} onClose={closeForms} title={`Edit: ${selected?.name}`}>{renderEmpForm(handleEdit)}</Modal>
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Remove Employee" maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto"><Trash2 size={24} className="text-red-500" /></div>
          <div><p className="font-medium text-slate-800">Remove "{selected?.name}"?</p><p className="text-sm text-slate-500 mt-1">This will archive the employee record.</p></div>
          <div className="flex gap-3">
            <button onClick={() => setShowDelete(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium disabled:opacity-50">{saving ? 'Removing...' : 'Remove'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
