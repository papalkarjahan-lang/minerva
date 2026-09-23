import { describe, it, expect } from 'vitest'
import { sanitizeExtractedProspects } from './logic'

describe('sanitizeExtractedProspects', () => {
  it('drops rows with no company_name', () => {
    const result = sanitizeExtractedProspects([
      { company_name: 'Acme Plumbing' },
      { contact_name: 'Jane' }, // no company_name — must be dropped
      { company_name: '' }, // falsy — must be dropped
    ])
    expect(result).toHaveLength(1)
    expect(result[0].company_name).toBe('Acme Plumbing')
  })

  it('caps the result at 100 rows even if Claude returns more', () => {
    const raw = Array.from({ length: 150 }, (_, i) => ({ company_name: `Company ${i}` }))
    expect(sanitizeExtractedProspects(raw)).toHaveLength(100)
  })

  it('defaults every optional field to null when absent', () => {
    const [row] = sanitizeExtractedProspects([{ company_name: 'Acme' }])
    expect(row).toEqual({
      company_name: 'Acme',
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      trade_type: null,
      city: null,
    })
  })

  it('truncates each field to its documented max length', () => {
    const [row] = sanitizeExtractedProspects([{
      company_name: 'A'.repeat(300),
      contact_name: 'B'.repeat(300),
      contact_email: 'C'.repeat(300),
      contact_phone: 'D'.repeat(100),
      trade_type: 'E'.repeat(100),
      city: 'F'.repeat(200),
    }])
    expect(row.company_name).toHaveLength(200)
    expect(row.contact_name).toHaveLength(200)
    expect(row.contact_email).toHaveLength(200)
    expect(row.contact_phone).toHaveLength(50)
    expect(row.trade_type).toHaveLength(50)
    expect(row.city).toHaveLength(100)
  })

  it('coerces non-string values (e.g. a number) to strings without throwing', () => {
    const [row] = sanitizeExtractedProspects([{ company_name: 12345 }])
    expect(row.company_name).toBe('12345')
  })
})
