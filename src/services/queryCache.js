// In-memory cache: successful responses expire; failed responses are never cached.
export function createQueryCache({ ttlMs = 30_000, maxEntries = 100 } = {}) {
  const entries = new Map()

  function trim() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break
      // Do not evict active requests: concurrent callers must share their promise.
      if (!entry.promise) entries.delete(key)
    }
  }

  function get(queryKey, load, { force = false } = {}) {
    const key = JSON.stringify(queryKey)
    const cached = entries.get(key)
    if (!force && cached && (cached.promise || cached.expiresAt > Date.now())) {
      entries.delete(key)
      entries.set(key, cached)
      return cached.promise || Promise.resolve(cached.value)
    }

    const entry = { promise: null, value: undefined, expiresAt: 0 }
    entries.set(key, entry)
    entry.promise = Promise.resolve().then(load).then((value) => {
      // Invalidation or a forced refresh superseded this request. Its callers
      // receive the newer result too, rather than a pre-mutation snapshot.
      if (entries.get(key) !== entry) return get(queryKey, load)
      entry.value = value
      entry.expiresAt = Date.now() + ttlMs
      entry.promise = null
      trim()
      return value
    }, (error) => {
      if (entries.get(key) !== entry) return get(queryKey, load)
      entries.delete(key)
      throw error
    })
    trim()
    return entry.promise
  }

  function invalidate() {
    entries.clear()
  }

  return { get, invalidate }
}
