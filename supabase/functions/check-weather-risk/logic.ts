// Pure weather-risk threshold logic for check-weather-risk, extracted out of
// index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports this same
// function, so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports, no fetch) on purpose —
// this is a plain, synchronous, side-effect-free calculation over a
// forecast object.

export const RAIN_PROB_THRESHOLD = 70 // %
export const WIND_THRESHOLD_KMH = 60
export const HEAT_THRESHOLD_C = 40

export interface Forecast {
  rainProb: number
  windKmh: number
  maxTempC: number
}

export interface RiskEvaluation {
  risky: boolean
  reasons: string[]
}

// Evaluates a single day's forecast against the three independent risk
// thresholds (rain probability, wind speed, extreme heat) — any one of
// them being met makes the job risky, and each met threshold contributes
// its own human-readable reason to the summary.
export function evaluateForecastRisk(forecast: Forecast): RiskEvaluation {
  const reasons: string[] = []
  if (forecast.rainProb >= RAIN_PROB_THRESHOLD) reasons.push(`${forecast.rainProb}% chance of rain`)
  if (forecast.windKmh >= WIND_THRESHOLD_KMH) reasons.push(`wind up to ${Math.round(forecast.windKmh)} km/h`)
  if (forecast.maxTempC >= HEAT_THRESHOLD_C) reasons.push(`forecast high of ${Math.round(forecast.maxTempC)}°C`)
  return { risky: reasons.length > 0, reasons }
}
