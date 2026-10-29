// Pure validation for submit-job-satisfaction, extracted so it can be
// unit-tested with Vitest — same split as respond-to-quote/logic.ts.

const VALID_RATINGS = ['good', 'not_great']

export function isValidRating(rating: string | null): boolean {
  return !!rating && VALID_RATINGS.includes(rating)
}

// A rating can only be submitted once a job is actually complete, and
// only if nothing's been submitted yet — same "atomic claim" shape as
// respond-to-quote's canRespond(), prevents a replayed/double-tapped
// request from overwriting an already-submitted rating.
export function canSubmitRating(jobStatus: string | null, existingRating: string | null): boolean {
  return jobStatus === 'complete' && !existingRating
}
