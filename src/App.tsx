import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Home from './pages/Home'
import Book from './pages/Book'
import Quote from './pages/Quote'
import Policies from './pages/Policies'
import Pricing from './pages/Pricing'
import Pending from './pages/Pending'
import CustomerAccount from './pages/CustomerAccount'
import MyMoves from './pages/customer/MyMoves'
import AdminJobs from './pages/admin/Jobs'
import Dashboard from './pages/admin/Dashboard'
import Money from './pages/admin/Money'
import Payouts from './pages/admin/Payouts'
import PricePlan from './pages/admin/PricePlan'
import Requests from './pages/admin/Requests'
import RequestDetail from './pages/admin/RequestDetail'
import JobForm from './pages/admin/JobForm'
import AdminJobDetail from './pages/admin/JobDetail'
import People from './pages/admin/People'
import CrewMap from './pages/admin/CrewMap'
import Website from './pages/admin/Website'
import Visitors from './pages/admin/Visitors'
import NeedsYou from './pages/admin/NeedsYou'
import MyJobs from './pages/crew/MyJobs'
import CrewJob from './pages/crew/CrewJob'
import FindJob from './pages/crew/FindJob'
import Earnings from './pages/crew/Earnings'
import Availability from './pages/crew/Availability'
import Papers from './pages/crew/Papers'
import Profile from './pages/Profile'
import Photos from './pages/jobday/Photos'
import Extras from './pages/jobday/Extras'
import Sign from './pages/jobday/Sign'

export default function App() {
  const { session, account, loading } = useAuth()
  const { pathname } = useLocation()

  // Customers ask for a quote without signing in
  if (pathname === '/book') return <Book />
  if (pathname === '/policies') return <Policies />
  if (pathname === '/pricing') return <Pricing />
  // The public website; /site shows it to signed-in people too
  if (pathname === '/site') return <Home />
  const quote = pathname.match(/^\/quote\/([0-9a-f-]{36})$/)
  if (quote) return <Quote token={quote[1]} />
  if (loading) return <div className="center muted">Loading…</div>
  if (!session) {
    if (pathname === '/') return <Home />
    return pathname === '/account' ? <CustomerAccount /> : <Login />
  }
  if (!account) return <div className="center muted">Setting up your account…</div>

  if (!account.active) return <Pending />
  // Customers see their moves; a sign-up with no moves is waiting to join the crew
  if (account.role === 'client') return <MyMoves />

  if (account.role === 'admin') {
    return (
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/needs" element={<NeedsYou />} />
        <Route path="/jobs" element={<AdminJobs />} />
        <Route path="/jobs/new" element={<JobForm />} />
        <Route path="/jobs/:id" element={<AdminJobDetail />} />
        <Route path="/jobs/:id/edit" element={<JobForm />} />
        <Route path="/jobs/:id/photos" element={<Photos />} />
        <Route path="/jobs/:id/extras" element={<Extras />} />
        <Route path="/jobs/:id/sign" element={<Sign />} />
        <Route path="/money" element={<Money />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/price-plan" element={<PricePlan />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/people" element={<People />} />
        <Route path="/crew-map" element={<CrewMap />} />
        <Route path="/website" element={<Website />} />
        <Route path="/visitors" element={<Visitors />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<MyJobs />} />
      <Route path="/jobs/:id" element={<CrewJob />} />
      <Route path="/jobs/:id/photos" element={<Photos />} />
      <Route path="/jobs/:id/extras" element={<Extras />} />
      <Route path="/jobs/:id/sign" element={<Sign />} />
      <Route path="/find" element={<FindJob />} />
      <Route path="/earnings" element={<Earnings />} />
      <Route path="/availability" element={<Availability />} />
      <Route path="/papers" element={<Papers />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
