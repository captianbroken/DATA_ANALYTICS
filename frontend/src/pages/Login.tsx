import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { HypersparkWordmark } from '../components/brand/HypersparkBrand';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toFriendlyError = (err: any) => {
    const message = err?.message || '';
    const code = err?.code || '';
    const details = err?.details || '';
    const hint = err?.hint || '';

    if (code === 'PGRST200' || /schema cache|schema/i.test(message)) {
      return 'Database schema not ready or not applied to this Supabase project. Run schema.sql and dashboard_migration.sql on the same project as VITE_SUPABASE_URL, then retry.';
    }

    if (code === '42501' || /permission denied/i.test(message)) {
      return 'Database permission error. Apply dashboard_migration.sql grants (or RLS policies) and retry.';
    }

    const extra = [details, hint].filter(Boolean).join(' ');
    if (code && extra) return `${message} (code: ${code}) ${extra}`;
    if (code) return `${message} (code: ${code})`;
    return message || 'Login failed. Check your credentials.';
  };

  const captureDebugInfo = (err: any) => {
    try {
      const payload = {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
        statusCode: err?.statusCode,
        name: err?.name,
      };
      setDebugInfo(JSON.stringify(payload, null, 2));
    } catch {
      setDebugInfo('Unable to serialize error details.');
    }
  };

  const isAuthUnavailableError = (err: any) => {
    const message = (err?.message ?? '').toString().toLowerCase();
    const code = (err?.code ?? '').toString().toLowerCase();
    return code === 'unexpected_failure' || message.includes('database error querying schema');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDebugInfo(null);

    try {
      // Clear any stale fallback session before a new login attempt.
      localStorage.removeItem('hyperspark_user');
      localStorage.removeItem('hyperspark_fallback_auth');
      localStorage.removeItem('hyperspark_session');
      sessionStorage.removeItem('hyperspark_session');

      if (!isSupabaseConfigured) {
        throw new Error('The root .env file must contain a valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Update it and restart the app.');
      }

      const { data: loginRows, error: loginError } = await supabase.rpc('dashboard_login', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
      });

      if (loginError) throw loginError;
      const appUser = Array.isArray(loginRows) ? loginRows[0] : loginRows;
      if (!appUser) {
        throw new Error('Invalid email or password.');
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: appUser.email,
        password,
      });

      if (authError && !isAuthUnavailableError(authError)) throw authError;

      // We only update last_login if auth actually gave us an active session,
      // but we can try updating it anyway.
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', appUser.id);

      localStorage.setItem('hyperspark_session', JSON.stringify({
        user: { email: appUser.email },
        created_at: new Date().toISOString(),
        app_user: {
          id: appUser.id,
          email: appUser.email,
          name: appUser.name,
          role: appUser.role,
          site_id: appUser.site_id ?? null,
          status: appUser.status,
        },
      }));
      
      navigate('/', { replace: true });
    } catch (err: any) {
      localStorage.removeItem('hyperspark_user');
      localStorage.removeItem('hyperspark_fallback_auth');
      localStorage.removeItem('hyperspark_session');
      sessionStorage.removeItem('hyperspark_session');
      if (!isAuthUnavailableError(err)) {
        await supabase.auth.signOut();
      }
      setError(toFriendlyError(err));
      captureDebugInfo(err);
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#001f4d] to-slate-900 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, index) => (
          <div
            key={index}
            className="absolute rounded-full bg-white/5"
            style={{
              width: `${20 + index * 10}px`,
              height: `${20 + index * 10}px`,
              top: `${(index * 17) % 100}%`,
              left: `${(index * 23) % 100}%`,
              animationDelay: `${index * 0.3}s`,
            }}
          />
        ))}
      </div>

      <div className="relative max-w-md w-full">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-white rounded-xl px-6 py-4 shadow-sm mb-4 border border-slate-100">
              <HypersparkWordmark className="h-10 w-auto" />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.25em] font-bold mb-1">AI MONITORING DASHBOARD</p>
              <p className="text-slate-400 text-xs">Sign in to continue</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={17} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {debugInfo && (
                <pre className="whitespace-pre-wrap text-[11px] leading-4 text-red-500/80 bg-white/60 border border-red-100 rounded-lg p-2">{debugInfo}</pre>
              )}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm"
                  placeholder="admin@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm"
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPwd(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: loading ? '#94a3b8' : '#005baa' }}
              className="w-full text-white font-semibold py-3 rounded-xl transition-all shadow-sm hover:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing In...</>
              ) : 'Sign In to Dashboard'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Secured by Hyperspark AI Security - All access is logged
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
