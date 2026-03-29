import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, Mail, Eye, EyeOff, Shield, Camera, Cpu, AlertTriangle } from 'lucide-react';
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
  const features = [
    {
      icon: Camera,
      title: 'Unified surveillance',
      copy: 'Monitor camera infrastructure, site activity, and operational coverage from one secure workspace.',
    },
    {
      icon: Shield,
      title: 'Role-based access',
      copy: 'Provide controlled access for administrators, operators, and site-level users with governed permissions.',
    },
    {
      icon: AlertTriangle,
      title: 'Incident awareness',
      copy: 'Track alerts, safety violations, and operational exceptions with immediate visibility and traceability.',
    },
    {
      icon: Cpu,
      title: 'Edge-ready operations',
      copy: 'Support distributed monitoring environments with resilient infrastructure and low-latency processing.',
    },
  ];

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
    <div className="login-shell relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex">
        <section className="hidden lg:flex lg:w-[56%] xl:w-[60%] px-10 xl:px-16 py-10 items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-5 mb-10">
              <HypersparkWordmark
                className="h-14 w-auto max-w-[260px] object-contain"
                style={{ filter: 'brightness(1.55) contrast(1.22) saturate(1.1) drop-shadow(0 10px 24px rgba(0, 173, 239, 0.2))' }}
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-sky-300 font-bold">AI MONITORING PLATFORM</p>
                <p className="text-sm text-slate-400 mt-1">Enterprise safety and monitoring operations</p>
              </div>
            </div>

            <div className="mb-10">
              <p className="text-sky-300 text-sm font-semibold uppercase tracking-[0.24em] mb-4">Operational Control</p>
              <h1 className="text-5xl leading-tight font-bold text-white max-w-xl">
                Intelligent monitoring
                <span className="block text-[#8addff]">for modern operations.</span>
              </h1>
              <p className="mt-5 text-lg text-slate-300 max-w-xl leading-8">
                Access the Hyperspark control center for site visibility, camera oversight, alert management, and security operations across your organization.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map(feature => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="auth-feature-card rounded-[1.4rem] p-5">
                    <div className="mb-4 h-11 w-11 rounded-2xl brand-gradient flex items-center justify-center shadow-brand">
                      <Icon size={20} className="text-white" />
                    </div>
                    <h2 className="text-white text-lg font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-md relative z-10">
            <div className="lg:hidden flex flex-col items-center text-center mb-7">
              <HypersparkWordmark
                className="h-12 w-auto max-w-[240px] object-contain mb-4"
                style={{ filter: 'brightness(1.55) contrast(1.22) saturate(1.1) drop-shadow(0 10px 24px rgba(0, 173, 239, 0.2))' }}
              />
              <p className="text-[11px] uppercase tracking-[0.32em] text-sky-300 font-bold mb-1">AI MONITORING DASHBOARD</p>
              <p className="text-slate-400 text-sm">Secure access to the Hyperspark control center</p>
            </div>

            <div className="login-panel rounded-[1.75rem] p-7 sm:p-8">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-2xl brand-gradient flex items-center justify-center shadow-brand">
                    <Shield size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white text-2xl font-semibold">Welcome back</p>
                    <p className="text-slate-400 text-sm">Sign in to continue to your dashboard</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-5 p-4 bg-red-500/10 border border-red-400/20 text-red-200 rounded-2xl text-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={17} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                  {debugInfo && (
                    <pre className="whitespace-pre-wrap text-[11px] leading-4 text-red-100/75 bg-black/10 border border-red-400/10 rounded-xl p-2">{debugInfo}</pre>
                  )}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-[0.24em] mb-2">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      className="login-input w-full pl-10 pr-4 py-3 rounded-2xl transition-all text-sm"
                      placeholder="admin@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-[0.24em] mb-2">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="login-input w-full pl-10 pr-10 py-3 rounded-2xl transition-all text-sm"
                      placeholder="Enter your password"
                    />
                    <button type="button" onClick={() => setShowPwd(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white font-semibold py-3.5 rounded-2xl transition-all shadow-brand hover:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm brand-gradient"
                >
                  {loading ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing In...</>
                  ) : 'Sign In to Dashboard'}
                </button>
              </form>

              <div className="mt-6 rounded-2xl bg-white/5 border border-white/8 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-300 font-semibold mb-1">Secure Access</p>
                <p className="text-xs text-slate-400">
                  Access to this platform is controlled, monitored, and intended for authorized personnel only.
                </p>
              </div>
              <p className="mt-6 text-center text-xs text-slate-500">
                Secured by Hyperspark AI Security - all access is logged
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
