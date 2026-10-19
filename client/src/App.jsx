import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loader } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Requirements from './pages/Requirements.jsx';
import NewRequirement from './pages/NewRequirement.jsx';
import RequirementDetail from './pages/RequirementDetail.jsx';
import Tasks from './pages/Tasks.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import Notifications from './pages/Notifications.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';
import PriorityFunnel from './pages/PriorityFunnel.jsx';
import Outsourced from './pages/Outsourced.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { user, meta, booting } = useAuth();
  if (booting || (user && !meta)) return <Loader />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="requirements" element={<Requirements />} />
        <Route path="requirements/new" element={<NewRequirement />} />
        <Route path="requirements/:id" element={<RequirementDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="funnel" element={<PriorityFunnel />} />
        <Route path="outsourced" element={<Outsourced />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}