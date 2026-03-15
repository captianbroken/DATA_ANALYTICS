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
import { useAuth } from './hooks/useAuth';
import ProfilePage from './pages/Profile';

const RequireAdmin = ({ children }: { children: JSX.Element }) => {
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

  if (!appUser || appUser.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Dashboard Routes */}
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="cameras" element={<CamerasPage />} />
          <Route
            path="edge-servers"
            element={
              <RequireAdmin>
                <EdgeServersPage />
              </RequireAdmin>
            }
          />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="violations" element={<ViolationsPage />} />
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
              <RequireAdmin>
                <SearchPage />
              </RequireAdmin>
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
  );
}

export default App;
