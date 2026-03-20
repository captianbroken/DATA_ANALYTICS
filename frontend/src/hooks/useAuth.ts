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

const clearStoredSession = () => {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('hyperspark_user');
  localStorage.removeItem('hyperspark_fallback_auth');
};

const readStoredSession = () => {
  const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    clearStoredSession();
    return null;
  }
};

const persistSession = (value: AppSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  sessionStorage.removeItem(SESSION_KEY);
};

export const useAuth = () => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAppUser = async (email?: string | null) => {
      if (!email || !isSupabaseConfigured) {
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

      if (!userRecord || !roleName || userRecord.status !== 'active') {
        return null;
      }

      return {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: roleName as 'admin' | 'user',
        site_id: userRecord.site_id ?? null,
        status: userRecord.status,
      } satisfies AppUser;
    };

    const bootstrap = async () => {
      const stored = readStoredSession();

      if (!stored?.user?.email) {
        clearStoredSession();
        setSession(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      if (stored.app_user?.email && stored.app_user.id) {
        setSession(stored);
        setAppUser(stored.app_user);
        setLoading(false);
        return;
      }

      const nextUser = await loadAppUser(stored.user.email);
      if (!nextUser) {
        clearStoredSession();
        setSession(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      const nextSession: AppSession = {
        ...stored,
        app_user: nextUser,
      };

      persistSession(nextSession);
      setSession(nextSession);
      setAppUser(nextUser);
      setLoading(false);
    };

    void bootstrap();
  }, []);

  return { session, appUser, loading };
};
