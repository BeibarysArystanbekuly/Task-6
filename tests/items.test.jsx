import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter } from 'react-router'
import App from '../src/App.jsx'
import AuthTestProvider from './helpers/AuthTestProvider.jsx'
import { API_CONFIG } from '../src/api/settings.js'

vi.mock('../src/api/settings.js', () => ({
  DATA_KEY: 'test-filter-items',
  API_CONFIG: { minDelay: 0, maxDelay: 0, errorChance: 0 },
}))

const records = [
  ...['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((name, index) => ({
    id: index + 1, name, description: 'Audit note',
    category: 'Operations', status: 'Planned', priority: 'High',
  })),
  { id: 7, name: 'Completed audit', description: 'Audit note', category: 'Operations', status: 'Completed', priority: 'High' },
  { id: 8, name: 'Support audit', description: 'Audit note', category: 'Support', status: 'Planned', priority: 'High' },
  { id: 9, name: 'Low priority audit', description: 'Audit note', category: 'Operations', status: 'Planned', priority: 'Low' },
  { id: 10, name: 'Other work', description: 'A different task', category: 'Operations', status: 'Planned', priority: 'High' },
  { id: 11, name: 'Legacy record', description: 'An older item without extended fields' },
]

function renderApp(path = '/items') {
  window.history.replaceState(null, '', `/#${path}`)
  return render(<AuthTestProvider><HashRouter><App /></HashRouter></AuthTestProvider>)
}
const params = () => new URLSearchParams(window.location.hash.split('?')[1])
const filter = (field) => screen.getByRole('combobox', { name: `Filter by ${field}` })

beforeEach(() => {
  Object.assign(API_CONFIG, { minDelay: 0, maxDelay: 0, errorChance: 0 })
  localStorage.setItem('test-filter-items', JSON.stringify(records))
})
afterEach(cleanup)

it('filters before sorting and pagination, and retains direct URL state through details and refresh', async () => {
  const path = '/items?search=audit&category=Operations&status=Planned&priority=High&sort=name-desc&page=2&limit=5'
  const app = renderApp(path)
  const card = await screen.findByRole('link', { name: /^Alpha Audit note/ })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByText('Page 2 of 2')).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Your items' })).getByText('6')).toBeTruthy()
  expect(filter('category').value).toBe('Operations')
  expect(filter('status').value).toBe('Planned')
  expect(filter('priority').value).toBe('High')
  const originalHash = window.location.hash
  fireEvent.click(card)
  await screen.findByDisplayValue('Alpha')
  expect(params().get('category')).toBe('Operations')
  expect(params().get('page')).toBe('2')
  fireEvent.click(screen.getByRole('button', { name: 'Close item details' }))
  await waitFor(() => expect(window.location.hash).toBe(originalHash))
  app.unmount()
  render(<AuthTestProvider><HashRouter><App /></HashRouter></AuthTestProvider>)
  await screen.findByRole('link', { name: /^Alpha Audit note/ })
  expect(filter('priority').value).toBe('High')
})

it('combines controls, resets pagination for filter changes, and restores filters with Back and Forward', async () => {
  renderApp('/items?search=audit&sort=name-desc&page=2&limit=5')
  await screen.findByText('Page 2 of 2')
  for (const [field, value] of [['category', 'Operations'], ['status', 'Planned'], ['priority', 'High']]) {
    fireEvent.change(filter(field), { target: { value } })
    await waitFor(() => expect(params().get(field)).toBe(value))
    expect(params().get('page')).toBe('1')
  }
  await screen.findByText('Page 1 of 2')
  expect(screen.getAllByRole('article')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('link', { name: /^Alpha Audit note/ })
  expect(params().get('priority')).toBe('High')
  await act(async () => { window.history.back() })
  await screen.findByText('Page 1 of 2')
  await act(async () => { window.history.back() })
  await waitFor(() => expect(filter('priority').value).toBe(''))
  expect(filter('category').value).toBe('Operations')
  expect(filter('status').value).toBe('Planned')
  await act(async () => { window.history.forward() })
  await waitFor(() => expect(filter('priority').value).toBe('High'))
})

it('distinguishes no matching results from an empty collection and clears all filters together', async () => {
  const app = renderApp('/items?search=audit&category=Support&status=Completed&priority=Urgent&sort=name-desc&limit=5')
  await screen.findByRole('heading', { name: 'No matching items' })
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Show all items' }))
  await screen.findByText('Page 1 of 3')
  for (const field of ['search', 'category', 'status', 'priority']) expect(params().has(field)).toBe(false)
  expect(params().get('sort')).toBe('name-desc')
  expect(params().get('limit')).toBe('5')
  expect(screen.getByRole('searchbox').value).toBe('')
  expect(filter('category').value).toBe('')
  app.unmount()
  localStorage.setItem('test-filter-items', '[]')
  renderApp()
  await screen.findByRole('heading', { name: 'A fresh start' })
  expect(screen.getByRole('link', { name: 'Create an item' })).toBeTruthy()
})

it('shows loading and API errors, retries with filters intact, and supports older records', async () => {
  Object.assign(API_CONFIG, { minDelay: 50, maxDelay: 50, errorChance: 1 })
  renderApp('/items?category=General&status=Planned&priority=Normal')
  await screen.findByText('Loading your items…')
  await screen.findByRole('alert')
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  Object.assign(API_CONFIG, { minDelay: 0, maxDelay: 0, errorChance: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  const legacy = await screen.findByRole('link', { name: /^Legacy record/ })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(legacy.textContent).toContain('General')
  expect(legacy.textContent).toContain('Planned')
  expect(legacy.textContent).toContain('Normal priority')
  expect(params().get('status')).toBe('Planned')
})
