import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router'
import AuthProvider from '../src/context/AuthProvider.jsx'
import App from '../src/App.jsx'

const firebase = vi.hoisted(() => ({
  auth: {}, googleProvider: {}, browserLocalPersistence: {},
  setPersistence: vi.fn(), onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(), signOut: vi.fn(),
}))
vi.mock('../src/firebase.js', () => ({ auth: firebase.auth, googleProvider: firebase.googleProvider }))
vi.mock('firebase/auth', () => firebase)

const member = { uid: 'member-1', email: 'member@example.com' }
let notifyUser

beforeEach(() => {
  vi.resetAllMocks()
  firebase.setPersistence.mockResolvedValue(undefined)
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => {
    notifyUser = callback
    callback(null)
    return () => {}
  })
  for (const method of ['createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'signInWithPopup']) {
    firebase[method].mockImplementation(async () => { notifyUser(member); return { user: member } })
  }
  firebase.signOut.mockImplementation(async () => { notifyUser(null) })
})
afterEach(cleanup)

async function openLogin(path = '/login', { waitForLogin = true } = {}) {
  window.history.replaceState(null, '', `/#${path}`)
  await act(async () => {
    render(<AuthProvider><HashRouter><App /></HashRouter></AuthProvider>)
  })
  if (path === '/login' && waitForLogin) await screen.findByRole('heading', { name: 'Login', exact: true })
}

function fillCredentials(password = 'example-password') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: member.email } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } })
}

it('signs in with email and password and updates the account navigation', async () => {
  await openLogin()
  fillCredentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
  expect(firebase.signInWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, member.email, 'example-password')
  expect(screen.getByRole('link', { name: 'Profile', exact: true })).toBeTruthy()
  expect(screen.getByText(member.email)).toBeTruthy()
  expect(screen.getByText(member.uid)).toBeTruthy()
  expect(window.location.hash).toBe('#/profile')
})

it('creates an account after matching the password confirmation', async () => {
  await openLogin()
  fireEvent.click(await screen.findByRole('link', { name: 'New here? Create an account' }))
  await screen.findByRole('form', { name: 'Signup' })
  fillCredentials()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
  expect(firebase.createUserWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, member.email, 'example-password')
})

it('prevents signup when the passwords do not match', async () => {
  await openLogin()
  fireEvent.click(await screen.findByRole('link', { name: 'New here? Create an account' }))
  await screen.findByRole('form', { name: 'Signup' })
  fillCredentials()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match.')
  expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled()
})

it('starts Google sign-in without requiring email form fields', async () => {
  await openLogin()
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
  expect(firebase.signInWithPopup).toHaveBeenCalledWith(firebase.auth, firebase.googleProvider)
})

it('signs out of a restored session', async () => {
  await openLogin()
  act(() => notifyUser(member))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Logout' })[1])
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy()
  expect(firebase.signOut).toHaveBeenCalledWith(firebase.auth)
  expect(screen.getByRole('link', { name: 'Login', exact: true })).toBeTruthy()
})

