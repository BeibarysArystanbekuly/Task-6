import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AuthProvider from '../src/context/AuthProvider.jsx'
import LoginPage from '../src/pages/LoginPage.jsx'
import NavBar from '../src/components/NavBar.jsx'

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

async function openLogin() {
  await act(async () => {
    render(<AuthProvider><MemoryRouter><NavBar /><LoginPage /></MemoryRouter></AuthProvider>)
  })
}

function fillCredentials(password = 'example-password') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: member.email } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } })
}

it('signs in with email and password and updates the account navigation', async () => {
  await openLogin()
  fillCredentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy()
  expect(firebase.signInWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, member.email, 'example-password')
  expect(screen.getByRole('link', { name: 'Account', exact: true })).toBeTruthy()
  expect(screen.getByText(`Signed in as ${member.email}.`)).toBeTruthy()
})

it('creates an account after matching the password confirmation', async () => {
  await openLogin()
  fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
  fillCredentials()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'example-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy()
  expect(firebase.createUserWithEmailAndPassword).toHaveBeenCalledWith(firebase.auth, member.email, 'example-password')
})

it('prevents signup when the passwords do not match', async () => {
  await openLogin()
  fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
  fillCredentials()
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account', exact: true }))
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match.')
  expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled()
})

it('starts Google sign-in without requiring email form fields', async () => {
  await openLogin()
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy()
  expect(firebase.signInWithPopup).toHaveBeenCalledWith(firebase.auth, firebase.googleProvider)
})

it('signs out of a restored session', async () => {
  await openLogin()
  act(() => notifyUser(member))
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
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
  await screen.findByRole('heading', { name: 'Your account' })
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
  firebase.signOut.mockRejectedValue({ code: 'auth/network-request-failed' })
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Check your internet connection and try again.')
  expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy()
})

it('waits for restoration before showing a signed-out form', async () => {
  firebase.onAuthStateChanged.mockImplementation((auth, callback) => { notifyUser = callback; return () => {} })
  await openLogin()
  expect(screen.getByText('Restoring your session…')).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Login' })).toBeNull()
  act(() => notifyUser(member))
  expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy()
})
