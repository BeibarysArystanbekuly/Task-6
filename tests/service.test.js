import { beforeEach, expect, it, vi } from 'vitest'
import { createItem, deleteItem, getItem, getItemsList, invalidateItemsCache, updateItem } from '../src/services/service.js'

vi.mock('../src/api/settings.js', () => ({
  DATA_KEY: 'test-items',
  API_CONFIG: { minDelay: 0, maxDelay: 0, errorChance: 0 },
}))

beforeEach(() => {
  invalidateItemsCache()
  localStorage.setItem('test-items', JSON.stringify([
    { id: 1, name: 'Alpha', description: 'First item' },
    { id: 2, name: 'Beta', description: 'Second item' },
  ]))
})

it('returns API search, sorting, and pagination results through the service', async () => {
  const result = await getItemsList('?search=item&sort=name-desc&page=2&limit=1')
  expect(result).toMatchObject({ data: [{ id: 1, name: 'Alpha' }], total: 2, totalPages: 2, page: 2 })
  expect((await getItemsList('?search=Beta')).data).toHaveLength(1)
})

it('persists created records, all detail fields, and deletion', async () => {
  const created = await createItem({ name: 'Gamma', description: 'Third item' })
  const fields = { category: 'Research', status: 'Completed', priority: 'High', owner: 'Team', dueDate: '2026-12-01' }
  await updateItem(created.id, fields)
  expect(await getItem(String(created.id))).toMatchObject({ name: 'Gamma', ...fields })
  expect(JSON.parse(localStorage.getItem('test-items'))).toHaveLength(3)
  await deleteItem(created.id)
  await expect(getItem(created.id)).rejects.toMatchObject({ message: 'Item not found', status: 404, code: 'ITEM_NOT_FOUND' })
})

it('normalizes invalid API pagination values', async () => {
  const result = await getItemsList('?page=-2&limit=1.5')
  expect(result).toMatchObject({ page: 1, limit: 10, total: 2 })
  expect(result.data).toHaveLength(2)
})

it('rejects malformed IDs instead of coercing them into existing records', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '1e0', '0x1', '01', '9007199254740992', null, true]) {
    await expect(getItem(id)).rejects.toMatchObject({ status: 404, code: 'INVALID_ITEM_ID' })
  }
  expect((await getItem(1)).name).toBe('Alpha')
  expect((await getItem('1')).name).toBe('Alpha')
})
