import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router'
import App from '../src/App.jsx'

const routeImport = vi.hoisted(() => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  return { pending, release }
})
vi.mock('../src/pages/ItemDetailsPage.jsx', async (importOriginal) => {
  await routeImport.pending
  return importOriginal()
})
vi.mock('../src/api/settings.js', () => ({
  DATA_KEY: 'test-lazy-items',
  API_CONFIG: { minDelay: 0, maxDelay: 0, errorChance: 0 },
}))
afterEach(cleanup)

it('keeps navigation and the collection available while a nested page module loads', async () => {
  localStorage.setItem('test-lazy-items', JSON.stringify([{ id: 1, name: 'Deferred item', description: 'From the API' }]))
  window.history.replaceState(null, '', '/#/items')
  render(<HashRouter><App /></HashRouter>)
  const card = await screen.findByRole('link', { name: /^Deferred item From the API/ })
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
  fireEvent.click(card)
  await screen.findByText('Loading item page…')
  expect(screen.getByRole('link', { name: /^Deferred item From the API/ })).toBe(card)
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(navigation)
  await act(async () => { routeImport.release() })
  await screen.findByDisplayValue('Deferred item')
  expect(screen.queryByText('Loading item page…')).toBeNull()
})
