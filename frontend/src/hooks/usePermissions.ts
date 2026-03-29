import { useMemo } from 'react';
import { useAuth } from './useAuth';

export const usePermissions = () => {
  const { appUser } = useAuth();

  return useMemo(() => {
    const isAdmin = appUser?.role === 'admin';
    const accessLevel = appUser?.access_level ?? 'full_access';

    return {
      isAdmin,
      accessLevel,
      isReadOnly: !isAdmin && accessLevel === 'read_only',
      canWrite: isAdmin || accessLevel === 'full_access',
    };
  }, [appUser]);
};
