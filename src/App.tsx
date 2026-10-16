import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Pending from './pages/Pending'
import AdminJobs from './pages/admin/Jobs'
import JobForm from './pages/admin/JobForm'
import AdminJobDetail from './pages/admin/JobDetail'
import People from './pages/admin/People'
import MyJobs from './pages/crew/MyJobs'
import CrewJob from './pages/crew/CrewJob'
import Profile from './pages/Profile'

export default function App() {
  const { session, account, loading } = useAuth()

  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <Login />
  if (!account) return <div className="center muted">Setting up your account…</div>

  // Inactive accounts and clients (no client screens yet) wait for the admin
  if (!account.active || account.role === 'client') return <Pending />

  if (account.role === 'admin') {
    return (
      <Routes>
        <Route path="/" element={<AdminJobs />} />
        <Route path="/jobs/new" element={<JobForm />} />
        <Route path="/jobs/:id" element={<AdminJobDetail />} />
        <Route path="/jobs/:id/edit" element={<JobForm />} />
        <Route path="/people" element={<People />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<MyJobs />} />
      <Route path="/jobs/:id" element={<CrewJob />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
