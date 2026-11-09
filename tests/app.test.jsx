import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter } from 'react-router'
import App from '../src/App.jsx'

const api = vi.hoisted(() => Object.fromEntries(
  ['getItemsList', 'getDashboard', 'getItem', 'createItem', 'updateItem', 'deleteItem'].map((name) => [name, vi.fn()]),
))
vi.mock('../src/services/service.js', () => api)

const record = (id, overrides = {}) => ({ id, name: `Item ${id}`, description: `Details ${id}`, category: 'General', status: 'Planned', priority: 'Normal', owner: 'Team', dueDate: '2026-12-01', ...overrides })
const response = (data, overrides = {}) => ({ data, total: data.length, page: 1, limit: 10, totalPages: data.length ? 1 : 0, ...overrides })
const dashboardResponse = (items, total = items.length) => ({
  statistics: { total, completed: 0, inProgress: 0, highPriority: 0, completionRate: 0 },
  breakdowns: { category: [{ name: 'General', count: total }], status: [{ name: 'Planned', count: total }] },
  items,
})
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function renderApp(path = '/items') {
  window.history.replaceState(null, '', `/Task-6/#${path}`)
  return render(<HashRouter><App /></HashRouter>)
}
const itemLink = (id) => screen.findByRole('link', { name: new RegExp(`^Item ${id} Details ${id}`) })

beforeEach(() => {
  vi.resetAllMocks()
  api.getItemsList.mockResolvedValue(response([record(1), record(2)]))
  api.getDashboard.mockResolvedValue(dashboardResponse([record(1), record(2)]))
  api.getItem.mockImplementation(async (id) => record(Number(id)))
  api.createItem.mockResolvedValue(record(20))
  api.updateItem.mockImplementation(async (id, changes) => record(Number(id), changes))
  api.deleteItem.mockResolvedValue({ success: true })
})
afterEach(cleanup)

