import * as api from '../api/fakeApi.js'
import { createQueryCache } from './queryCache.js'

export const ITEMS_CACHE_TTL_MS = 30_000
const itemsCache = createQueryCache({ ttlMs: ITEMS_CACHE_TTL_MS, maxEntries: 100 })

export function getItemsQueryKey(query = '') {
  const params = new URLSearchParams(query)
  const positiveInteger = (value, fallback) => {
    const number = Number(value)
    return Number.isSafeInteger(number) && number > 0 ? number : fallback
  }

  // Match the API's defaults and supported fields. Parameter ordering and
  // irrelevant URL parameters do not create duplicate cache entries.
  return ['items', 'list', {
    search: params.get('search') || '',
    category: params.get('category') || '',
    status: params.get('status') || '',
    priority: params.get('priority') || '',
    sort: params.get('sort') === 'name-desc' ? 'name-desc' : 'name',
    page: positiveInteger(params.get('page'), 1),
    limit: positiveInteger(params.get('limit'), 10),
  }]
}

export function invalidateItemsCache() {
  itemsCache.invalidate()
}

// Pages and hooks use this boundary; the fake API remains the data provider.
export function getItemsList(query = '', options = {}) {
  return itemsCache.get(getItemsQueryKey(query), () => api.getItemsList(query), options)
}

export function getDashboard(query = '') {
  return api.getDashboard(query)
}

export function getItem(id) {
  return api.getItem(id)
}

export async function createItem(values) {
  const result = await api.createItem(values)
  invalidateItemsCache()
  return result
}

export async function updateItem(id, changes) {
  const result = await api.updateItem(id, changes)
  invalidateItemsCache()
  return result
}

export async function deleteItem(id) {
  const result = await api.deleteItem(id)
  invalidateItemsCache()
  return result
}
