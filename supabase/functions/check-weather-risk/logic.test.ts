import { describe, it, expect } from 'vitest'
import { evaluateForecastRisk } from './logic'

describe('evaluateForecastRisk', () => {
  it('is not risky when all values are below every threshold', () => {
    const result = evaluateForecastRisk({ rainProb: 20, windKmh: 15, maxTempC: 25 })
    expect(result.risky).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('is risky on rain probability meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 70, windKmh: 10, maxTempC: 20 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['70% chance of rain'])
  })

  it('is risky on wind speed meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 0, windKmh: 60, maxTempC: 20 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['wind up to 60 km/h'])
  })

  it('is risky on heat meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 0, windKmh: 0, maxTempC: 40 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['forecast high of 40°C'])
  })

  it('accumulates all matching reasons when multiple thresholds are met', () => {
    const result = evaluateForecastRisk({ rainProb: 80, windKmh: 70, maxTempC: 42 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['80% chance of rain', 'wind up to 70 km/h', 'forecast high of 42°C'])
  })

  it('is not risky just below every threshold', () => {
    const result = evaluateForecastRisk({ rainProb: 69, windKmh: 59, maxTempC: 39 })
    expect(result.risky).toBe(false)
  })
})