describe('item details', () => {
  it.each(['abc', '0', '-1', '1.5', '1e0', '0x1', '01', '9007199254740992'])('rejects invalid item URL %s without fetching an item', async (id) => {
    renderApp(`/items/${id}`)
    await screen.findByRole('heading', { name: 'Item not found' })
    expect(api.getItem).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.getByRole('link', { name: 'All Items' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Back to home' }))
    await screen.findByRole('heading', { name: 'A little order. A clearer view.' })
  })

  it('fetches the URL ID and displays seven meaningful API fields', async () => {
    renderApp('/items/7')
    await screen.findByDisplayValue('Item 7')
    const details = within(screen.getByRole('region', { name: 'Item details' }))
    const values = { Name: 'Item 7', Description: 'Details 7', Category: 'General', Status: 'Planned', Priority: 'Normal', Owner: 'Team', 'Due date': '2026-12-01' }
    for (const [label, value] of Object.entries(values)) expect(details.getByLabelText(label).value).toBe(value)
    expect(details.getByText('Item #7')).toBeTruthy()
    expect(api.getItem).toHaveBeenCalledExactlyOnceWith('7')
  })

  it('shows loading and errors, and retries the same item ID', async () => {
    const request = deferred()
    api.getItem.mockReturnValueOnce(request.promise)
    renderApp('/items/9')
    await screen.findByText('Loading item…')
    const details = within(screen.getByRole('region', { name: 'Item details' }))
    expect(details.queryByLabelText('Name')).toBeNull()
    expect(details.getByRole('link', { name: 'All Items' })).toBeTruthy()
    await act(async () => { request.reject(new Error('Details unavailable')) })
    expect((await details.findByRole('alert')).textContent).toBe('Details unavailable')
    fireEvent.click(details.getByRole('button', { name: 'Try again' }))
    await details.findByDisplayValue('Item 9')
    expect(api.getItem.mock.calls).toEqual([['9'], ['9']])
  })

  it.each(['404', 'empty response'])('handles a missing item (%s) and provides an All Items escape link', async (kind) => {
    if (kind === '404') api.getItem.mockRejectedValueOnce(Object.assign(new Error('Item not found'), { status: 404, code: 'ITEM_NOT_FOUND' }))
    else api.getItem.mockResolvedValueOnce(null)
    renderApp('/items/999?category=Research&status=Completed')
    await screen.findByRole('heading', { name: 'Item not found' })
    const details = within(screen.getByRole('region', { name: 'Item details' }))
    expect(details.queryByLabelText('Name')).toBeNull()
    expect(details.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(details.getByRole('link', { name: 'Back' })).toBeTruthy()
    fireEvent.click(details.getByRole('link', { name: 'All Items' }))
    await waitFor(() => expect(window.location.hash).toBe('#/items'))
    expect(screen.queryByRole('heading', { name: 'Item not found' })).toBeNull()
  })

  it.each(['success', 'error'])('ignores a stale %s after changing the routed item ID', async (kind) => {
    const first = deferred()
    api.getItem.mockImplementation((id) => id === '1' ? first.promise : Promise.resolve(record(Number(id))))
    renderApp('/items/1')
    await screen.findByText('Loading item…')
    fireEvent.click(await itemLink(2))
    await screen.findByDisplayValue('Item 2')
    await act(async () => {
      if (kind === 'success') first.resolve(record(1))
      else first.reject(Object.assign(new Error('Item not found'), { status: 404 }))
    })
    const details = within(screen.getByRole('region', { name: 'Item details' }))
    expect(details.getByLabelText('Name').value).toBe('Item 2')
    expect(details.getByText('Item #2')).toBeTruthy()
    expect(details.queryByRole('heading', { name: 'Item not found' })).toBeNull()
    expect(details.queryByRole('alert')).toBeNull()
  })

  it('uses Back to return to the dashboard without replacing the layout', async () => {
    renderApp('/dashboard')
    await screen.findByRole('heading', { name: 'Dashboard' })
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(await screen.findByRole('link', { name: /^Item 1 Planned/ }))
    await screen.findByDisplayValue('Item 1')
    fireEvent.click(screen.getByRole('link', { name: 'Back', exact: true }))
    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(window.location.hash).toBe('#/dashboard')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(navigation)
  })

  it('uses the filtered collection as the Back fallback on direct entry', async () => {
    renderApp('/items/7?category=Research&priority=High&limit=5')
    await screen.findByDisplayValue('Item 7')
    fireEvent.click(screen.getByRole('link', { name: 'Back', exact: true }))
    await waitFor(() => expect(window.location.hash).toBe('#/items?category=Research&priority=High&limit=5'))
    expect(screen.getByRole('combobox', { name: 'Filter by category' }).value).toBe('Research')
  })
})

describe('shared layout and routes', () => {
  it('navigates every main page without replacing the shared layout', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'A little order. A clearer view.' })
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const [link, heading] of [['About', 'About Itemspace'], ['Dashboard', 'Dashboard'], ['Login', 'Login'], ['Items', 'All the little details.'], ['Home', 'A little order. A clearer view.']]) {
      fireEvent.click(screen.getByRole('link', { name: link, exact: true }))
      await screen.findByRole('heading', { name: heading, exact: true })
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(navigation)
    }
  })

  it('loads a nested direct URL and survives remounting at the same URL', async () => {
    const app = renderApp('/items/7?search=Item&sort=name-desc&page=2&limit=5')
    await screen.findByDisplayValue('Item 7')
    expect(api.getItem).toHaveBeenCalledWith('7')
    expect(api.getItemsList).toHaveBeenCalledWith('?search=Item&sort=name-desc&page=2&limit=5')
    expect(screen.getByRole('searchbox').value).toBe('Item')
    app.unmount()
    render(<HashRouter><App /></HashRouter>)
    await screen.findByDisplayValue('Item 7')
    expect(window.location.pathname).toBe('/Task-6/')
    expect(window.location.hash).toContain('/items/7')
  })

  it('supports Back and Forward between nested details and keeps URL filters', async () => {
    renderApp('/items?search=Item&limit=5')
    fireEvent.click(await itemLink(1))
    await screen.findByDisplayValue('Item 1')
    fireEvent.click(await itemLink(2))
    await screen.findByDisplayValue('Item 2')
    await act(async () => { window.history.back() })
    await screen.findByDisplayValue('Item 1')
    expect(window.location.hash).toBe('#/items/1?search=Item&limit=5')
    await act(async () => { window.history.forward() })
    await screen.findByDisplayValue('Item 2')
    fireEvent.click(screen.getByRole('button', { name: 'Close item details' }))
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull())
    expect(window.location.hash).toBe('#/items?search=Item&limit=5')
  })

  it('shows 404 for unknown URLs and recovers through the home link', async () => {
    renderApp('/unknown/path')
    await screen.findByText('404 · Page not found')
    fireEvent.click(screen.getByRole('link', { name: 'Back to home' }))
    await screen.findByRole('heading', { name: 'A little order. A clearer view.' })
  })

  it('uses the custom 404 for unmatched nested URLs', async () => {
    renderApp('/items/1/unknown')
    await screen.findByText('404 · Page not found')
    expect(api.getItem).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy()
  })

  it('does not change the route when using the skip link', async () => {
    renderApp('/about')
    await screen.findByRole('heading', { name: 'About Itemspace' })
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(window.location.hash).toBe('#/about')
  })
})

