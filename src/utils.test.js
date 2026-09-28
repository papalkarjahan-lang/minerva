import { describe, it, expect, afterEach, vi } from 'vitest'
import { haversineKm, generatePin, generateReferralCode, timeAgo, insertTechniciansWithPinRetry, classifyPriority, normalizeAddressForGeocoding, pickBestGeocodeFeature, isMapboxTokenConfigured, computeReplayStats, interpolateReplayPosition, describeAuditEntry, computeTechnicianReliability, RELIABILITY_FATIGUE_BASELINE_HOURS } from './utils'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBeCloseTo(0, 5)
  })

  it('returns the known distance between Sydney and Melbourne (~713km)', () => {
    // Landmark-to-landmark great-circle distance, tolerant to ~10km since
    // this is just a sanity check on the formula, not a precise fixture.
    const km = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(km).toBeGreaterThan(700)
    expect(km).toBeLessThan(720)
  })
})

describe('generatePin', () => {
  it('returns an 8-character string', () => {
    expect(generatePin()).toHaveLength(8)
  })

  it('only uses characters from the no-ambiguity alphabet', () => {
    const pin = generatePin()
    expect(pin).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('does not repeat across many calls (collision sanity check)', () => {
    const pins = new Set(Array.from({ length: 1000 }, () => generatePin()))
    expect(pins.size).toBe(1000)
  })
})

describe('generateReferralCode', () => {
  it('returns a 6-character string from the same alphabet', () => {
    const code = generateReferralCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('timeAgo', () => {
  it('returns "never" for null/undefined', () => {
    expect(timeAgo(null)).toBe('never')
    expect(timeAgo(undefined)).toBe('never')
  })

  it('returns "just now" for a timestamp seconds ago', () => {
    expect(timeAgo(new Date(Date.now() - 5000).toISOString())).toBe('just now')
  })

  it('returns minutes for a timestamp under an hour old', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 mins ago')
  })

  it('returns hours for a timestamp under a day old', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600 * 1000).toISOString())).toBe('3 hrs ago')
  })
})

describe('insertTechniciansWithPinRetry', () => {
  // Minimal fake of the chained supabase-js query builder shape this
  // function relies on: supabase.from(...).insert(...).select()
  function makeFakeSupabase(insertResults) {
    let call = 0
    return {
      from: () => ({
        insert: () => ({
          select: async () => insertResults[Math.min(call++, insertResults.length - 1)],
        }),
      }),
    }
  }

  it('returns data on first successful insert, assigning a pin to each row', async () => {
    const fakeRows = [{ business_id: 'b1', name: 'Alice' }]
    const supabase = makeFakeSupabase([{ data: [{ ...fakeRows[0], pin: 'X' }], error: null }])
    const { data, error } = await insertTechniciansWithPinRetry(supabase, fakeRows)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('retries on a unique_violation (23505) and eventually succeeds', async () => {
    const fakeRows = [{ business_id: 'b1', name: 'Alice' }]
    const supabase = makeFakeSupabase([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: [{ ...fakeRows[0], pin: 'Y' }], error: null },
    ])
    const { data, error } = await insertTechniciansWithPinRetry(supabase, fakeRows)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('does not retry on a non-collision error', async () => {
    let attempts = 0
    const supabase = {
      from: () => ({
        insert: () => ({
          select: async () => { attempts++; return { data: null, error: { code: '23503', message: 'fk violation' } } },
        }),
      }),
    }
    const { data, error } = await insertTechniciansWithPinRetry(supabase, [{ business_id: 'bad' }])
    expect(data).toBeNull()
    expect(error.code).toBe('23503')
    expect(attempts).toBe(1)
  })
})

describe('normalizeAddressForGeocoding', () => {
  it('collapses repeated whitespace', () => {
    expect(normalizeAddressForGeocoding('123   Main St,   Sydney')).toBe('123 Main St, Sydney')
  })

  it('trims leading/trailing whitespace', () => {
    expect(normalizeAddressForGeocoding('  123 Main St  ')).toBe('123 Main St')
  })

  it('returns an empty string for null/undefined', () => {
    expect(normalizeAddressForGeocoding(null)).toBe('')
    expect(normalizeAddressForGeocoding(undefined)).toBe('')
  })
})

describe('pickBestGeocodeFeature', () => {
  it('returns null for empty/missing features', () => {
    expect(pickBestGeocodeFeature([])).toBeNull()
    expect(pickBestGeocodeFeature(null)).toBeNull()
    expect(pickBestGeocodeFeature(undefined)).toBeNull()
  })

  it('returns the top feature when relevance is high', () => {
    const features = [{ relevance: 1, center: [151.2, -33.8] }]
    expect(pickBestGeocodeFeature(features)).toBe(features[0])
  })

  it('rejects the top feature when relevance is below the threshold', () => {
    const features = [{ relevance: 0.3, center: [151.2, -33.8] }]
    expect(pickBestGeocodeFeature(features)).toBeNull()
  })

  it('accepts a feature with no relevance field (treats as trusted)', () => {
    const features = [{ center: [151.2, -33.8] }]
    expect(pickBestGeocodeFeature(features)).toBe(features[0])
  })
})

describe('classifyPriority', () => {
  it('returns "urgent" for messages containing an urgent keyword', () => {
    expect(classifyPriority("it's down and nobody can log in")).toBe('urgent')
    expect(classifyPriority('I was charged twice this month')).toBe('urgent')
    expect(classifyPriority('please cancel my subscription')).toBe('urgent')
  })

  it('returns "normal" for messages without an urgent keyword', () => {
    expect(classifyPriority('How do I add a new technician?')).toBe('normal')
    expect(classifyPriority('Loving the app so far, quick question about invoices')).toBe('normal')
  })

  it('is case-insensitive', () => {
    expect(classifyPriority('THIS IS AN EMERGENCY')).toBe('urgent')
    expect(classifyPriority('Can I get a REFUND please')).toBe('urgent')
  })
})

describe('isMapboxTokenConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns false when the token is missing', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    expect(isMapboxTokenConfigured()).toBe(false)
  })

  it('returns false for the shipped documentation placeholder token', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.eyJ1IjoieW91cnVzZXJuYW1lIiwi...')
    expect(isMapboxTokenConfigured()).toBe(false)
  })

  it('returns false for any other value containing "..."', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.abc...xyz')
    expect(isMapboxTokenConfigured()).toBe(false)
  })

  it('returns false for a malformed token missing the signature segment', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.onlyOneSegment')
    expect(isMapboxTokenConfigured()).toBe(false)
  })

  it('returns true for a well-formed pk.<payload>.<signature> token', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.eyJ1IjoicmVhbHVzZXIifQ.abcDEF123-_signature')
    expect(isMapboxTokenConfigured()).toBe(true)
  })
})

