import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { selectUsersWithOptionalSite } from '../lib/userQueries';
import type { AppRole } from '../lib/roles';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: AppRole;
  site_id: number | null;
  access_level: 'full_access' | 'read_only';
  status: string;
}

export interface AppSession {
  user: {
    email: string;
  };
  created_at: string;
  app_user?: AppUser;
}

interface AuthContextValue {
  session: AppSession | null;
  appUser: AppUser | null;
  loading: boolean;
  setAuthSession: (value: AppSession | null) => void;
  clearAuthSession: () => void;
}

const SESSION_KEY = 'hyperspark_session';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setAuthSession = (value: AppSession | null) => {
    if (!value) {
      clearStoredSession();
      setSession(null);
      setAppUser(null);
      setLoading(false);
      return;
    }

    persistSession(value);
    setSession(value);
    setAppUser(value.app_user ?? null);
    setLoading(false);
  };

  const clearAuthSession = () => {
    clearStoredSession();
    setSession(null);
    setAppUser(null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    const loadAppUser = async (email?: string | null) => {
      if (!email || !isSupabaseConfigured) {
        return null;
      }

      const { data: userRecord, error } = await selectUsersWithOptionalSite<any>(
        'id, name, email, status, is_deleted, site_id, access_level, roles(role_name)',
        'id, name, email, status, is_deleted, access_level, roles(role_name)',
        query => query.eq('email', email).eq('is_deleted', false).single(),
      );

      if (error) {
        return null;
      }

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
        role: roleName as AppRole,
        site_id: userRecord.site_id ?? null,
        access_level: (userRecord.access_level ?? 'full_access') as 'full_access' | 'read_only',
        status: userRecord.status,
      } satisfies AppUser;
    };

    const bootstrap = async () => {
      const stored = readStoredSession();

      if (!stored?.user?.email) {
        clearStoredSession();
        if (!active) return;
        setSession(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      if (stored.app_user?.email && stored.app_user.id) {
        if (!active) return;
        setSession(stored);
        setAppUser(stored.app_user);
        setLoading(false);
      }

      const nextUser = await loadAppUser(stored.user.email);
      if (!active) return;

      if (!nextUser) {
        if (stored.app_user?.email && stored.app_user.id) {
          return;
        }

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

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, appUser, loading, setAuthSession, clearAuthSession }),
    [session, appUser, loading],
  );

  return createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
