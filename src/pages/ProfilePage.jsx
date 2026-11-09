import { useAuth } from '../hooks/useAuth.js'
import LogoutButton from '../components/LogoutButton.jsx'
import '../styles/pages.css'

export default function ProfilePage() {
  const { user } = useAuth()

  return (
    <section className="panel content-panel profile-panel" aria-labelledby="profile-title">
      <p className="eyebrow">Your account</p>
      <h1 id="profile-title">Profile</h1>
      <p className="intro">Your Firebase account details.</p>
      <dl className="profile-details">
        <div><dt>Email</dt><dd>{user.email || 'No email provided'}</dd></div>
        <div><dt>UID</dt><dd>{user.uid}</dd></div>
      </dl>
      <LogoutButton className="primary" />
      <p className="login-note">Your collection is stored in this browser and is not synced to your account.</p>
    </section>
  )
}
