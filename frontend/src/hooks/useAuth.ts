import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { selectUsersWithOptionalSite } from '../lib/userQueries';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  site_id: number | null;
  status: string;
}

export interface AppSession {
  user: {
    email: string;
  };
  created_at: string;
  app_user?: AppUser;
}

const SESSION_KEY = 'hyperspark_session';

export const useAuth = () => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAppUser = async (email?: string | null) => {
      if (!email || !isSupabaseConfigured) {
        setAppUser(null);
        return null;
      }

      const { data: userRecord } = await selectUsersWithOptionalSite<any>(
        'id, name, email, status, is_deleted, site_id, roles(role_name)',
        'id, name, email, status, is_deleted, roles(role_name)',
        query => query.eq('email', email).eq('is_deleted', false).single(),
      );

      const roleName = Array.isArray(userRecord?.roles)
        ? userRecord.roles[0]?.role_name
        : ((userRecord?.roles ?? null) as unknown as { role_name?: string } | null)?.role_name;

      if (userRecord && roleName && userRecord.status === 'active') {
        const nextUser = {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
          role: roleName as 'admin' | 'user',
          site_id: userRecord.site_id ?? null,
          status: userRecord.status,
        };
        setAppUser(nextUser);
        return nextUser;
      }

      setAppUser(null);
      return null;
    };

    const bootstrap = async () => {
      localStorage.removeItem('hyperspark_user');
      localStorage.removeItem('hyperspark_fallback_auth');

      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        setSession(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as AppSession;
        if (parsed.app_user?.email && parsed.app_user?.id) {
          setAppUser(parsed.app_user);
          setSession(parsed);
          setLoading(false);
          return;
        }

        const nextUser = await loadAppUser(parsed.user?.email);
        if (nextUser) {
          const nextSession = { ...parsed, app_user: nextUser };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
          setSession(nextSession);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
          setSession(null);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
        setAppUser(null);
      }

      setLoading(false);
    };

    bootstrap();
  }, []);

  return { session, appUser, loading };
};
