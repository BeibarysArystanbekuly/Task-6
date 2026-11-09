import { Link, NavLink } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import LogoutButton from './LogoutButton.jsx'

export default function NavBar() {
  const { user, initializing } = useAuth()
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Itemspace home">
        <span className="brand-mark" aria-hidden="true">i</span>
        Itemspace<span className="badge">WORKSPACE</span>
      </Link>
      <nav className="navigation" aria-label="Main navigation">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/items">Items</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/about">About</NavLink>
        {initializing ? <span className="nav-auth-status" role="status">Checking session…</span> : user ? (
          <>
            <NavLink to="/profile">Profile</NavLink>
            <LogoutButton className="nav-logout" />
          </>
        ) : (
          <>
            <NavLink to="/login">Login</NavLink>
            <NavLink to="/signup">Signup</NavLink>
          </>
        )}
      </nav>
    </header>
  )
}
