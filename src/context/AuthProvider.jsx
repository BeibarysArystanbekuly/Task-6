import { useEffect, useRef, useState } from 'react'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'
import { AuthContext } from './AuthContext.js'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState(null)
  const persistenceReady = useRef(null)
  const mounted = useRef(false)
  const latestOperation = useRef(0)

  useEffect(() => {
    let active = true
    let unsubscribe
    mounted.current = true

    // Configure persistence before observing or starting authentication requests.
    persistenceReady.current = setPersistence(auth, browserLocalPersistence)
    persistenceReady.current.then(() => {
      if (!active) return
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (!active) return
        setUser(currentUser)
        setInitializing(false)
      }, (authError) => {
        if (!active) return
        setError(authError)
        setInitializing(false)
      })
    }).catch((authError) => {
      if (!active) return
      setError(authError)
      setInitializing(false)
    })

    return () => {
      active = false
      mounted.current = false
      latestOperation.current += 1
      unsubscribe?.()
    }
  }, [])

  async function runAuthOperation(operation) {
    const operationId = ++latestOperation.current
    setError(null)
    setPendingCount((count) => count + 1)
    try {
      await persistenceReady.current
      return await operation()
    } catch (authError) {
      if (mounted.current && operationId === latestOperation.current) setError(authError)
      throw authError
    } finally {
      if (mounted.current) setPendingCount((count) => count - 1)
    }
  }

  const signup = (email, password) => runAuthOperation(() => createUserWithEmailAndPassword(auth, email, password))
  const login = (email, password) => runAuthOperation(() => signInWithEmailAndPassword(auth, email, password))
  const loginWithGoogle = () => runAuthOperation(() => signInWithPopup(auth, googleProvider))
  const logout = () => runAuthOperation(() => signOut(auth))
  const clearError = () => setError(null)
  const authenticating = pendingCount > 0
  const loading = initializing || authenticating

  return (
    <AuthContext.Provider value={{ user, loading, initializing, authenticating, error, clearError, signup, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