describe('computeReplayStats', () => {
  it('returns zeroed stats for an empty/missing list', () => {
    expect(computeReplayStats([])).toEqual({ pingCount: 0, totalDistanceKm: 0, durationMinutes: 0, jobIds: [], sorted: [] })
    expect(computeReplayStats(null)).toEqual({ pingCount: 0, totalDistanceKm: 0, durationMinutes: 0, jobIds: [], sorted: [] })
  })

  it('sorts out-of-order pings by recorded_at before computing anything', () => {
    const locations = [
      { lat: -33.87, lng: 151.21, recorded_at: '2026-09-01T09:10:00Z', job_id: null },
      { lat: -33.87, lng: 151.21, recorded_at: '2026-09-01T09:00:00Z', job_id: null },
    ]
    const { sorted } = computeReplayStats(locations)
    expect(sorted[0].recorded_at).toBe('2026-09-01T09:00:00Z')
    expect(sorted[1].recorded_at).toBe('2026-09-01T09:10:00Z')
  })

  it('sums haversine distance across consecutive pings', () => {
    const locations = [
      { lat: -33.8688, lng: 151.2093, recorded_at: '2026-09-01T09:00:00Z', job_id: 'j1' },
      { lat: -33.8688, lng: 151.2093, recorded_at: '2026-09-01T09:05:00Z', job_id: 'j1' }, // same spot, adds 0km
    ]
    const { totalDistanceKm } = computeReplayStats(locations)
    expect(totalDistanceKm).toBeCloseTo(0, 5)
  })

  it('computes duration in minutes between the first and last ping', () => {
    const locations = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z', job_id: null },
      { lat: 0, lng: 1, recorded_at: '2026-09-01T10:30:00Z', job_id: null },
    ]
    expect(computeReplayStats(locations).durationMinutes).toBe(90)
  })

  it('collects unique, non-null job_ids in first-seen order', () => {
    const locations = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z', job_id: 'j1' },
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:05:00Z', job_id: null },
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:10:00Z', job_id: 'j2' },
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:15:00Z', job_id: 'j1' },
    ]
    expect(computeReplayStats(locations).jobIds).toEqual(['j1', 'j2'])
  })

  it('reports the correct ping count', () => {
    const locations = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z', job_id: null },
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:05:00Z', job_id: null },
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:10:00Z', job_id: null },
    ]
    expect(computeReplayStats(locations).pingCount).toBe(3)
  })
})

