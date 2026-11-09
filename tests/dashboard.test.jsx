import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter } from 'react-router'
import App from '../src/App.jsx'
import AuthTestProvider from './helpers/AuthTestProvider.jsx'
import { API_CONFIG } from '../src/api/settings.js'
import * as service from '../src/services/service.js'

vi.mock('../src/api/settings.js', () => ({
  DATA_KEY: 'test-dashboard-items',
  API_CONFIG: { minDelay: 0, maxDelay: 0, errorChance: 0 },
}))

const records = [
  { id: 1, name: 'Alpha', category: 'Operations', status: 'Completed', priority: 'High' },
  { id: 2, name: 'Bravo', category: 'Operations', status: 'In progress', priority: 'Urgent' },
  { id: 3, name: 'Charlie', category: 'Operations', status: 'Planned', priority: 'Normal' },
  { id: 4, name: 'Delta', category: 'Operations', status: 'Completed', priority: 'Low' },
  { id: 5, name: 'Echo', category: 'Support', status: 'In progress', priority: 'High' },
  { id: 6, name: 'Foxtrot', category: 'Support', status: 'On hold', priority: 'Normal' },
  { id: 7, name: 'Golf', category: 'Research', status: 'Planned', priority: 'Low' },
  { id: 8, name: 'Hotel', category: 'Research', status: 'Completed', priority: 'Normal' },
  { id: 9, name: 'India', category: 'Operations', status: 'Planned', priority: 'High' },
  { id: 10, name: 'Juliet', category: 'Support', status: 'Completed', priority: 'Urgent' },
  { id: 11, name: 'Kilo' },
  { id: 12, name: 'Lima', category: 'Operations', status: 'In progress', priority: 'High' },
].map((item) => ({ description: 'Collection record', ...item }))

function renderDashboard(path = '/dashboard') {
  window.history.replaceState(null, '', `/#${path}`)
  return render(<AuthTestProvider><HashRouter><App /></HashRouter></AuthTestProvider>)
}
function metric(label, value) {
  expect(within(screen.getByRole('group', { name: label, exact: true })).getByText(String(value), { exact: true })).toBeTruthy()
}
const filter = (field) => screen.getByRole('combobox', { name: `Filter by ${field}` })

