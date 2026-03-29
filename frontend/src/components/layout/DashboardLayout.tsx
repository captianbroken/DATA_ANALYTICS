import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '../../hooks/useAuth';

const DashboardLayout = () => {
  const { session, loading, appUser } = useAuth();

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-3xl px-8 py-7 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-200/20 border-t-[#00adef] rounded-full animate-spin" />
          <p className="text-slate-300 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if no authenticated app user/session is available
  if (!session || !appUser) {
    return <Navigate to="/login" replace />;
  }

  const role = appUser.role;

  return (
    <div className="app-shell flex min-h-screen overflow-hidden">
      <Sidebar role={role} userName={appUser?.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header userName={appUser?.name} role={role} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
