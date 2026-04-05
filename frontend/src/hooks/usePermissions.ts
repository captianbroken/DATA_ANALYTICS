import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { isAdminRole, isSuperAdminRole } from '../lib/roles';

export const usePermissions = () => {
  const { appUser } = useAuth();

  return useMemo(() => {
    const isAdmin = isAdminRole(appUser?.role);
    const isSuperAdmin = isSuperAdminRole(appUser?.role);
    const accessLevel = appUser?.access_level ?? 'full_access';

    return {
      isAdmin,
      isSuperAdmin,
      accessLevel,
      isReadOnly: !isAdmin && accessLevel === 'read_only',
      canWrite: isAdmin || accessLevel === 'full_access',
    };
  }, [appUser]);
};
