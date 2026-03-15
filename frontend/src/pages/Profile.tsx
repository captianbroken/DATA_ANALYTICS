import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Save, UserCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const ProfilePage = () => {
  const { appUser, session, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (appUser) {
      setName(appUser.name ?? '');
    }
  }, [appUser]);

  const isFallbackAuth = useMemo(() => localStorage.getItem('hyperspark_fallback_auth') === 'true', []);

  const displayEmail = appUser?.email || session?.user?.email || '';

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400 animate-pulse">
        Loading profile...
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">
        Please sign in to view your profile.
      </div>
    );
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', appUser.id);

    if (updateError) {
      setError(updateError.message || 'Failed to update profile.');
      setSaving(false);
      return;
    }

    const updated = { ...appUser, name: name.trim() };
    localStorage.setItem('hyperspark_user', JSON.stringify(updated));
    setSuccess('Profile updated successfully.');
    setSaving(false);
  };

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!session || isFallbackAuth) {
      setError('Password change requires a valid Supabase auth session. Please re-login.');
      return;
    }

    setPwdLoading(true);
    const { error: pwdError } = await supabase.auth.updateUser({ password });
    if (pwdError) {
      setError(pwdError.message || 'Failed to update password.');
      setPwdLoading(false);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setSuccess('Password updated successfully.');
    setPwdLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="text-sm text-slate-500 hover:text-slate-700">
          Back
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-800">My Profile</h1>
        <div className="flex-1" />
        <button
          onClick={handleBack}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      {(error || success) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {error || success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {appUser.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">{appUser.name}</p>
            <p className="text-sm text-slate-500">{appUser.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Full Name</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
            <input
              value={displayEmail}
              readOnly
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600">
              <UserCircle size={14} /> {appUser.role}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
            <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600">
              {appUser.status}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4 gap-2">
          <button
            onClick={() => setName(appUser.name ?? '')}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            style={{ backgroundColor: '#005baa' }}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-slate-800">Change Password</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">New Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="Re-enter new password"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <button
            onClick={() => {
              setPassword('');
              setConfirmPassword('');
            }}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            onClick={handleChangePassword}
            disabled={pwdLoading}
            style={{ backgroundColor: '#005baa' }}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            <Lock size={14} /> {pwdLoading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
        {(isFallbackAuth || !session) && (
          <p className="text-xs text-slate-400 mt-3">
            Password change requires a valid Supabase session. Please log in again if this stays disabled.
          </p>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
