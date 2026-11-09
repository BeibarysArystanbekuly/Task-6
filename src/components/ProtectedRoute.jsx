import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import LoadingState from './LoadingState.jsx'

export default function ProtectedRoute() {
  const { user, initializing } = useAuth()

  if (initializing) return <LoadingState>Restoring your session…</LoadingState>
  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