describe('interpolateReplayPosition', () => {
  it('returns null for an empty/missing list', () => {
    expect(interpolateReplayPosition([], 1000)).toBeNull()
    expect(interpolateReplayPosition(null, 1000)).toBeNull()
  })

  it('returns the single point regardless of elapsedMs when there is only one ping', () => {
    const sorted = [{ lat: 1, lng: 2, recorded_at: '2026-09-01T09:00:00Z' }]
    expect(interpolateReplayPosition(sorted, 999999)).toEqual({ lat: 1, lng: 2, index: 0 })
  })

  it('clamps to the first point when elapsedMs is 0 or negative', () => {
    const sorted = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z' },
      { lat: 10, lng: 10, recorded_at: '2026-09-01T09:10:00Z' },
    ]
    expect(interpolateReplayPosition(sorted, 0)).toEqual({ lat: 0, lng: 0, index: 0 })
    expect(interpolateReplayPosition(sorted, -500)).toEqual({ lat: 0, lng: 0, index: 0 })
  })

  it('clamps to the last point when elapsedMs is beyond the recorded range', () => {
    const sorted = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z' },
      { lat: 10, lng: 10, recorded_at: '2026-09-01T09:10:00Z' },
    ]
    expect(interpolateReplayPosition(sorted, 20 * 60 * 1000)).toEqual({ lat: 10, lng: 10, index: 1 })
  })

  it('linearly interpolates the midpoint between two bracketing pings', () => {
    const sorted = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z' },
      { lat: 10, lng: 20, recorded_at: '2026-09-01T09:10:00Z' },
    ]
    const pos = interpolateReplayPosition(sorted, 5 * 60 * 1000) // halfway through the 10-minute gap
    expect(pos.lat).toBeCloseTo(5, 5)
    expect(pos.lng).toBeCloseTo(10, 5)
    expect(pos.index).toBe(0)
  })

  it('picks the correct bracketing pair across more than two points', () => {
    const sorted = [
      { lat: 0, lng: 0, recorded_at: '2026-09-01T09:00:00Z' },
      { lat: 10, lng: 10, recorded_at: '2026-09-01T09:10:00Z' },
      { lat: 20, lng: 20, recorded_at: '2026-09-01T09:20:00Z' },
    ]
    // 15 minutes in — between the 2nd and 3rd ping, 50% of the way
    const pos = interpolateReplayPosition(sorted, 15 * 60 * 1000)
    expect(pos.lat).toBeCloseTo(15, 5)
    expect(pos.lng).toBeCloseTo(15, 5)
    expect(pos.index).toBe(1)
  })
})

