// Run an async worker over `items` with at most `limit` running at once,
// preserving input order in the results. A worker that throws contributes
// `fallback` for that item instead of rejecting the whole batch — callers here
// are always assembling a best-effort view from many independent requests.
export async function pooledMap(items, worker, { limit = 12, fallback = null } = {}) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        try {
          results[i] = await worker(items[i], i)
        } catch {
          results[i] = fallback
        }
      }
    })
  )
  return results
}
