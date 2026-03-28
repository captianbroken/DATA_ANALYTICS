import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, Search, Edit2, Trash2, ShieldCheck, Shield, Eye, EyeOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FormActions, FormField, Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';

interface RoleRecord {
  id: number;
  role_name: 'admin' | 'user';
}

interface SiteRecord {
  id: number;
  site_name: string;
}

interface UserRecord {
  id: number;
  auth_user_id: string | null;
  name: string;
  email: string;
  status: string;
  is_deleted: boolean;
  last_login: string | null;
  role_id: number | null;
  site_id: number | null;
  role_name?: 'admin' | 'user';
}

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role_name: 'user',
  status: 'active',
  site_id: '',
};

const getRoleName = (user: UserRecord) => {
  return user.role_name ?? 'user';
};

const formatLastLogin = (value: string | null) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
};

const UsersPage = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [roleFilter, setRoleFilter] = useState<'All' | 'admin' | 'user'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [overviewUser, setOverviewUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [siteAssignmentAvailable, setSiteAssignmentAvailable] = useState(true);
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const [
      { data: userData, error: usersError },
      { data: roleData, error: rolesError },
      { data: siteData, error: sitesError },
    ] = await Promise.all([
      supabase.rpc('list_dashboard_users'),
      supabase.rpc('list_dashboard_roles'),
      supabase.rpc('list_dashboard_sites'),
    ]);

    if (usersError) setError(usersError.message);
    if (rolesError && !usersError) setError(rolesError.message);
    if (sitesError && !usersError && !rolesError) setError(sitesError.message);
    if (userData) {
      setUsers((userData as UserRecord[]).filter(user => !user.is_deleted));
    }
    if (roleData) setRoles(roleData as RoleRecord[]);
    if (siteData) setSites(siteData as SiteRecord[]);
    setSiteAssignmentAvailable(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  const siteNameById = useMemo(
    () => new Map(sites.map(site => [site.id, site.site_name])),
    [sites],
  );

  const getUserSiteName = (user: UserRecord) => {
    if (getRoleName(user) === 'admin') return 'Global access';
    if (!user.site_id) return 'Unassigned';
    return siteNameById.get(user.site_id) ?? 'Unassigned';
  };

  const filtered = users.filter(user => {
    const roleName = getRoleName(user);
    const matchSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      getUserSiteName(user).toLowerCase().includes(search.toLowerCase()) ||
      roleName.toLowerCase().includes(search.toLowerCase()) ||
      user.status.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'All' || roleName === roleFilter;
    const matchStatus = statusFilter === 'All' || user.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const totalUsers = users.length;
  const adminUsers = users.filter(user => getRoleName(user) === 'admin').length;
  const standardUsers = users.filter(user => getRoleName(user) === 'user').length;
  const activeUsers = users.filter(user => user.status === 'active').length;
  const inactiveUsers = users.filter(user => user.status === 'inactive').length;

  const closeForms = () => {
    setShowAdd(false);
    setShowEdit(false);
    setSelected(null);
    setForm(emptyForm);
    setShowPassword(false);
    setError('');
  };

  const openOverview = (user: UserRecord) => {
    setOverviewUser(user);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const createPayload: Record<string, any> = {
      p_name: form.name.trim(),
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password,
      p_role_name: form.role_name,
      p_status: form.status,
    };
    if (siteAssignmentAvailable) {
      createPayload.p_site_id = form.role_name === 'user' ? Number(form.site_id || 0) || null : null;
    }

    const { error: rpcError } = await supabase.rpc('create_dashboard_user', createPayload);

    if (rpcError) {
      setError(rpcError.message);
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

    const updatePayload: Record<string, any> = {
      p_user_id: selected.id,
      p_name: form.name.trim(),
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password.trim() || null,
      p_role_name: form.role_name,
      p_status: form.status,
    };
    if (siteAssignmentAvailable) {
      updatePayload.p_site_id = form.role_name === 'user' ? Number(form.site_id || 0) || null : null;
    }

    const { error: rpcError } = await supabase.rpc('update_dashboard_user', updatePayload);

    if (rpcError) {
      setError(rpcError.message);
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

    const { error: rpcError } = await supabase.rpc('soft_delete_dashboard_user', {
      p_user_id: selected.id,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setShowDelete(false);
      setSelected(null);
      await fetchAll();
    }

    setSaving(false);
  };

  const renderUserForm = (onSubmit: (event: React.FormEvent) => void, isEdit = false) => (
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
      <FormField
        label="Full Name"
        value={form.name}
        onChange={value => setForm(current => ({ ...current, name: value }))}
        placeholder="e.g. Admin User"
        required
      />
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Email<span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="email"
          name={isEdit ? 'edit-user-email' : 'create-user-email'}
          autoComplete="off"
          value={form.email}
          onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
          placeholder="e.g. admin@hyperspark.io"
          required
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          {isEdit ? 'Password (Optional)' : 'Password'}{!isEdit && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name={isEdit ? 'edit-user-password' : 'create-user-password'}
            autoComplete={isEdit ? 'new-password' : 'new-password'}
            value={form.password}
            onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
            placeholder={isEdit ? 'Leave blank to keep current password' : 'Enter a login password'}
            required={!isEdit}
            className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword(value => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Role"
          value={form.role_name}
          onChange={value => setForm(current => ({ ...current, role_name: value, site_id: value === 'admin' ? '' : current.site_id }))}
          options={(roles.length ? roles : [{ id: 1, role_name: 'admin' }, { id: 2, role_name: 'user' }]).map(role => ({
            value: role.role_name,
            label: role.role_name,
          }))}
        />
        <FormField
          label="Status"
          value={form.status}
          onChange={value => setForm(current => ({ ...current, status: value }))}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </div>
      {siteAssignmentAvailable && (
        <FormField
          label="Assigned Site"
          value={form.site_id}
          onChange={value => setForm(current => ({ ...current, site_id: value }))}
          options={sites.map(site => ({ value: String(site.id), label: site.site_name }))}
        />
      )}
      {!siteAssignmentAvailable && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Site assignment is unavailable until the latest database migration is applied.
        </p>
      )}
      {siteAssignmentAvailable && sites.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          No sites exist yet. You can create the user now and assign a site later.
        </p>
      )}
      {form.role_name === 'user' && siteAssignmentAvailable && (
        <p className="text-xs text-slate-400">
          Standard users can be assigned to a site now or later. If a site is assigned, they will only see that site's cameras, edge servers, employees, events, violations, and dashboard data.
        </p>
      )}
      <FormActions onCancel={closeForms} loading={saving} submitLabel={isEdit ? 'Update User' : 'Create User'} />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Users</h1>
          <p className="text-slate-500 text-sm mt-1">Manage dashboard access and roles</p>
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
              setSelected(null);
              setOverviewUser(null);
              setForm(emptyForm);
              setShowPassword(false);
              setError('');
              setShowAdd(true);
            }}
            style={{ backgroundColor: '#005baa' }}
            className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus size={16} /> Add User
          </button>
        </div>
      </div>

      {error && !showAdd && !showEdit && !showDelete && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                params.set('q', value);
              } else {
                params.delete('q');
              }
              setSearchParams(params);
            }}
            placeholder="Search users..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <Shield size={13} className="text-slate-400" />
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as 'All' | 'admin' | 'user')} className="text-slate-700 text-sm bg-transparent outline-none">
            {['All', 'admin', 'user'].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'All' | 'active' | 'inactive')} className="text-slate-700 text-sm bg-transparent outline-none">
            {['All', 'active', 'inactive'].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">{filtered.length} users</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Total Users</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Admins</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{adminUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Standard Users</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{standardUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{activeUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Inactive</p>
          <p className="text-2xl font-bold text-slate-500 mt-1">{inactiveUsers}</p>
        </div>
      </div>

      {overviewUser && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {overviewUser.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{overviewUser.name}</p>
                <p className="text-sm text-slate-500">{overviewUser.email}</p>
              </div>
            </div>
            <button
              onClick={() => setOverviewUser(null)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Close overview"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            {[
                ['Role', getRoleName(overviewUser)],
              ['Assigned Site', getUserSiteName(overviewUser)],
              ['Status', overviewUser.status],
              ['Last Login', formatLastLogin(overviewUser.last_login)],
              ['Auth Linked', overviewUser.auth_user_id ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => navigate(`/users/${overviewUser.id}`)}
              className="px-4 py-2 text-sm rounded-lg text-white"
              style={{ backgroundColor: '#005baa' }}
            >
              Open Full Profile
            </button>
            <button
              onClick={() => {
                setSelected(overviewUser);
                setForm({
                  name: overviewUser.name,
                  email: overviewUser.email,
                  password: '',
                  role_name: getRoleName(overviewUser),
                  status: overviewUser.status ?? 'active',
                  site_id: String(overviewUser.site_id ?? ''),
                });
                setError('');
                setShowEdit(true);
              }}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Edit User
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 font-medium">No users found</p>
            <p className="text-slate-400 text-sm mt-1">Create your first login-enabled user above.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Assigned Site</th>
                <th className="px-5 py-3 font-medium text-center">Role</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium">Last Login</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const roleName = getRoleName(user);
                const isActive = user.status === 'active';

                return (
                  <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                          {user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
                        </div>
                        <p className="font-medium text-slate-800">{user.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{user.email}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{getUserSiteName(user)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${roleName === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {roleName === 'admin' ? <ShieldCheck size={10} /> : <Shield size={10} />}
                        {roleName}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-400">{formatLastLogin(user.last_login)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openOverview(user)}
                          className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                          title="View Overview"
                        >
                          <Eye size={16} />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => {
                                setSelected(user);
                                setForm({
                                  name: user.name,
                                  email: user.email,
                                  password: '',
                                  role_name: getRoleName(user),
                                  status: user.status ?? 'active',
                                  site_id: String(user.site_id ?? ''),
                                });
                                setError('');
                                setShowEdit(true);
                              }}
                              className="p-2 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                              title="Edit User"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setSelected(user);
                                setShowDelete(true);
                              }}
                              className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                              title="Remove User"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={closeForms} title="Add User">
        {renderUserForm(handleAdd)}
      </Modal>


      <Modal isOpen={showEdit} onClose={closeForms} title={`Edit: ${selected?.name}`}>
        {renderUserForm(handleEdit, true)}
      </Modal>

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Remove User" maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Remove "{selected?.name}"?</p>
            <p className="text-sm text-slate-500 mt-1">This will deactivate the login and archive the user row.</p>
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

export default UsersPage;
