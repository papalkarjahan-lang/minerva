// Pure logic for notify-trial-ending, isolated from the Stripe/Supabase
// calls around it so the trial-window math can be unit tested directly —
// Stripe's trial_end is Unix SECONDS, everything else in this codebase's
// date math is JS milliseconds, and that mismatch is an easy, high-impact
// mistake to make silently (the reminder would fire constantly or
// basically never, not loudly error).

export interface TrialReminderDecision {
  // Whether to actually send the reminder this run.
  shouldSend: boolean
  // Whether to stamp trial_ending_reminder_sent_at so this business is
  // never re-checked again. True both when the reminder is sent AND when
  // Stripe reports the business is no longer trialing at all (converted
  // to paid, or cancelled, before ever reaching the window) — without
  // this second case, a business that converts early would stay stuck in
  // every future run's candidate set forever, since nothing else would
  // ever set the claim column for it. Same "self-clearing isn't the same
  // as bounded" lesson this project's own SCALE_READINESS_NOTES_ROUND2.md
  // already names for a different function — a column that stops
  // matching a WHERE clause for the right reason still has to actually
  // get set, or the candidate set only ever grows.
  shouldClaim: boolean
  daysLeft: number
}

// nowMs and trialEndUnixSeconds are both required (not Date.now()
// internally) so this stays a pure function callers can test with a
// fixed clock instead of real wall-clock time.
export function evaluateTrialEndingReminder(
  status: string,
  trialEndUnixSeconds: number | null | undefined,
  nowMs: number,
  windowDays: number
): TrialReminderDecision {
  // No longer trialing (converted to paid, cancelled, etc. — or Stripe
  // never set trial_end at all, which only happens for a non-trial
  // subscription) — nothing to remind about, but claim it so this
  // business drops out of every future run's candidate set for good.
  if (status !== 'trialing' || !trialEndUnixSeconds) return { shouldSend: false, shouldClaim: true, daysLeft: 0 }

  const msLeft = trialEndUnixSeconds * 1000 - nowMs
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  // floor, not ceil: a trial ending in 3 hours is "today," not "1 day" —
  // ceil would round any sub-24h remainder up to a full day, understating
  // how soon it actually is. floor always reports the number of full days
  // of runway actually left, which is the more honest direction to round
  // a countdown (never implies more time remains than really does).
  const daysLeft = Math.max(0, Math.floor(msLeft / (24 * 60 * 60 * 1000)))

  // Still trialing but outside the reminder window — genuinely not due
  // yet (too far out: check again tomorrow, getting closer) or already
  // past trial_end (Stripe's own invoice.payment_succeeded/failed webhook
  // handles the actual conversion on its own; this function only ever
  // reminds BEFORE that happens). Either way, don't claim — a still-
  // trialing business that's just not in the window yet needs to stay a
  // candidate so it gets caught once it actually enters the window.
  if (msLeft > windowMs || msLeft < 0) return { shouldSend: false, shouldClaim: false, daysLeft }

  return { shouldSend: true, shouldClaim: true, daysLeft }
}

export function formatWhenText(daysLeft: number): string {
  return daysLeft <= 0 ? 'ends today' : `ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
}