it('shows login errors, keeps credentials for a retry, and disables pending controls', async () => {
  await openLogin()
  let rejectLogin
  firebase.signInWithEmailAndPassword.mockImplementation(() => new Promise((resolve, reject) => { rejectLogin = reject }))
  fillCredentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  await waitFor(() => expect(rejectLogin).toBeTypeOf('function'))
  expect(screen.getByRole('button', { name: 'Please wait…' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Continue with Google' }).disabled).toBe(true)
  await act(async () => { rejectLogin({ code: 'auth/invalid-credential' }) })
  expect(screen.getByRole('alert').textContent).toBe('The email or password is incorrect.')
  expect(screen.getByLabelText('Email').value).toBe(member.email)
  expect(screen.getByRole('button', { name: 'Sign in', exact: true }).disabled).toBe(false)
  firebase.signInWithEmailAndPassword.mockImplementation(async () => { notifyUser(member); return { user: member } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  await screen.findByRole('heading', { name: 'Profile' })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('allows retry after cancelling Google sign-in', async () => {
  await openLogin()
  firebase.signInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' })
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Google sign-in was cancelled. You can try again.')
  expect(screen.getByRole('button', { name: 'Continue with Google' }).disabled).toBe(false)
})

it('keeps the account visible and shows an error if logout fails', async () => {
  await openLogin()
  act(() => notifyUser(member))
  await screen.findByRole('heading', { name: 'Profile' })
  firebase.signOut.mockRejectedValue({ code: 'auth/network-request-failed' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Logout' })[1])
  expect((await screen.findByRole('alert')).textContent).toBe('Check your internet connection and try again.')
  expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
})

it('waits for restoration before showing a signed-out form', async () => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { notifyUser = callback; return () => {} })
  await openLogin()
  expect(screen.getByText('Restoring your session…')).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Login' })).toBeNull()
  act(() => notifyUser(member))
  expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
})

it('redirects a direct unauthenticated profile visit to login', async () => {
  await openLogin('/profile')
  await screen.findByRole('heading', { name: 'Login', exact: true })
  expect(window.location.hash).toBe('#/login')
  expect(screen.queryByText(member.uid)).toBeNull()
  expect(screen.getByRole('link', { name: 'Login', exact: true })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Signup', exact: true })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Profile', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull()
})

it('keeps the profile URL while restoring a saved session and then shows its details', async () => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { notifyUser = callback; return () => {} })
  await openLogin('/profile')
  await screen.findByText('Restoring your session…')
  expect(window.location.hash).toBe('#/profile')
  expect(screen.queryByRole('heading', { name: 'Login' })).toBeNull()
  act(() => notifyUser(member))
  await screen.findByRole('heading', { name: 'Profile' })
  expect(screen.getByText(member.email)).toBeTruthy()
  expect(screen.getByText(member.uid)).toBeTruthy()
  expect(window.location.hash).toBe('#/profile')
  expect(screen.queryByRole('link', { name: 'Signup', exact: true })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Login', exact: true })).toBeNull()
})

it('removes the profile and redirects when Firebase reports a sign-out in another tab', async () => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { notifyUser = callback; callback(member); return () => {} })
  await openLogin('/profile')
  await screen.findByRole('heading', { name: 'Profile' })
  act(() => notifyUser(null))
  await screen.findByRole('heading', { name: 'Login' })
  expect(window.location.hash).toBe('#/login')
  expect(screen.queryByText(member.email)).toBeNull()
  expect(screen.queryByText(member.uid)).toBeNull()
})

it.each(['/login', '/signup'])('redirects signed-in users from %s to their profile', async (path) => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { callback(member); return () => {} })
  await openLogin(path, { waitForLogin: false })
  await screen.findByRole('heading', { name: 'Profile' })
  expect(window.location.hash).toBe('#/profile')
})

it('supports logout from the NavBar on a public page', async () => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { notifyUser = callback; callback(member); return () => {} })
  await openLogin('/about')
  await screen.findByRole('heading', { name: 'About Itemspace' })
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(firebase.signOut).toHaveBeenCalledTimes(1)
  expect(window.location.hash).toBe('#/login')
})

it.each([
  ['', 'example-password', 'example-password', 'Enter a valid email address.'],
  ['invalid-email', 'example-password', 'example-password', 'Enter a valid email address.'],
  ['member@example.com', '', '', 'Enter your password.'],
  ['member@example.com', 'short', 'short', 'Use at least 6 characters for your password.'],
  ['member@example.com', 'example-password', '', 'Passwords do not match.'],
])('validates signup fields before calling Firebase (%s, %s)', async (email, password, confirmation, message) => {
  await openLogin('/signup')
  await screen.findByRole('form', { name: 'Signup' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  expect(screen.getByRole('alert').textContent).toBe(message)
  expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#/signup')
})
