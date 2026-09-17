// ESPN's scoreboard endpoints stopped honoring the `dates=YYYYMMDD-YYYYMMDD`
// range syntax. A range now comes back as HTTP 200 with an empty `events`
// array rather than an error, so every range query silently returned no games
// at all — and because the call sites tolerate failures, nothing surfaced.
//
// The single-month (`YYYYMM`) form still works, so ranges are expanded into
// one request per month and the events merged back together. The year form
// (`YYYY`) also works but buckets by calendar year rather than by season, so
// it splits a season across two queries and mixes in the previous one —
// months keep the caller's original season window intact.

const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports'

// Sweeping by month turns each former range into up to a dozen requests, and
// the Home tab kicks off every league's sweep at once. Cap the in-flight
// count so no single league starves the others.
const MAX_CONCURRENT = 12

// Whole months covering the range, inclusive. Both bounds are `YYYYMMDD`;
// partial months at either end are widened to the full month, which only ever
// pulls in extra events the callers already filter and de-duplicate.
export function monthsBetween(startDate, endDate) {
  let year  = Number(startDate.slice(0, 4))
  let month = Number(startDate.slice(4, 6))
  const endYear  = Number(endDate.slice(0, 4))
  const endMonth = Number(endDate.slice(4, 6))

  const months = []
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}${String(month).padStart(2, '0')}`)
    if (++month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

async function pooled(items, worker) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        try {
          results[i] = await worker(items[i])
        } catch {
          results[i] = []
        }
      }
    })
  )
  return results
}

// Every event in `path`'s scoreboard between the two `YYYYMMDD` bounds.
// A month that fails — an off-season gap, or a league slug ESPN no longer
// serves — contributes nothing instead of failing the whole sweep.
export async function fetchScoreboardMonths(path, startDate, endDate, params = {}) {
  const pages = await pooled(monthsBetween(startDate, endDate), async month => {
    const url = new URL(`${SITE_API}/${path}/scoreboard`)
    url.searchParams.set('dates', month)
    url.searchParams.set('limit', '300')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

    const res = await fetch(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    return data.events ?? []
  })

  const seen = new Set()
  return pages.flat().filter(e => {
    if (!e?.id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}
