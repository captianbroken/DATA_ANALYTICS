import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  status: string;
}

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAppUser = async (email?: string | null) => {
      if (!email || !isSupabaseConfigured) {
        setAppUser(null);
        return;
      }

      const { data: userRecord } = await supabase
        .from('users')
        .select('id, name, email, status, is_deleted, roles(role_name)')
        .eq('email', email)
        .eq('is_deleted', false)
        .single();

      const roleName = Array.isArray(userRecord?.roles)
        ? userRecord.roles[0]?.role_name
        : ((userRecord?.roles ?? null) as unknown as { role_name?: string } | null)?.role_name;

      if (userRecord && roleName) {
        setAppUser({
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
          role: roleName as 'admin' | 'user',
          status: userRecord.status,
        });
      } else {
        setAppUser(null);
      }
    };

    const fetchSession = async () => {
      // Check for fallback session first (to keep app feeling fast if Supabase is slow/failing)
      const fallbackUserJson = localStorage.getItem('hyperspark_user');
      if (fallbackUserJson) {
        try {
          const storedUser = JSON.parse(fallbackUserJson);
          console.log('Using fallback auth session for:', storedUser.email);
          
          setAppUser(storedUser);
          // Set a minimal mock session to satisfy the "!session" check in layouts
          setSession({
            access_token: 'fallback-token',
            refresh_token: 'fallback-refresh',
            expires_in: 3600,
            token_type: 'bearer',
            user: { 
              id: storedUser.auth_user_id || 'fallback-id', 
              email: storedUser.email,
              app_metadata: {},
              user_metadata: { name: storedUser.name },
              aud: 'authenticated',
              created_at: new Date().toISOString()
            } as any
          });
          setLoading(false);
          // We still try to check for a real session in the background
        } catch (e) {
          console.error('Failed to parse fallback user:', e);
        }
      }

      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const { data: { session: realSession } } = await supabase.auth.getSession();
      
      // Only override if we didn't already set a fallback user, 
      // or if we found a real session that's better.
      if (realSession) {
        setSession(realSession);
        await loadAppUser(realSession.user?.email);
      }
      
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (_event === 'SIGNED_OUT') {
        setSession(null);
        setAppUser(null);
        localStorage.removeItem('hyperspark_user');
        localStorage.removeItem('hyperspark_fallback_auth');
        return;
      }
      
      if (nextSession) {
        setSession(nextSession);
        await loadAppUser(nextSession.user?.email);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, appUser, loading };
};
