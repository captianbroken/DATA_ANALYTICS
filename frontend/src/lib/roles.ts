export type AppRole = 'super_admin' | 'admin' | 'user';

export const isSuperAdminRole = (role?: string | null): role is 'super_admin' => role === 'super_admin';

export const isClientAdminRole = (role?: string | null): role is 'admin' => role === 'admin';

export const isClientUserRole = (role?: string | null): role is 'user' => role === 'user';

export const isAdminRole = (role?: string | null): role is 'super_admin' | 'admin' =>
  role === 'super_admin' || role === 'admin';

export const canAccessTenantOperations = (role?: string | null) => role === 'admin' || role === 'user';

export const canAccessClientDirectory = (role?: string | null) => role === 'super_admin' || role === 'admin';

export const canAccessAdminSearch = (role?: string | null) => role === 'admin';

export const getRoleLabel = (role?: string | null) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Client Admin';
  if (role === 'user') return 'Client User';
  return 'Client User';
};

export const getAccessLevelLabel = (accessLevel?: string | null) => {
  if (accessLevel === 'full_access') return 'Manager';
  if (accessLevel === 'read_only') return 'Supervisor';
  return 'Supervisor';
};

export const getScopeSiteId = <T extends { role?: string | null; site_id?: number | null }>(user?: T | null) => {
  if (!user || isSuperAdminRole(user.role)) return null;
  return user.site_id ?? null;
};
