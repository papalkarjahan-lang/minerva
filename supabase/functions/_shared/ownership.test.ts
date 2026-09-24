import { describe, it, expect } from 'vitest'
import { isOwnerOfBusiness, getAuthenticatedCaller } from './ownership'

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
