import { AuthContext } from '../../src/context/AuthContext.js'

const signedOut = {
  user: null,
  initializing: false,
  loading: false,
  error: null,
  clearError: () => {},
}

export default function AuthTestProvider({ children }) {
  return <AuthContext.Provider value={signedOut}>{children}</AuthContext.Provider>
}
