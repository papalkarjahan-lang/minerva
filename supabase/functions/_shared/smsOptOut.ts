// Shared opt-out check used by every client-facing SMS sender (ETA,
// completion, invoice, quote, review-request, referral code, job
// cancelled/rescheduled, appointment reminder). Does real DB I/O so it
// isn't unit tested with Vitest — there's nothing meaningful to assert
// without mocking Supabase itself, and the one thing worth testing
// (isStopKeyword/isStartKeyword matching) already lives in sms.ts/
// sms.test.ts as pure functions.
//
// Deliberately NOT applied to technician-facing sends (send-job-
// assignment-sms, send-setup-sms, the *TechMessage legs of send-job-
// cancelled-sms/send-job-rescheduled-sms) — opt-out is a client/consumer
// concept; a business's own staff can't unsubscribe from being told about
// their own jobs.
export async function isOptedOutOfSms(
  supabase: { from: (table: string) => any },
  businessId: string | null | undefined,
  phone: string
): Promise<boolean> {
  if (!businessId || !phone) return false
  const { data } = await supabase
    .from('sms_opt_outs')
    .select('phone')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .maybeSingle()
  return !!data
}
