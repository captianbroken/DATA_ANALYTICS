import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardOverview from './pages/dashboard/DashboardOverview';
import SitesPage from './pages/Sites';
import CamerasPage from './pages/Cameras';
import EdgeServersPage from './pages/EdgeServers';
import EmployeesPage from './pages/Employees';
import EventsPage from './pages/Events';
import ViolationsPage from './pages/Violations';
import UsersPage from './pages/Users';
import SettingsPage from './pages/Settings';
import SearchPage from './pages/Search';
import UserOverview from './pages/UserOverview';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { canAccessAdminSearch, canAccessTenantOperations, isAdminRole } from './lib/roles';
import ProfilePage from './pages/Profile';

const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { appUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-5 h-5 border-2 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
          Checking permissions...
        </div>
      </div>
    );
  }

  if (!appUser || !isAdminRole(appUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const RequireTenantOperations = ({ children }: { children: ReactNode }) => {
  const { appUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-5 h-5 border-2 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!appUser || !canAccessTenantOperations(appUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const RequireAdminSearch = ({ children }: { children: ReactNode }) => {
  const { appUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-5 h-5 border-2 border-blue-200 border-t-[#005baa] rounded-full animate-spin" />
          Preparing search...
        </div>
      </div>
    );
  }

  if (!appUser || !canAccessAdminSearch(appUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Protected Dashboard Routes */}
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="cameras" element={<CamerasPage />} />
            <Route path="edge-servers" element={<EdgeServersPage />} />
            <Route
              path="employees"
              element={
                <RequireTenantOperations>
                  <EmployeesPage />
                </RequireTenantOperations>
              }
            />
            <Route
              path="events"
              element={
                <RequireTenantOperations>
                  <EventsPage />
                </RequireTenantOperations>
              }
            />
            <Route
              path="violations"
              element={
                <RequireTenantOperations>
                  <ViolationsPage />
                </RequireTenantOperations>
              }
            />
            <Route
              path="users"
              element={
                <RequireAdmin>
                  <UsersPage />
                </RequireAdmin>
              }
            />
            <Route
              path="users/:id"
              element={
                <RequireAdmin>
                  <UserOverview />
                </RequireAdmin>
              }
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="search"
              element={
                <RequireAdminSearch>
                  <SearchPage />
                </RequireAdminSearch>
              }
            />
            <Route
              path="settings"
              element={
                <RequireAdmin>
                  <SettingsPage />
                </RequireAdmin>
              }
            />
          </Route>
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
