// Pure presence-tracking logic for detect-safety-hazards, extracted so it
// can be unit tested with Vitest (Deno edge functions can't be imported
// into Node directly — see other logic.ts files in this repo for the same
// pattern). This IS the production logic; index.ts imports it directly.

export interface Checkin {
  id: string
  person_name: string | null
  role: string
  checkin_type: string
  created_at: string
}

// Presence ("on site") is strictly arrival-until-departure. task_start/
// task_complete are task-level progress markers, not site-presence signals
// — a person who finished a task but hasn't departed yet is still "on
// site" and must stay in the registry (see index.ts header comment for the
// real bug this fixed on 2026-09-07: task_complete used to incorrectly
// clear presence).
export function computeOpenPresenceByPerson(checkins: Checkin[]): Map<string, string> {
  const openByPerson = new Map<string, string>()
  for (const c of checkins) {
    const key = c.person_name || c.id
    if (c.checkin_type === 'arrival' || c.checkin_type === 'task_start') openByPerson.set(key, c.role)
    if (c.checkin_type === 'departure') openByPerson.delete(key)
  }
  return openByPerson
}

export function hasHumanMachineOverlap(checkins: Checkin[]): boolean {
  const roles = Array.from(computeOpenPresenceByPerson(checkins).values())
  return roles.includes('human_technician') && roles.includes('automated_process')
}