describe('collection behavior through routed pages', () => {
  it('ignores superseded responses and retries a failed reload', async () => {
    const initial = deferred(), search = deferred()
    api.getItemsList.mockImplementationOnce(() => initial.promise).mockImplementationOnce(() => search.promise)
    renderApp()
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Item 2' } })
    await waitFor(() => expect(api.getItemsList).toHaveBeenLastCalledWith('?search=Item+2&sort=name&page=1&limit=10'))
    await act(async () => { search.resolve(response([record(2)])) })
    await itemLink(2)
    await act(async () => { initial.resolve(response([record(1)])) })
    expect(screen.queryByRole('link', { name: /^Item 1 Details 1/ })).toBeNull()
    api.getItemsList.mockRejectedValueOnce(new Error('Offline'))
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }))
    await screen.findByText('Offline')
    api.getItemsList.mockResolvedValueOnce(response([]))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'No matching items' })
  })

  it('corrects an emptied last page and preserves sort and page size in the URL', async () => {
    api.getItemsList.mockResolvedValueOnce(response([record(1)], { total: 11, totalPages: 2 }))
    renderApp()
    await itemLink(1)
    api.getItemsList.mockResolvedValueOnce(response([record(11)], { total: 11, totalPages: 2, page: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await itemLink(11)
    expect(window.location.hash).toContain('page=2')
    api.getItemsList.mockResolvedValueOnce(response([], { total: 10, totalPages: 1, page: 2 }))
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }))
    await screen.findByText('Page 1 of 1')
    expect(window.location.hash).toContain('page=1')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort items' }), { target: { value: 'name-desc' } })
    await waitFor(() => expect(api.getItemsList).toHaveBeenLastCalledWith('?search=&sort=name-desc&page=1&limit=10'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '20' } })
    await waitFor(() => expect(api.getItemsList).toHaveBeenLastCalledWith('?search=&sort=name-desc&page=1&limit=20'))
  })

  it('blocks conflicting selection during completion and preserves unsaved edits', async () => {
    const completion = deferred()
    renderApp('/items/1')
    await screen.findByDisplayValue('Item 1')
    await itemLink(2)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } })
    api.updateItem.mockReturnValueOnce(completion.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }))
    expect((await itemLink(2)).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(await itemLink(2))
    expect(window.location.hash).toBe('#/items/1')
    fireEvent.click(screen.getByRole('link', { name: /New item/ }))
    expect(window.location.hash).toBe('#/items/1')
    api.getItemsList.mockResolvedValue(response([record(1, { status: 'Completed' }), record(2)]))
    await act(async () => { completion.resolve(record(1, { status: 'Completed' })) })
    await screen.findByText(/Item #1 marked complete/)
    expect(screen.getByLabelText('Name').value).toBe('Unsaved name')
    expect(screen.getByRole('combobox', { name: 'Status', exact: true }).value).toBe('Completed')
    expect(api.updateItem).toHaveBeenCalledExactlyOnceWith(1, { status: 'Completed' })
  })

  it('releases busy controls when browser history leaves a saving detail route', async () => {
    const completion = deferred()
    renderApp()
    fireEvent.click(await itemLink(1))
    await screen.findByDisplayValue('Item 1')
    api.updateItem.mockReturnValueOnce(completion.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }))
    await act(async () => { window.history.back() })
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull())
    expect((await itemLink(2)).getAttribute('aria-disabled')).toBe('false')
    await act(async () => { completion.resolve(record(1, { status: 'Completed' })) })
    expect(screen.queryByText(/Item #1 marked complete/)).toBeNull()
  })

  it('creates and deletes items through nested routes and refreshes the list', async () => {
    renderApp('/items/new')
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'New item' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Description' } })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Owner' } })
    api.getItemsList.mockResolvedValue(response([record(20, { name: 'New item' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Create item' }))
    await screen.findByText(/Item created/)
    expect(window.location.hash).toBe('#/items')
    expect(api.updateItem).toHaveBeenCalledWith(20, expect.objectContaining({ name: 'New item', owner: 'Owner' }))
    fireEvent.click(await screen.findByRole('link', { name: /^New item Details 20/ }))
    await screen.findByDisplayValue('Item 20')
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete item' }))
    await screen.findByText(/Item deleted/)
    expect(api.deleteItem).toHaveBeenCalledWith(20)
    expect(window.location.hash).toBe('#/items')
  })

  it('uses dashboard totals and links returned by the API', async () => {
    api.getDashboard.mockResolvedValue(dashboardResponse([record(42, { name: 'From the API' })], 123))
    renderApp('/dashboard')
    const total = await screen.findByRole('group', { name: 'Total items', exact: true })
    expect(within(total).getByText('123')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: /^From the API/ }))
    await screen.findByDisplayValue('Item 42')
    expect(api.getItem).toHaveBeenCalledWith('42')
  })
})