beforeEach(() => {
  Object.assign(API_CONFIG, { minDelay: 0, maxDelay: 0, errorChance: 0 })
  localStorage.setItem('test-dashboard-items', JSON.stringify(records))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('aggregates the complete collection and both breakdowns independently of preview pagination', async () => {
  const result = await service.getDashboard('?page=3&limit=1')
  expect(result.statistics).toEqual({ total: 12, completed: 4, inProgress: 3, highPriority: 6, completionRate: 33 })
  expect(result.items.map((item) => item.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
  expect(result.breakdowns.category).toEqual([
    { name: 'Operations', count: 6 }, { name: 'Support', count: 3 }, { name: 'Research', count: 2 }, { name: 'General', count: 1 },
  ])
  expect(result.breakdowns.status).toEqual([
    { name: 'Completed', count: 4 }, { name: 'Planned', count: 4 }, { name: 'In progress', count: 3 }, { name: 'On hold', count: 1 },
  ])
  renderDashboard()
  await waitFor(() => metric('Total items', 12))
  metric('Completed', 4)
  metric('In progress', 3)
  metric('High or urgent priority', 6)
  metric('Completion rate', '33%')
  const categories = within(screen.getByRole('region', { name: 'By category' }))
  expect(categories.getByRole('link', { name: 'Operations 6 (50%)' })).toBeTruthy()
  const statuses = within(screen.getByRole('region', { name: 'By status' }))
  expect(statuses.getByRole('link', { name: 'Completed 4 (33%)' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'From your collection' })).getAllByRole('link')).toHaveLength(6)
})

it('updates all statistics for combined URL filters and retains them on refresh and history navigation', async () => {
  const app = renderDashboard('/dashboard?category=Operations')
  await waitFor(() => metric('Total items', 6))
  metric('Completed', 2)
  metric('In progress', 2)
  metric('High or urgent priority', 4)
  fireEvent.change(filter('priority'), { target: { value: 'High' } })
  await waitFor(() => metric('Total items', 3))
  metric('Completed', 1)
  metric('In progress', 1)
  metric('High or urgent priority', 3)
  fireEvent.change(filter('status'), { target: { value: 'Completed' } })
  await waitFor(() => metric('Total items', 1))
  metric('Completion rate', '100%')
  await act(async () => { window.history.back() })
  await waitFor(() => metric('Total items', 3))
  expect(filter('status').value).toBe('')
  await act(async () => { window.history.forward() })
  await waitFor(() => metric('Total items', 1))
  app.unmount()
  render(<AuthTestProvider><HashRouter><App /></HashRouter></AuthTestProvider>)
  await waitFor(() => metric('Total items', 1))
  expect(filter('category').value).toBe('Operations')
  expect(filter('priority').value).toBe('High')
  expect(filter('status').value).toBe('Completed')
})

it('links breakdowns to matching items and preserves the dashboard selection', async () => {
  renderDashboard('/dashboard?priority=High')
  await waitFor(() => metric('Total items', 4))
  fireEvent.click(within(screen.getByRole('region', { name: 'By category' })).getByRole('link', { name: /^Operations/ }))
  await screen.findByRole('link', { name: /^Alpha Collection record/ })
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(filter('category').value).toBe('Operations')
  expect(filter('priority').value).toBe('High')
  await act(async () => { window.history.back() })
  await waitFor(() => metric('Total items', 4))
  fireEvent.click(within(screen.getByRole('region', { name: 'By status' })).getByRole('link', { name: /^Completed/ }))
  await screen.findByRole('link', { name: /^Alpha Collection record/ })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(filter('status').value).toBe('Completed')
  expect(filter('priority').value).toBe('High')
})

it('refreshes statistics after API changes and links the preview to item details', async () => {
  renderDashboard()
  await waitFor(() => metric('Completed', 4))
  await act(async () => { await service.updateItem(2, { status: 'Completed' }) })
  fireEvent.click(screen.getByRole('button', { name: /Refresh statistics/ }))
  await waitFor(() => metric('Completed', 5))
  metric('Completion rate', '42%')
  metric('In progress', 2)
  fireEvent.click(screen.getByRole('link', { name: 'Alpha Completed →' }))
  await screen.findByDisplayValue('Alpha')
  expect(window.location.hash).toBe('#/items/1')
})

it('shows zero-safe statistics and recovery links for empty selections and collections', async () => {
  renderDashboard('/dashboard?category=Equipment')
  await screen.findByRole('heading', { name: 'No matching items' })
  metric('Total items', 0)
  metric('Completed', 0)
  metric('In progress', 0)
  metric('High or urgent priority', 0)
  metric('Completion rate', '0%')
  expect(screen.getAllByText('No items in this selection.')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Show all items' }))
  await waitFor(() => metric('Total items', 12))
  expect(filter('category').value).toBe('')
  localStorage.setItem('test-dashboard-items', '[]')
  fireEvent.click(screen.getByRole('button', { name: /Refresh statistics/ }))
  await screen.findByRole('heading', { name: 'Your collection is ready for its first item' })
  metric('Completion rate', '0%')
  expect(screen.getByRole('link', { name: 'Create an item' })).toBeTruthy()
})

it('handles loading and API errors and retries the same dashboard selection', async () => {
  Object.assign(API_CONFIG, { minDelay: 50, maxDelay: 50, errorChance: 1 })
  renderDashboard('/dashboard?category=Support')
  await screen.findByText('Loading your dashboard…')
  await screen.findByRole('alert')
  expect(screen.queryByRole('group', { name: 'Total items' })).toBeNull()
  Object.assign(API_CONFIG, { minDelay: 0, maxDelay: 0, errorChance: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => metric('Total items', 3))
  expect(filter('category').value).toBe('Support')
})

it.each(['success', 'error'])('ignores a stale dashboard %s when filters change', async (kind) => {
  const previousData = await service.getDashboard('?category=Operations')
  const nextData = await service.getDashboard('?category=Support')
  let resolve, reject
  const pending = new Promise((yes, no) => { resolve = yes; reject = no })
  vi.spyOn(service, 'getDashboard').mockReturnValueOnce(pending).mockResolvedValue(nextData)
  renderDashboard('/dashboard?category=Operations')
  await screen.findByText('Loading your dashboard…')
  fireEvent.change(filter('category'), { target: { value: 'Support' } })
  await waitFor(() => metric('Total items', 3))
  await act(async () => {
    if (kind === 'success') resolve(previousData)
    else reject(new Error('Old request failed'))
  })
  metric('Total items', 3)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(filter('category').value).toBe('Support')
})
