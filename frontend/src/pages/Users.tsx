import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, Search, Edit2, Trash2, ShieldCheck, Shield, Eye, EyeOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toFriendlyErrorMessage } from '../lib/friendlyErrors';
import { getAccessLevelLabel, getRoleLabel, getScopeSiteId, isAdminRole, isSuperAdminRole, type AppRole } from '../lib/roles';
import type { SiteServiceStatus } from '../lib/siteServices';
import { scopeSitesForActor, scopeUsersForActor } from '../lib/tenantScope';
import { FormActions, FormField, Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';

interface SiteRecord {
  id: number;
  site_name: string;
}

interface AIServiceRecord {
  id: number;
  service_code: string;
  display_name: string;
  description: string;
}

interface SiteServiceRecord {
  id: number;
  site_id: number;
  service_id: number;
  service_code: string;
  display_name: string;
  status: SiteServiceStatus;
  notes: string;
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
  access_level?: 'full_access' | 'read_only';
  role_name?: AppRole;
}

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role_name: AppRole;
  access_level: 'full_access' | 'read_only';
  status: string;
  site_id: string;
  new_client_name: string;
  new_site_name: string;
  new_site_address: string;
  new_site_description: string;
}

const emptyForm: UserFormState = {
  name: '',
  email: '',
  password: '',
  role_name: 'user',
  access_level: 'read_only',
  status: 'active',
  site_id: '',
  new_client_name: '',
  new_site_name: '',
  new_site_address: '',
  new_site_description: '',
};

const getRoleName = (user: UserRecord): AppRole => {
  return user.role_name ?? 'user';
};

const getRoleFilterLabel = (role: 'admin' | 'user') => {
  return role === 'admin' ? 'Client Admin' : 'Client User';
};

const formatLastLogin = (value: string | null) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
};

const buildCombinedSiteName = (clientName: string, siteName: string) => {
  const normalizedClient = clientName.trim();
  const normalizedSite = siteName.trim();

  if (!normalizedClient) return normalizedSite;
  if (!normalizedSite) return normalizedClient;
  if (normalizedClient.toLowerCase() === normalizedSite.toLowerCase()) return normalizedClient;
  return `${normalizedClient} - ${normalizedSite}`;
};

