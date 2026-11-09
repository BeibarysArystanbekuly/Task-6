import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import { authErrorMessage } from '../utils/authErrorMessage.js'

export default function LogoutButton({ className }) {
  const { logout, loading } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function handleLogout() {
    if (loading || pending) return
    setMessage('')
    setPending(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setMessage(authErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="logout-control">
      <button className={className} type="button" disabled={loading || pending} onClick={handleLogout}>
        {pending ? 'Logging out…' : 'Logout'}
      </button>
      {message && <span className="logout-error" role="alert">{message}</span>}
    </span>
  )
}
