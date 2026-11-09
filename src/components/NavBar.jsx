import { Link, NavLink } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'

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
        <NavLink to="/login">{initializing || user ? 'Account' : 'Login'}</NavLink>
      </nav>
    </header>
  )
}
