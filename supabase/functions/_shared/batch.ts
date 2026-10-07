// Shared batching helper — splits an array into fixed-size chunks so a
// cron function can process many rows with BOUNDED concurrency (Promise.all
// per chunk, sequential between chunks) instead of either fully sequential
// (slow, risks the Edge Function wall-clock timeout once row counts grow
// into the hundreds/thousands) or fully unbounded Promise.all over the
// whole array at once (could overwhelm Stripe's API / the DB connection
// pool with as many simultaneous requests as there are rows). Added
// 2026-10-08, scale-readiness pass — first used by reconcile-billing and
// update-technician-workload, both of which had a fully sequential
// for-loop over every business/technician on the platform.
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
