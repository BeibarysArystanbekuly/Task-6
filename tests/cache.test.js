import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import {
  createItem, deleteItem, getItemsList, getItemsQueryKey,
  invalidateItemsCache, ITEMS_CACHE_TTL_MS, updateItem,
} from '../src/services/service.js'
import { createQueryCache } from '../src/services/queryCache.js'
import useItems from '../src/hooks/useItems.js'

const api = vi.hoisted(() => ({
  getItemsList: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(),
}))
vi.mock('../src/api/fakeApi.js', () => api)

const result = (name = 'Item') => ({ data: [{ id: 1, name }], total: 1, totalPages: 1 })
const empty = { data: [], total: 0, totalPages: 0 }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  invalidateItemsCache()
  api.getItemsList.mockResolvedValue(result())
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('normalizes query ordering, API defaults, and irrelevant parameters into one key', async () => {
  const first = await getItemsList('?search=Item&category=Research')
  expect(await getItemsList('?category=Research&search=Item&sort=name&page=1&limit=10&unused=1')).toBe(first)
  expect(api.getItemsList).toHaveBeenCalledTimes(1)
  expect(getItemsQueryKey('?page=-1&limit=no&sort=other')).toEqual(getItemsQueryKey(''))
})

it.each([
  '?search=another', '?category=Research', '?status=Completed', '?priority=High',
  '?sort=name-desc', '?page=2', '?limit=5',
])('keeps a distinct cache entry for %s', async (query) => {
  await getItemsList()
  await getItemsList(query)
  expect(api.getItemsList).toHaveBeenCalledTimes(2)
})

it('shares one in-flight request between matching consumers', async () => {
  const pending = deferred()
  api.getItemsList.mockReturnValue(pending.promise)
  const first = getItemsList('?category=Research')
  const second = getItemsList('?category=Research&page=1')
  expect(first).toBe(second)
  await Promise.resolve()
  expect(api.getItemsList).toHaveBeenCalledTimes(1)
  pending.resolve(result())
  await Promise.all([first, second])
})

it('reuses fresh results and revalidates once the 30-second TTL expires', async () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  await getItemsList()
  now += ITEMS_CACHE_TTL_MS - 1
  await getItemsList()
  expect(api.getItemsList).toHaveBeenCalledTimes(1)
  now += 1
  await getItemsList()
  expect(api.getItemsList).toHaveBeenCalledTimes(2)
})

it('caches empty results but does not cache errors', async () => {
  api.getItemsList.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(empty)
  await expect(getItemsList()).rejects.toThrow('Offline')
  expect(await getItemsList()).toEqual(empty)
  expect(await getItemsList()).toEqual(empty)
  expect(api.getItemsList).toHaveBeenCalledTimes(2)
})

it.each(['create', 'update', 'delete'])('invalidates all list variants after successful %s', async (operation) => {
  await getItemsList()
  await getItemsList('?category=Research')
  if (operation === 'create') await createItem({ name: 'New', description: 'New record' })
  if (operation === 'update') await updateItem(1, { status: 'Completed' })
  if (operation === 'delete') await deleteItem(1)
  await getItemsList()
  await getItemsList('?category=Research')
  expect(api.getItemsList).toHaveBeenCalledTimes(4)
})

it('preserves valid cached data when a mutation fails', async () => {
  const first = await getItemsList()
  api.updateItem.mockRejectedValue(new Error('Save failed'))
  await expect(updateItem(1, { name: 'Changed' })).rejects.toThrow('Save failed')
  expect(await getItemsList()).toBe(first)
  expect(api.getItemsList).toHaveBeenCalledTimes(1)
})

it.each(['success', 'error'])('ignores an outdated %s after a forced refresh', async (outcome) => {
  const old = deferred()
  const latest = result('Latest')
  api.getItemsList.mockReturnValueOnce(old.promise).mockResolvedValue(latest)
  const first = getItemsList()
  await Promise.resolve()
  expect(await getItemsList('', { force: true })).toBe(latest)
  if (outcome === 'success') old.resolve(result('Outdated'))
  else old.reject(new Error('Outdated failure'))
  expect(await first).toBe(latest)
  expect(await getItemsList()).toBe(latest)
  expect(api.getItemsList).toHaveBeenCalledTimes(2)
})

it('prevents a request started before a mutation from repopulating the cache', async () => {
  const old = deferred()
  const latest = result('Saved')
  api.getItemsList.mockReturnValueOnce(old.promise).mockResolvedValue(latest)
  const first = getItemsList()
  await Promise.resolve()
  await updateItem(1, { name: 'Saved' })
  old.resolve(result('Before mutation'))
  expect(await first).toBe(latest)
  expect(await getItemsList()).toBe(latest)
  expect(api.getItemsList).toHaveBeenCalledTimes(2)
})

it('bounds settled cache entries and evicts the least recently used result', async () => {
  const cache = createQueryCache({ maxEntries: 2 })
  const load = vi.fn().mockResolvedValue('value')
  await cache.get(['a'], load)
  await cache.get(['b'], load)
  await cache.get(['a'], load)
  await cache.get(['c'], load)
  await cache.get(['a'], load)
  expect(load).toHaveBeenCalledTimes(3)
  await cache.get(['b'], load)
  expect(load).toHaveBeenCalledTimes(4)
})

it('shows loading, error, and empty states and bypasses a fresh cache on reload', async () => {
  const pending = deferred()
  api.getItemsList.mockReturnValueOnce(pending.promise).mockResolvedValue(empty)
  const hook = renderHook(() => useItems(''))
  expect(hook.result.current.status).toBe('loading')
  await act(async () => { pending.reject(new Error('Offline')) })
  expect(hook.result.current.status).toBe('error')
  expect(hook.result.current.error).toBe('Offline')
  act(() => hook.result.current.reload())
  await waitFor(() => expect(hook.result.current.status).toBe('success'))
  expect(hook.result.current.result.data).toEqual([])
  api.getItemsList.mockResolvedValue(result('Reloaded'))
  act(() => hook.result.current.reload())
  await waitFor(() => expect(hook.result.current.result.data[0]?.name).toBe('Reloaded'))
  expect(api.getItemsList).toHaveBeenCalledTimes(3)
})

it.each(['success', 'error'])('ignores an old query %s when the selection changes', async (outcome) => {
  const old = deferred()
  api.getItemsList.mockReturnValueOnce(old.promise).mockResolvedValue(result('New selection'))
  const hook = renderHook(({ query }) => useItems(query), { initialProps: { query: '?search=old' } })
  await waitFor(() => expect(api.getItemsList).toHaveBeenCalledTimes(1))
  hook.rerender({ query: '?search=new' })
  await waitFor(() => expect(hook.result.current.result.data[0]?.name).toBe('New selection'))
  await act(async () => {
    if (outcome === 'success') old.resolve(result('Old selection'))
    else old.reject(new Error('Old failure'))
  })
  expect(hook.result.current.status).toBe('success')
  expect(hook.result.current.error).toBe('')
  expect(hook.result.current.result.data[0].name).toBe('New selection')
})