describe('describeAuditEntry', () => {
  it('returns an empty string for a missing entry or action', () => {
    expect(describeAuditEntry(null)).toBe('')
    expect(describeAuditEntry({})).toBe('')
  })

  it('describes a technician removal', () => {
    expect(describeAuditEntry({ action: 'technician.removed', details: { name: 'Jane Doe' } }))
      .toBe('Removed technician Jane Doe')
    expect(describeAuditEntry({ action: 'technician.removed', details: {} }))
      .toBe('Removed technician Unknown')
  })

  it('describes subcontractor added/removed', () => {
    expect(describeAuditEntry({ action: 'subcontractor.added', details: { name: 'Acme Sparky' } }))
      .toBe('Added subcontractor Acme Sparky')
    expect(describeAuditEntry({ action: 'subcontractor.removed', details: { name: 'Acme Sparky' } }))
      .toBe('Removed subcontractor Acme Sparky')
  })

  it('describes a job assignment, with and without a client name', () => {
    expect(describeAuditEntry({ action: 'job.assigned', details: { client_name: 'Bob Smith', assignee_name: 'Jane Doe' } }))
      .toBe('Assigned job for Bob Smith to Jane Doe')
    expect(describeAuditEntry({ action: 'job.assigned', details: {} }))
      .toBe('Assigned job to Unassigned')
  })

  it('describes an invoice payment, formatting the total', () => {
    expect(describeAuditEntry({ action: 'invoice.paid', details: { total: 245.5, client_name: 'Bob Smith' } }))
      .toBe('Marked invoice paid ($245.50) — Bob Smith')
    expect(describeAuditEntry({ action: 'invoice.paid', details: {} }))
      .toBe('Marked invoice paid')
  })

  it('describes a checklist template save, distinguishing completion vs onboarding', () => {
    expect(describeAuditEntry({ action: 'checklist_template.saved', details: { type: 'onboarding', name: 'New Hire SOP' } }))
      .toBe('Saved onboarding checklist "New Hire SOP"')
    expect(describeAuditEntry({ action: 'checklist_template.saved', details: { name: 'Job Sign-off' } }))
      .toBe('Saved completion checklist "Job Sign-off"')
  })

  it('describes a credential being added', () => {
    expect(describeAuditEntry({ action: 'credential.added', details: { credential_type: 'Licence', technician_name: 'Jane Doe' } }))
      .toBe('Recorded credential (Licence) for Jane Doe')
    expect(describeAuditEntry({ action: 'credential.added', details: {} }))
      .toBe('Recorded credential for a technician')
  })

  it('describes a saved payroll run', () => {
    expect(describeAuditEntry({ action: 'payroll.saved', details: { period_start: '2026-09-01', period_end: '2026-09-14', technician_count: 3 } }))
      .toBe('Saved payroll run (2026-09-01 to 2026-09-14) — 3 technicians')
    expect(describeAuditEntry({ action: 'payroll.saved', details: {} }))
      .toBe('Saved payroll run')
  })

  it('describes a sent quote', () => {
    expect(describeAuditEntry({ action: 'quote.sent', details: { total: 450, client_name: 'Bob Smith' } }))
      .toBe('Sent quote ($450.00) to Bob Smith')
    expect(describeAuditEntry({ action: 'quote.sent', details: {} }))
      .toBe('Sent quote')
  })

  it('describes an added or removed workflow', () => {
    expect(describeAuditEntry({ action: 'workflow.added', details: { name: 'Slack on new lead', trigger_event: 'lead.created' } }))
      .toBe('Added workflow "Slack on new lead" (on lead.created)')
    expect(describeAuditEntry({ action: 'workflow.added', details: {} }))
      .toBe('Added workflow "Untitled"')
    expect(describeAuditEntry({ action: 'workflow.removed', details: { name: 'Slack on new lead' } }))
      .toBe('Removed workflow "Slack on new lead"')
  })

  it('describes an updated business settings save', () => {
    expect(describeAuditEntry({ action: 'business.settings_updated', details: {} }))
      .toBe('Updated business settings')
  })

  it('falls back to the raw action string for an unknown action', () => {
    expect(describeAuditEntry({ action: 'something.unlisted', details: {} }))
      .toBe('something.unlisted')
  })
})

describe('computeTechnicianReliability', () => {
  it('returns null when there are no flagged photos and no fatigue', () => {
    expect(computeTechnicianReliability({ rolling_week_hours: 20 }, 0)).toBeNull()
    expect(computeTechnicianReliability({}, 0)).toBeNull()
    expect(computeTechnicianReliability(null, 0)).toBeNull()
  })

  it('returns null when hours are at or under the baseline, even with no flags', () => {
    expect(computeTechnicianReliability({ rolling_week_hours: RELIABILITY_FATIGUE_BASELINE_HOURS }, 0)).toBeNull()
  })

  it('scores flagged photos only, with correct singular/plural wording', () => {
    const oneFlag = computeTechnicianReliability({ rolling_week_hours: 10 }, 1)
    expect(oneFlag).toEqual({ score: 92, label: 'Good', reasons: ['1 flagged checklist photo'] })

    const twoFlags = computeTechnicianReliability({ rolling_week_hours: 10 }, 2)
    expect(twoFlags).toEqual({ score: 84, label: 'Watch', reasons: ['2 flagged checklist photos'] })
  })

  it('scores fatigue only, using the shared fatigue baseline', () => {
    const result = computeTechnicianReliability({ rolling_week_hours: 50 }, 0)
    expect(result).toEqual({ score: 85, label: 'Good', reasons: ['10h over the 40h/week baseline'] })
  })

  it('combines flagged photos and fatigue into one score with both reasons', () => {
    const result = computeTechnicianReliability({ rolling_week_hours: 50 }, 1)
    expect(result).toEqual({
      score: 77,
      label: 'Watch',
      reasons: ['1 flagged checklist photo', '10h over the 40h/week baseline'],
    })
  })

  it('labels a heavily flagged technician as "Review"', () => {
    const result = computeTechnicianReliability({ rolling_week_hours: 0 }, 6)
    expect(result.label).toBe('Review')
    expect(result.score).toBe(52)
  })

  it('never returns a negative score', () => {
    const result = computeTechnicianReliability({ rolling_week_hours: 200 }, 20)
    expect(result.score).toBe(0)
    expect(result.label).toBe('Review')
  })
})
