import { StrictMode, useEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import AuthProvider from '../src/context/AuthProvider.jsx'
import { useAuth } from '../src/hooks/useAuth.js'

const firebase = vi.hoisted(() => ({
  auth: {},
  browserLocalPersistence: {},
  setPersistence: vi.fn(),
  googleProvider: {},
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../src/firebase.js', () => ({ auth: firebase.auth, googleProvider: firebase.googleProvider }))
vi.mock('firebase/auth', () => firebase)

let notifyUser, notifyError, unsubscribe, context

function Consumer() {
  const value = useAuth()
  useEffect(() => { context = value }, [value])
  return <p>{value.loading ? 'Restoring session' : value.error ? value.error.message : value.user?.email ?? 'Signed out'}</p>
}

beforeEach(() => {
  vi.resetAllMocks()
  firebase.setPersistence.mockResolvedValue(undefined)
  unsubscribe = vi.fn()
  firebase.onAuthStateChanged.mockImplementation((auth, onUser, onError) => {
    notifyUser = onUser
    notifyError = onError
    return unsubscribe
  })
})

afterEach(cleanup)

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('waits for local persistence before restoring the session', async () => {
  const persistence = deferred()
  firebase.setPersistence.mockReturnValue(persistence.promise)
  render(<AuthProvider><Consumer /></AuthProvider>)
  expect(context.initializing).toBe(true)
  expect(firebase.setPersistence).toHaveBeenCalledWith(firebase.auth, firebase.browserLocalPersistence)
  expect(firebase.onAuthStateChanged).not.toHaveBeenCalled()
  await act(async () => { persistence.resolve() })
  act(() => notifyUser({ uid: 'saved-user', email: 'saved@example.com' }))
  expect(context.initializing).toBe(false)
  expect(context.user.uid).toBe('saved-user')
})

it('reports persistence failures and does not start a login without persistence', async () => {
  const failure = new Error('Browser storage unavailable')
  firebase.setPersistence.mockRejectedValue(failure)
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  expect(context.loading).toBe(false)
  expect(context.error).toBe(failure)
  expect(firebase.onAuthStateChanged).not.toHaveBeenCalled()
  await act(async () => { await expect(context.login('user@example.com', 'password')).rejects.toBe(failure) })
  expect(firebase.signInWithEmailAndPassword).not.toHaveBeenCalled()
})

it('keeps loading during a request and clears an error when retrying', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  act(() => notifyUser(null))
  const request = deferred()
  firebase.signInWithPopup.mockReturnValue(request.promise)
  let operation
  act(() => { operation = context.loginWithGoogle(); operation.catch(() => {}) })
  expect(context.loading).toBe(true)
  expect(context.authenticating).toBe(true)
  const failure = new Error('Popup closed')
  await act(async () => {
    request.reject(failure)
    await expect(operation).rejects.toBe(failure)
  })
  expect(context.loading).toBe(false)
  expect(context.error).toBe(failure)
  const retry = deferred()
  firebase.signInWithPopup.mockReturnValue(retry.promise)
  act(() => { operation = context.loginWithGoogle() })
  expect(context.error).toBeNull()
  expect(context.loading).toBe(true)
  await act(async () => { retry.resolve({ user: { uid: 'user-1' } }); await operation })
  expect(context.loading).toBe(false)
})

it('preserves the current user if sign-out fails and supports dismissing the error', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  act(() => notifyUser({ uid: 'user-1' }))
  const failure = new Error('Sign-out failed')
  firebase.signOut.mockRejectedValue(failure)
  await act(async () => { await expect(context.logout()).rejects.toBe(failure) })
  expect(context.user.uid).toBe('user-1')
  expect(context.error).toBe(failure)
  expect(context.loading).toBe(false)
  act(() => context.clearError())
  expect(context.error).toBeNull()
})

it('does not subscribe after unmount while persistence is pending', async () => {
  const persistence = deferred()
  firebase.setPersistence.mockReturnValue(persistence.promise)
  const view = render(<AuthProvider><Consumer /></AuthProvider>)
  view.unmount()
  await act(async () => { persistence.resolve() })
  expect(firebase.onAuthStateChanged).not.toHaveBeenCalled()
})

it('waits for Firebase to restore the session and follows sign-in and sign-out changes', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  expect(screen.getByText('Restoring session')).toBeTruthy()
  act(() => notifyUser({ uid: 'user-1', email: 'member@example.com' }))
  expect(screen.getByText('member@example.com')).toBeTruthy()
  expect(context.user.uid).toBe('user-1')
  act(() => notifyUser(null))
  expect(screen.getByText('Signed out')).toBeTruthy()
})

it('finishes loading when there is no saved session', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  act(() => notifyUser(null))
  expect(context.loading).toBe(false)
  expect(context.user).toBeNull()
  expect(context.error).toBeNull()
})

it('exposes observer errors instead of staying in the loading state', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  const error = new Error('Session unavailable')
  act(() => notifyError(error))
  expect(screen.getByText('Session unavailable')).toBeTruthy()
  expect(context.loading).toBe(false)
  expect(context.error).toBe(error)
})

it('cleans up Firebase observers during StrictMode remount and unmount', async () => {
  let view
  await act(async () => { view = render(<StrictMode><AuthProvider><Consumer /></AuthProvider></StrictMode>) })
  expect(firebase.setPersistence).toHaveBeenCalledTimes(2)
  expect(firebase.onAuthStateChanged).toHaveBeenCalledTimes(1)
  expect(unsubscribe).not.toHaveBeenCalled()
  view.unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

it('passes credentials to Firebase, returns results, and propagates failures', async () => {
  await act(async () => { render(<AuthProvider><Consumer /></AuthProvider>) })
  const result = { user: { uid: 'user-1' } }
  firebase.createUserWithEmailAndPassword.mockResolvedValue(result)
  firebase.signInWithEmailAndPassword.mockResolvedValue(result)
  firebase.signInWithPopup.mockResolvedValue(result)
  firebase.signOut.mockResolvedValue(undefined)

  await act(async () => { expect(await context.signup('member@example.com', 'example-password')).toBe(result) })
  expect(firebase.createUserWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, 'member@example.com', 'example-password')
  await act(async () => { expect(await context.login('member@example.com', 'example-password')).toBe(result) })
  expect(firebase.signInWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, 'member@example.com', 'example-password')
  await act(async () => { expect(await context.loginWithGoogle()).toBe(result) })
  expect(firebase.signInWithPopup).toHaveBeenCalledWith(firebase.auth, firebase.googleProvider)
  await act(async () => { await context.logout() })
  expect(firebase.signOut).toHaveBeenCalledWith(firebase.auth)

  const failure = new Error('Invalid credentials')
  firebase.signInWithEmailAndPassword.mockRejectedValue(failure)
  await act(async () => { await expect(context.login('member@example.com', 'wrong-password')).rejects.toBe(failure) })
  expect(context.error).toBe(failure)
})

it('explains when useAuth is called outside its provider', async () => {
  expect(() => render(<Consumer />)).toThrow('useAuth must be used within an AuthProvider')
})
