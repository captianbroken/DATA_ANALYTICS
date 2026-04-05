import { type AppRole, isSuperAdminRole } from './roles';

interface ScopedActor {
  role?: AppRole | null;
  site_id?: number | null;
}

interface SiteLike {
  id: number;
}

interface UserLike {
  site_id?: number | null;
  role_name?: string | null;
  is_deleted?: boolean;
}

export const scopeSitesForActor = <T extends SiteLike>(sites: T[], actor?: ScopedActor | null) => {
  if (!actor) return [];
  if (isSuperAdminRole(actor.role)) return sites;
  if (!actor.site_id) return [];
  return sites.filter(site => site.id === actor.site_id);
};

export const scopeUsersForActor = <T extends UserLike>(users: T[], actor?: ScopedActor | null) => {
  const activeUsers = users.filter(user => !user.is_deleted);
  if (!actor) return [];
  if (isSuperAdminRole(actor.role)) return activeUsers;
  if (!actor.site_id) return [];
  return activeUsers.filter(user => user.site_id === actor.site_id && user.role_name !== 'super_admin');
};

export const canInspectUserForActor = <T extends UserLike>(user: T | null | undefined, actor?: ScopedActor | null) => {
  if (!user || !actor) return false;
  if (isSuperAdminRole(actor.role)) return true;
  if (!actor.site_id) return false;
  return user.site_id === actor.site_id && user.role_name !== 'super_admin';
};
