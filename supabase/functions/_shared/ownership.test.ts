import { describe, it, expect } from 'vitest'
import { isOwnerOfBusiness, isOwnerOrAssignedTechnician, isOwnerOrTechnicianOfBusiness, isAdminCaller, getAuthenticatedCaller } from './ownership'

describe('isOwnerOfBusiness', () => {
  it('returns false for a null/undefined business', () => {
    expect(isOwnerOfBusiness(null, 'user-1', 'a@b.com')).toBe(false)
    expect(isOwnerOfBusiness(undefined, 'user-1', 'a@b.com')).toBe(false)
  })

  it('returns true when owner_user_id matches the caller', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOfBusiness(biz, 'user-1', 'someone-else@b.com')).toBe(true)
  })

  it('returns false when owner_user_id is set but does not match the caller', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOfBusiness(biz, 'user-2', 'a@b.com')).toBe(false)
  })

  it('auto-claim: returns true when no owner yet and caller email matches contact_email (case-insensitive)', () => {
    const biz = { owner_user_id: null, contact_email: 'Owner@Example.com' }
    expect(isOwnerOfBusiness(biz, 'user-2', 'owner@example.com')).toBe(true)
  })

  it('returns false when no owner yet and caller email does not match contact_email', () => {
    const biz = { owner_user_id: null, contact_email: 'owner@example.com' }
    expect(isOwnerOfBusiness(biz, 'user-2', 'stranger@example.com')).toBe(false)
  })

  it('returns false when no owner yet and caller has no email', () => {
    const biz = { owner_user_id: null, contact_email: 'owner@example.com' }
    expect(isOwnerOfBusiness(biz, 'user-2', null)).toBe(false)
  })

  it('returns false when business has neither owner_user_id nor contact_email', () => {
    const biz = { owner_user_id: null, contact_email: null }
    expect(isOwnerOfBusiness(biz, 'user-2', 'anyone@example.com')).toBe(false)
  })
})

describe('isOwnerOrAssignedTechnician', () => {
  it('returns true when the caller is the business owner, regardless of technician', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOrAssignedTechnician(biz, null, 'user-1', 'a@b.com')).toBe(true)
  })

  it('returns true when the caller is the assigned technician, regardless of owner', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const tech = { auth_user_id: 'user-2' }
    expect(isOwnerOrAssignedTechnician(biz, tech, 'user-2', 'tech@b.com')).toBe(true)
  })

  it('returns false when the caller is neither the owner nor the assigned technician', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const tech = { auth_user_id: 'user-2' }
    expect(isOwnerOrAssignedTechnician(biz, tech, 'user-3', 'stranger@b.com')).toBe(false)
  })

  it('returns false when technician is null/undefined and caller is not the owner', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOrAssignedTechnician(biz, null, 'user-3', 'stranger@b.com')).toBe(false)
    expect(isOwnerOrAssignedTechnician(biz, undefined, 'user-3', 'stranger@b.com')).toBe(false)
  })

  it('returns false when technician.auth_user_id is null', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const tech = { auth_user_id: null }
    expect(isOwnerOrAssignedTechnician(biz, tech, 'user-3', 'stranger@b.com')).toBe(false)
  })
})

describe('isOwnerOrTechnicianOfBusiness', () => {
  it('returns true when the caller is the business owner, regardless of technicians', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOrTechnicianOfBusiness(biz, [], 'user-1', 'a@b.com')).toBe(true)
  })

  it('returns true when the caller matches any technician in the roster', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const techs = [{ auth_user_id: 'user-2' }, { auth_user_id: 'user-3' }]
    expect(isOwnerOrTechnicianOfBusiness(biz, techs, 'user-3', 'tech@b.com')).toBe(true)
  })

  it('returns false when the caller is neither the owner nor any technician in the roster', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const techs = [{ auth_user_id: 'user-2' }]
    expect(isOwnerOrTechnicianOfBusiness(biz, techs, 'user-4', 'stranger@b.com')).toBe(false)
  })

  it('returns false when technicians is null/undefined/empty and caller is not the owner', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    expect(isOwnerOrTechnicianOfBusiness(biz, null, 'user-4', 'stranger@b.com')).toBe(false)
    expect(isOwnerOrTechnicianOfBusiness(biz, undefined, 'user-4', 'stranger@b.com')).toBe(false)
    expect(isOwnerOrTechnicianOfBusiness(biz, [], 'user-4', 'stranger@b.com')).toBe(false)
  })

  it('ignores technicians with a null auth_user_id', () => {
    const biz = { owner_user_id: 'user-1', contact_email: 'a@b.com' }
    const techs = [{ auth_user_id: null }]
    expect(isOwnerOrTechnicianOfBusiness(biz, techs, 'user-4', 'stranger@b.com')).toBe(false)
  })
})

describe('isAdminCaller', () => {
  function fakeAdminUsersClient(rows: Record<string, { user_id: string }>) {
    return {
      from: (table: string) => {
        expect(table).toBe('admin_users')
        return {
          select: (_columns: string) => ({
            eq: (column: string, value: string) => {
              expect(column).toBe('user_id')
              return { maybeSingle: async () => ({ data: rows[value] || null, error: null }) }
            },
          }),
        }
      },
    }
  }

  it('returns true when the caller has a row in admin_users', async () => {
    const supabase = fakeAdminUsersClient({ 'user-1': { user_id: 'user-1' } })
    expect(await isAdminCaller(supabase, 'user-1')).toBe(true)
  })

  it('returns false when the caller has no row in admin_users', async () => {
    const supabase = fakeAdminUsersClient({ 'user-1': { user_id: 'user-1' } })
    expect(await isAdminCaller(supabase, 'user-2')).toBe(false)
  })
})

describe('getAuthenticatedCaller', () => {
  function fakeRequest(authHeader: string | null): Request {
    return {
      headers: { get: (name: string) => (name === 'Authorization' ? authHeader : null) },
    } as unknown as Request
  }

  it('returns null when there is no Authorization header', async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
    const result = await getAuthenticatedCaller(fakeRequest(null), supabase)
    expect(result).toBeNull()
  })

  it('returns null when the token is rejected by auth.getUser', async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: null }, error: new Error('invalid') }) } }
    const result = await getAuthenticatedCaller(fakeRequest('Bearer bad-token'), supabase)
    expect(result).toBeNull()
  })

  it('returns the caller id/email when the token is valid, stripping the Bearer prefix', async () => {
    let receivedToken: string | null = null
    const supabase = {
      auth: {
        getUser: async (token: string) => {
          receivedToken = token
          return { data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null }
        },
      },
    }
    const result = await getAuthenticatedCaller(fakeRequest('Bearer good-token'), supabase)
    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' })
    expect(receivedToken).toBe('good-token')
  })

  it('defaults email to null when auth.getUser returns a user with no email', async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }
    const result = await getAuthenticatedCaller(fakeRequest('Bearer good-token'), supabase)
    expect(result).toEqual({ id: 'user-1', email: null })
  })
})