const UsersPage = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [aiServices, setAiServices] = useState<AIServiceRecord[]>([]);
  const [siteServices, setSiteServices] = useState<SiteServiceRecord[]>([]);
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
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [siteAssignmentAvailable, setSiteAssignmentAvailable] = useState(true);
  const [serviceStatusByCode, setServiceStatusByCode] = useState<Record<string, SiteServiceStatus>>({});
  const { appUser } = useAuth();
  const isAdmin = isAdminRole(appUser?.role);
  const isSuperAdmin = isSuperAdminRole(appUser?.role);
  const assignedSiteId = getScopeSiteId(appUser);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const [
      { data: userData, error: usersError },
      { data: siteData, error: sitesError },
      { data: aiServiceData },
      { data: siteServiceData },
    ] = await Promise.all([
      supabase.rpc('list_dashboard_users'),
      supabase.rpc('list_dashboard_sites'),
      supabase.rpc('list_ai_services'),
      supabase.rpc('list_site_services'),
    ]);

    if (usersError) setError(toFriendlyErrorMessage(usersError, 'load_users'));
    if (sitesError && !usersError) setError(toFriendlyErrorMessage(sitesError, 'load_users'));
    if (userData) {
      setUsers(scopeUsersForActor(userData as UserRecord[], appUser));
    }
    if (siteData) {
      setSites(scopeSitesForActor(siteData as SiteRecord[], appUser));
    }
    if (aiServiceData) {
      setAiServices((aiServiceData as AIServiceRecord[]) ?? []);
    }
    if (siteServiceData) {
      setSiteServices((siteServiceData as SiteServiceRecord[]) ?? []);
    }
    setSiteAssignmentAvailable(true);
    setLoading(false);
  }, [appUser, assignedSiteId, isSuperAdmin]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const queryParam = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const focusedUserId = useMemo(() => {
    const raw = searchParams.get('focus');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }, [searchParams]);

  useEffect(() => {
    if (queryParam !== search) {
      setSearch(queryParam);
    }
  }, [queryParam]);

  useEffect(() => {
    if (!focusedUserId || users.length === 0) return;
    const focusedUser = users.find(user => user.id === focusedUserId && (isSuperAdmin ? getRoleName(user) === 'admin' : getRoleName(user) === 'user'));
    if (focusedUser) {
      setOverviewUser(focusedUser);
    }
  }, [focusedUserId, isSuperAdmin, users]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!showAdd && !showEdit) return;

    if (form.site_id === '__create_new__') {
      const defaults: Record<string, SiteServiceStatus> = {};
      aiServices.forEach(service => {
        defaults[service.service_code] = serviceStatusByCode[service.service_code] ?? 'inactive';
      });
      setServiceStatusByCode(defaults);
      return;
    }

    const siteId = Number(form.site_id || 0) || null;
    if (!siteId) return;
    setServiceStatusByCode(buildServiceStatusMap(siteId));
  }, [aiServices, form.site_id, isSuperAdmin, showAdd, showEdit, siteServices]);

  const siteNameById = useMemo(
    () => new Map(sites.map(site => [site.id, site.site_name])),
    [sites],
  );
  const activeServiceCount = useMemo(
    () => siteServices.filter(service => service.status === 'active').length,
    [siteServices],
  );
  const managedUsers = useMemo(
    () => users.filter(user => (isSuperAdmin ? getRoleName(user) === 'admin' : getRoleName(user) === 'user')),
    [isSuperAdmin, users],
  );
  const scopedSites = useMemo(
    () => (isSuperAdmin ? sites : sites.filter(site => site.id === assignedSiteId)),
    [assignedSiteId, isSuperAdmin, sites],
  );

  const getUserSiteName = (user: UserRecord) => {
    if (getRoleName(user) === 'super_admin') return 'Global access';
    if (!user.site_id) return 'Unassigned';
    return siteNameById.get(user.site_id) ?? 'Unassigned';
  };

  const isCreatingInlineSite = form.site_id === '__create_new__';
  const shouldShowInlineSiteBuilder = isSuperAdmin && form.role_name !== 'super_admin' && (isCreatingInlineSite || scopedSites.length === 0);
  const selectedServiceSiteId = !shouldShowInlineSiteBuilder && form.site_id && form.site_id !== '__create_new__'
    ? Number(form.site_id)
    : null;

  const filtered = managedUsers.filter(user => {
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

  const totalUsers = managedUsers.length;
  const adminUsers = isSuperAdmin
    ? managedUsers.filter(user => getRoleName(user) === 'admin').length
    : managedUsers.filter(user => (user.access_level ?? 'read_only') === 'full_access').length;
  const standardUsers = isSuperAdmin
    ? managedUsers.filter(user => getRoleName(user) === 'user').length
    : managedUsers.filter(user => (user.access_level ?? 'read_only') === 'read_only').length;
  const activeUsers = managedUsers.filter(user => user.status === 'active').length;
  const inactiveUsers = managedUsers.filter(user => user.status === 'inactive').length;

  const closeForms = () => {
    setShowAdd(false);
    setShowEdit(false);
    setSelected(null);
    setForm(emptyForm);
    setServiceStatusByCode({});
    setShowPassword(false);
    setError('');
  };

  const buildServiceStatusMap = (siteId?: number | null) => {
    const nextState: Record<string, SiteServiceStatus> = {};
    aiServices.forEach(service => {
      const existing = siteServices.find(item => item.site_id === siteId && item.service_code === service.service_code);
      nextState[service.service_code] = existing?.status ?? 'inactive';
    });
    return nextState;
  };

  const applySiteServices = async (siteId: number | null) => {
    if (!isSuperAdmin || !siteId) return;

    for (const service of aiServices) {
      const status = serviceStatusByCode[service.service_code] ?? 'inactive';
      const { error: serviceError } = await supabase.rpc('upsert_site_service', {
        p_site_id: siteId,
        p_service_code: service.service_code,
        p_status: status,
        p_notes: null,
      });

      if (serviceError) {
        throw serviceError;
      }
    }
  };

  const openOverview = (user: UserRecord) => {
    setOverviewUser(user);
    const params = new URLSearchParams(searchParams);
    params.set('focus', String(user.id));
    setSearchParams(params);
  };

  const closeOverview = () => {
    setOverviewUser(null);
    const params = new URLSearchParams(searchParams);
    params.delete('focus');
    setSearchParams(params);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    let resolvedSiteId: number | null = null;

    const effectiveRoleName: AppRole = isSuperAdmin ? 'admin' : 'user';

    if (siteAssignmentAvailable && (effectiveRoleName === 'user' || effectiveRoleName === 'admin')) {
      if (shouldShowInlineSiteBuilder) {
        if (!isSuperAdmin) {
          setError('Only the super admin can create a new client/site from this form.');
          setSaving(false);
          return;
        }
        if (!form.new_client_name.trim()) {
          setError('Client name is required when creating a new client.');
          setSaving(false);
          return;
        }
        if (!form.new_site_name.trim()) {
          setError('Site name is required when creating a new client.');
          setSaving(false);
          return;
        }

        const { data: createdSiteId, error: createSiteError } = await supabase.rpc('create_site', {
          p_site_name: buildCombinedSiteName(form.new_client_name, form.new_site_name),
          p_address: form.new_site_address.trim() || null,
          p_description: [form.new_client_name.trim() || null, form.new_site_description.trim() || null].filter(Boolean).join(' | ') || null,
          p_status: 'active',
        });

        if (createSiteError) {
          setError(toFriendlyErrorMessage(createSiteError, 'create_site'));
          setSaving(false);
          return;
        }

        resolvedSiteId = Number(createdSiteId);
      } else {
        resolvedSiteId = isSuperAdmin ? Number(form.site_id || 0) || null : assignedSiteId;
      }
    }

    if (!resolvedSiteId && !shouldShowInlineSiteBuilder) {
      setError('Client/Site is required for admin and user accounts.');
      setSaving(false);
      return;
    }

    const createPayload: Record<string, any> = {
      p_actor_email: appUser?.email ?? null,
      p_name: form.name.trim(),
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password,
      p_role_name: effectiveRoleName,
      p_status: form.status,
      p_access_level: effectiveRoleName === 'admin' ? 'full_access' : form.access_level,
    };
    if (siteAssignmentAvailable) {
      createPayload.p_site_id = isSuperAdmin ? resolvedSiteId : assignedSiteId;
    }

    const { error: rpcError } = await supabase.rpc('create_dashboard_user', createPayload);

    if (rpcError) {
      setError(toFriendlyErrorMessage(rpcError, 'create_user'));
    } else {
      try {
        await applySiteServices(resolvedSiteId);
        closeForms();
        await fetchAll();
      } catch (serviceError: any) {
        setError(toFriendlyErrorMessage(serviceError, 'update_user'));
      }
    }

    setSaving(false);
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError('');

    let resolvedSiteId: number | null = null;

    if (siteAssignmentAvailable) {
      if (shouldShowInlineSiteBuilder) {
        if (!isSuperAdmin) {
          setError('Only the super admin can create a new client/site from this form.');
          setSaving(false);
          return;
        }
        if (!form.new_client_name.trim()) {
          setError('Client name is required when creating a new client.');
          setSaving(false);
          return;
        }
        if (!form.new_site_name.trim()) {
          setError('Site name is required when creating a new client.');
          setSaving(false);
          return;
        }

        const { data: createdSiteId, error: createSiteError } = await supabase.rpc('create_site', {
          p_site_name: buildCombinedSiteName(form.new_client_name, form.new_site_name),
          p_address: form.new_site_address.trim() || null,
          p_description: [form.new_client_name.trim() || null, form.new_site_description.trim() || null].filter(Boolean).join(' | ') || null,
          p_status: 'active',
        });

        if (createSiteError) {
          setError(toFriendlyErrorMessage(createSiteError, 'create_site'));
          setSaving(false);
          return;
        }

        resolvedSiteId = Number(createdSiteId);
      } else {
        resolvedSiteId = isSuperAdmin ? (Number(form.site_id || 0) || null) : assignedSiteId;
      }
    }

    if (!resolvedSiteId && !shouldShowInlineSiteBuilder) {
      setError('Client/Site is required for admin and user accounts.');
      setSaving(false);
      return;
    }

    const updatePayload: Record<string, any> = {
      p_actor_email: appUser?.email ?? null,
      p_user_id: selected.id,
      p_name: form.name.trim(),
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password.trim() || null,
      p_role_name: isSuperAdmin ? 'admin' : 'user',
      p_status: form.status,
      p_access_level: isSuperAdmin ? 'full_access' : form.access_level,
    };
    if (siteAssignmentAvailable) {
      updatePayload.p_site_id = isSuperAdmin ? resolvedSiteId : assignedSiteId;
    }

    const { error: rpcError } = await supabase.rpc('update_dashboard_user', updatePayload);

    if (rpcError) {
      setError(toFriendlyErrorMessage(rpcError, 'update_user'));
    } else {
      try {
        await applySiteServices(isSuperAdmin ? resolvedSiteId : assignedSiteId);
        closeForms();
        await fetchAll();
      } catch (serviceError: any) {
        setError(toFriendlyErrorMessage(serviceError, 'update_user'));
      }
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;

    setSaving(true);
    setError('');

    const { error: rpcError } = await supabase.rpc('soft_delete_dashboard_user', {
      p_actor_email: appUser?.email ?? null,
      p_user_id: selected.id,
    });

    if (rpcError) {
      setError(toFriendlyErrorMessage(rpcError, 'delete_user'));
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
        placeholder="e.g. Acme Client Admin"
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
          placeholder="e.g. client.admin@company.com"
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
        label={isSuperAdmin ? 'Account Type' : 'User Role'}
        value={isSuperAdmin ? 'admin' : 'user'}
        onChange={() => undefined}
        options={[
          {
            value: isSuperAdmin ? 'admin' : 'user',
            label: isSuperAdmin ? 'Client Admin' : 'User',
          },
        ]}
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
      <FormField
        label={isSuperAdmin ? 'Admin Access' : 'User Access'}
        value={isSuperAdmin ? 'full_access' : form.access_level}
        onChange={value => setForm(current => ({ ...current, access_level: value as 'full_access' | 'read_only' }))}
        options={[
          { value: 'full_access', label: isSuperAdmin ? 'Full Access' : 'Manager' },
          { value: 'read_only', label: isSuperAdmin ? 'Read Only' : 'Supervisor' },
        ]}
      />
      {siteAssignmentAvailable && (
        <FormField
          label={isSuperAdmin ? 'Existing Site' : 'Assigned Site'}
          value={form.site_id}
          onChange={value => setForm(current => ({ ...current, site_id: value }))}
          options={[
            ...(isSuperAdmin ? [{ value: '', label: 'Select Existing Site' }] : []),
            ...scopedSites.map(site => ({ value: String(site.id), label: site.site_name })),
            ...(isSuperAdmin ? [{ value: '__create_new__', label: '+ Create New Client And Site' }] : []),
          ]}
        />
      )}
      {siteAssignmentAvailable && shouldShowInlineSiteBuilder && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Create Client And Primary Site</p>
          <FormField
            label="Client Company Name"
            value={form.new_client_name}
            onChange={value => setForm(current => ({ ...current, new_client_name: value }))}
            placeholder="e.g. Apollo Hospitals"
            required
          />
          <FormField
            label="Primary Site Name"
            value={form.new_site_name}
            onChange={value => setForm(current => ({ ...current, new_site_name: value }))}
            placeholder="e.g. Chennai Main Plant"
            required
          />
          <FormField
            label="Address"
            value={form.new_site_address}
            onChange={value => setForm(current => ({ ...current, new_site_address: value }))}
            placeholder="e.g. Anna Nagar, Chennai"
          />
          <FormField
            label="Description"
            value={form.new_site_description}
            onChange={value => setForm(current => ({ ...current, new_site_description: value }))}
            placeholder="Optional client/site notes"
          />
        </div>
      )}
      {isSuperAdmin && aiServices.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Client Services</p>
          <p className="text-xs text-slate-500">
            Activate only the AI services this client has paid for. Suspend or stop services anytime.
          </p>
          {selectedServiceSiteId || shouldShowInlineSiteBuilder ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiServices.map(service => (
                <FormField
                  key={service.service_code}
                  label={service.display_name}
                  value={serviceStatusByCode[service.service_code] ?? 'inactive'}
                  onChange={value => setServiceStatusByCode(current => ({
                    ...current,
                    [service.service_code]: value as SiteServiceStatus,
                  }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                    { value: 'inactive', label: 'Stopped' },
                  ]}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Select or create a client/site first, then assign the AI services for that client.
            </p>
          )}
        </div>
      )}
      {!siteAssignmentAvailable && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Site assignment is unavailable until the latest database migration is applied.
        </p>
      )}
      {siteAssignmentAvailable && sites.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          No site exists yet. Create the client company, its first site, and the client admin here itself. You do not need to leave this page.
        </p>
      )}
      {siteAssignmentAvailable && (
        <p className="text-xs text-slate-400">
          {isSuperAdmin
            ? 'Super admin creates the client admin and assigns a site. Client admins then create users under that site as Manager or Supervisor.'
            : 'You can create only users for your own assigned site. Use Manager for full access and Supervisor for read-only access.'}
        </p>
      )}
      <FormActions
        onCancel={closeForms}
        loading={saving}
        submitLabel={isEdit ? (isSuperAdmin ? 'Update Client' : 'Update Team Member') : (isSuperAdmin ? 'Create Client' : 'Create Team Member')}
      />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isSuperAdmin
              ? 'Manage client admins and tenant onboarding'
              : 'Manage users for your site as Manager or Supervisor'}
          </p>
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
              const defaultSiteId = isSuperAdmin && sites.length === 0 ? '__create_new__' : '';
              setForm({
                ...emptyForm,
                role_name: isSuperAdmin ? 'admin' : 'user',
                access_level: isSuperAdmin ? 'full_access' : 'read_only',
                site_id: defaultSiteId,
              });
              setServiceStatusByCode(buildServiceStatusMap(null));
              setShowPassword(false);
              setError('');
              setShowAdd(true);
            }}
            style={{ backgroundColor: '#005baa' }}
            className="text-white px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus size={16} /> {isSuperAdmin ? 'Add Client Admin' : 'Add User'}
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
            placeholder={isSuperAdmin ? 'Search client admins...' : 'Search users...'}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <Shield size={13} className="text-slate-400" />
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as 'All' | 'admin' | 'user')} className="text-slate-700 text-sm bg-transparent outline-none">
            {(isSuperAdmin ? ['All', 'admin'] : ['All', 'user']).map(option => (
              <option key={option} value={option}>
                {option === 'All' ? 'All' : getRoleFilterLabel(option as 'admin' | 'user')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'All' | 'active' | 'inactive')} className="text-slate-700 text-sm bg-transparent outline-none">
            {['All', 'active', 'inactive'].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">
          {filtered.length} {isSuperAdmin ? 'clients' : 'team members'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">{isSuperAdmin ? 'Total Client Accounts' : 'Total Team Members'}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">{isSuperAdmin ? 'Client Admins' : 'Managers'}</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{adminUsers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">{isSuperAdmin ? 'Active Services' : 'Supervisors'}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{isSuperAdmin ? activeServiceCount : standardUsers}</p>
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
              onClick={closeOverview}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Close overview"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            {[ 
              ['Role', getRoleLabel(getRoleName(overviewUser))],
              ['Assigned Site', getUserSiteName(overviewUser)],
              ['Access Level', getRoleName(overviewUser) === 'user' ? getAccessLevelLabel(overviewUser.access_level) : 'Full Access'],
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
                setServiceStatusByCode(buildServiceStatusMap(overviewUser.site_id ?? null));
                setForm({
                  ...emptyForm,
                  name: overviewUser.name,
                  email: overviewUser.email,
                  password: '',
                  role_name: getRoleName(overviewUser),
                  access_level: overviewUser.access_level ?? 'read_only',
                  status: overviewUser.status ?? 'active',
                  site_id: String(overviewUser.site_id ?? '__create_new__'),
                });
                setError('');
                setShowEdit(true);
              }}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              {isSuperAdmin ? 'Edit Client' : 'Edit Team Member'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading from database...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 font-medium">{isSuperAdmin ? 'No clients found' : 'No team members found'}</p>
            <p className="text-slate-400 text-sm mt-1">
              {isSuperAdmin ? 'Create your first client and client admin above.' : 'Create your first manager or supervisor above.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">{isSuperAdmin ? 'Client Admin' : 'Team Member'}</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Client / Site</th>
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
                        <button
                          type="button"
                          onClick={() => navigate(`/users/${user.id}`)}
                          className="font-medium text-slate-800 hover:text-blue-600 transition-colors text-left"
                        >
                          {user.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{user.email}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{getUserSiteName(user)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${roleName === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {roleName === 'admin' ? <ShieldCheck size={10} /> : <Shield size={10} />}
                        {getRoleLabel(roleName)}
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
                            {(isSuperAdmin || roleName === 'user') && (
                            <button
                              onClick={() => {
                                setSelected(user);
                                setServiceStatusByCode(buildServiceStatusMap(user.site_id ?? null));
                                setForm({
                                  ...emptyForm,
                                  name: user.name,
                                  email: user.email,
                                  password: '',
                                  role_name: getRoleName(user),
                                  access_level: user.access_level ?? 'read_only',
                                  status: user.status ?? 'active',
                                  site_id: String(user.site_id ?? '__create_new__'),
                                });
                                setError('');
                                setShowEdit(true);
                              }}
                              className="p-2 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                              title={isSuperAdmin ? 'Edit Client' : 'Edit Team Member'}
                            >
                              <Edit2 size={16} />
                            </button>
                            )}
                            {(isSuperAdmin || roleName === 'user') && (
                            <button
                              onClick={() => {
                                setSelected(user);
                                setShowDelete(true);
                              }}
                              className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                              title={isSuperAdmin ? 'Remove Client' : 'Remove Team Member'}
                            >
                              <Trash2 size={16} />
                            </button>
                            )}
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

      <Modal isOpen={showAdd} onClose={closeForms} title={isSuperAdmin ? 'Add Client' : 'Add Team Member'}>
        {renderUserForm(handleAdd)}
      </Modal>


      <Modal isOpen={showEdit} onClose={closeForms} title={`${isSuperAdmin ? 'Edit Client' : 'Edit Team Member'}: ${selected?.name}`}>
        {renderUserForm(handleEdit, true)}
      </Modal>

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title={isSuperAdmin ? 'Remove Client' : 'Remove Team Member'} maxWidth="max-w-sm">
        <div className="text-center space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div>
            <p className="font-medium text-slate-800">Remove "{selected?.name}"?</p>
            <p className="text-sm text-slate-500 mt-1">This will deactivate the login and archive the client account row.</p>
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
