# The Daemones — Minerva's Agent Pantheon

> **This is a documentation/identity layer, not a rename.** No edge function
> slug, cron schedule, or webhook URL changes because of this file. Every
> name below is a nickname for an existing, already-deployed function —
> `supabase/functions/<slug>/index.ts` is still the real, deployable name
> Stripe/Twilio/Xero/pg_cron actually call. Renaming the slugs themselves
> would mean re-registering three external webhooks and every cron job
> definition, for zero functional benefit — a real risk for a cosmetic
> gain, so it isn't done. Consider this the org chart, not the payroll
> system.

## Why "Daemones"

Greek δαίμων (*daimon*) originally meant a minor spirit or guardian entity —
smaller and more specialized than an Olympian god, usually bound to one
task, one place, or one person. It is also, literally, the etymological
root of the computing term **daemon**: a background process that runs
unattended, doing one job, indefinitely. The fit is exact rather than
decorative — Minerva's 58 autonomous edge functions *are* daemons in both
senses at once. Collectively, this document calls them **the Daemones**.

Names below deliberately skip the Olympian tier (Zeus, Apollo, Athena,
Hermes, Poseidon, Hades, Aphrodite, Artemis, Ares, Hera, Demeter, Dionysus)
and other names already heavily used in business/product branding (Nike,
Atlas, Icarus, Prometheus). Every name is a real, sourced figure from Greek
myth — primordial personifications, minor gods, Titans' children, or named
legendary (non-divine) figures like Automedon — chosen for a genuine
thematic match to what that specific function actually does, not assigned
at random.

---

## 1. The architecture, honestly described

### One daemon, one duty
There is no single monolithic "AI agent" in Minerva. There are 58 small,
single-purpose Deno edge functions, each triggered one of three ways:
- **Cron** (`pg_cron`, cadence from every 15 min to weekly) — the majority.
- **Event-driven** — fired by a Postgres trigger (`auto-assign-technician`)
  or directly from the frontend the moment something happens
  (`send-completion-sms`, `sync-technician-billing`).
- **Human-click, exactly once** — `launch-ad-campaign`,
  `send-growth-message`, `send-weather-reschedule-sms` — these never run on
  their own initiative at all.

No daemon does more than one job. `check-weather-risk` never sends an SMS.
`send-weather-reschedule-sms` never checks a forecast. This separation is
what makes the human-approval boundary (below) enforceable — the daemon
that decides something is risky is never the same daemon that can act on
that risk unsupervised.

### Data sharing: `agent_insights`
Daemons don't call each other directly or share memory in-process — each
invocation is a fresh, stateless function call. The one real cross-daemon
memory is the `agent_insights` table: a daemon can write a structured
finding (e.g. `forecast-demand` writes a `trend_address` insight), and a
later daemon can read it (`generate-growth-drafts` reads recent
`trend_address` insights to decide which suburb to suggest an ad for).
It's a shared bulletin board, not a shared brain — every insight is
`business_id`-scoped, so one business's trend data is never visible to
another's drafting run.

### The kill switch: `agent_functions.enabled`
Every autonomous daemon checks `agent_functions.enabled` for its own row
before doing anything else. Flipping that one column off stops that single
daemon — no redeploy, no code change, and no effect on the other 57. This
is the actual mechanism behind "adaptability" at the operator level: any
one daemon can be paused instantly if it misbehaves, without touching the
rest of the pantheon.

### Self-monitoring: `record_agent_run` + Aceso (`test-agent-health`)
Every daemon calls `record_agent_run()` on completion, logging its own
last-run timestamp and outcome. `test-agent-health` (named Aceso below)
runs every 15 minutes and passively reads that run history — it never
invokes any other daemon directly, since many of them have real side
effects (an SMS, a Slack post, a Stripe charge) that shouldn't fire just to
"check" something works. It flags a daemon as unhealthy if it's gone
stale relative to its own known cadence, or if its last run errored.

### Adaptability: the honest-fallback pattern
Every daemon that uses Claude for drafted content (quotes, growth copy,
intake conversation, reminder tone) has a plain, deterministic fallback
that runs automatically if `ANTHROPIC_API_KEY` is unset or the AI call
fails validation. The daemon never blocks the underlying action (a quote
still gets created, a reminder SMS still goes out) on AI availability — it
just loses the AI's specific improvement (natural language, personalized
tone) and falls back to a fixed template. The same pattern applies to
Slack (silently optional) and Twilio (SMS no-ops without configured
secrets, rather than erroring). This is real, code-verified graceful
degradation, not a marketing claim.

### The human-approval boundary
Two domains never let a daemon commit money or a physical resource on its
own: **Growth/Marketing** (`generate-growth-drafts` only ever writes a
draft; `launch-ad-campaign` and `send-growth-message` require a business
owner's explicit click) and **Industrial equipment dispatch**
(`industrial-conductor`, `optimize-industrial-routes` only ever *suggest*
an asset via Slack; nothing physically reassigns equipment without a
human confirming). Every other autonomous SMS in the app (nurture,
retention, reminders) is deliberately scoped to a single low-stakes,
one-time nudge per trigger — never a sequence, never a sales pitch.

### Multi-tenancy and reliability — stated precisely, not oversold
- **Isolation model**: per `SECURITY_NOTES.md`, Minerva's trust model is
  *"unguessable links, not logins"* — most tenant isolation is enforced by
  scoping every query with `.eq('business_id', ...)` and by UUIDs that are
  practically unguessable, rather than by strict per-row Postgres RLS on
  every table. This is a known, documented trade-off from the project's
  original design, not a newly discovered gap.
- **Per-tenant failure isolation genuinely varies by daemon**, and it's
  worth being exact about that rather than claiming uniform behavior:
  - `reconcile-billing` wraps each business's Stripe lookup in its own
    `try/catch` with `continue` — one business's Stripe API error is
    logged and skipped, and every other business in that run still gets
    checked.
  - `daily-digest` shares one outer `try/catch` around its whole
    per-business loop — a thrown error partway through *does* stop that
    run from reaching the remaining businesses that cron cycle. The
    function itself still returns cleanly (doesn't crash the runtime), and
    the next scheduled run picks up normally — but a business late in the
    loop could, in principle, wait for the next cycle if an earlier
    business's query throws. No cross-tenant data leakage occurs either
    way; the exposure is availability (delay), not confidentiality.
  - The honest summary: **no daemon crashes the platform, and no tenant's
    data ever becomes visible to another's** — but "every business gets
    served identically well on every single run" is not true of every
    daemon today. `reconcile-billing`'s pattern is the correct one; not
    every cron sweep has been retrofitted to match it yet.
- **Serving "many clients simultaneously"** is real in the sense that
  matters most for a SaaS: every query, insight, draft, and SMS is scoped
  to one `business_id`, so growth in tenant count doesn't mean growth in
  cross-tenant risk — it means more rows filtered by an ordinary indexed
  column. It is not real in the sense of true per-tenant work queues,
  retries, or SLAs; this is still a single shared cron fleet running
  against every business's rows in a loop, not distributed execution.

---

## 2. The Pantheon, by domain

### Trade Dispatch & Field Ops
| Daemon | Function | Duty |
|---|---|---|
| **Automedon** *(Achilles' charioteer — his name literally means "self-ruling")* | `auto-assign-technician` | Assigns the nearest free technician to a new job, automatically, only when a business has opted in. |
| **Angelia** *(obscure messenger-goddess of news)* | `send-job-assignment-sms` | Texts a technician their new job (and the outgoing technician, on reassignment). |
| **Arke** *(minor winged messenger-goddess, a swift herald of approach)* | `send-eta-sms` | Fires when a technician comes within 2km of the client — sends the "on our way" text. |
| **Ossa** *(Homeric personification of a spreading report)* | `send-completion-sms` | Texts the client once a technician marks the job done. |
| **Panoptes** *(epithet meaning "all-seeing" — the hundred-eyed watchman)* | `detect-wasted-trips` | Cross-checks GPS breadcrumbs against jobs stuck at "scheduled" to catch no-shows/wasted trips. |
| **Iaso** *(goddess of recuperation)* | `reconcile-technician-state` | Self-heals a known drift where a job completes but the technician's `current_job_id` never clears. |
| **Nemesis** *(balance and retribution against excess)* | `update-technician-workload` | Recomputes rolling hours/emergency-job load per technician — the burnout/fair-rotation guard. |
| **Thallo** *(a Hora, goddess of the season of blooming)* | `calendar-feed` | Serves the public, unauthenticated ICS calendar feed for Google/Apple/Outlook subscription. |
| **Proteus** *(shape-shifting prophetic sea god)* | `run-custom-workflows` | Executes each business's own custom trigger→condition→action rules — takes whatever shape a business configures. |

### Leads, Intake & Client Relationships
| Daemon | Function | Duty |
|---|---|---|
| **Phantasos** *(one of the three Oneiroi, shaper of imagined things)* | `ai-intake-chat` | Runs the AI intake widget that triages a prospect and captures a lead. |
| **Kairos** *(god of the critical, opportune moment)* | `missed-call-webhook` | Catches a missed call on Twilio and texts the caller back immediately. |
| **Talthybius** *(Agamemnon's herald in the Iliad — carries messages on others' behalf)* | `notify-slack` | Generic internal Slack notifier used by most other daemons. |
| **Elpis** *(spirit of hope)* | `nurture-stale-leads` | Two scheduled touches keeping a new, unclaimed lead warm before it goes cold. |
| **Peitho** *(goddess of persuasion)* | `winback-lost-leads` | One re-engagement text, 14 days after a lead is marked lost — then never touches it again. |
| **Philotes** *(goddess of friendship/affection)* | `retention-checkin` | A low-pressure "need anything else?" text to past clients who haven't returned in 30+ days. |
| **Pheme** *(goddess of fame and report)* | `daily-digest` | Posts each business's 24-hour Slack summary, plus "silent automation" escalation flags. |

### Quoting, Invoicing & Billing
| Daemon | Function | Duty |
|---|---|---|
| **Morpheus** *(Oneiros who shapes human forms in dreams)* | `draft-quote` | Drafts a line-item quote from a plain-English job description. |
| **Pothos** *(minor god of yearning/longing — a quote sent out, hoping the client accepts)* | `send-quote-sms` | Texts a quote to the client — only on a dispatcher's explicit click. |
| **Plutus** *(god of wealth)* | `send-invoice-sms` | Texts the client their invoice link after job completion. |
| **Poine** *(spirit of penalty for an unpaid debt)* | `chase-unpaid-invoices` | Daily reminder sweep for invoices unpaid 3+ days, throttled to once every 3 days on actual send success. |
| **Eunomia** *(goddess of good order and lawful governance, one of the Horae)* | `reconcile-billing` | Compares local connected-technician counts against Stripe's billed quantity and flags drift. |
| **Harmonia** *(goddess of concord)* | `sync-technician-billing` | Recomputes and syncs Stripe subscription quantity the moment a technician's phone first reports in. |
| **Euthenia** *(personification of prosperity)* | `create-checkout-session` | Creates the Stripe Checkout session for a new subscription. |
| **Eleutheria** *(personification of liberty)* | `create-billing-portal-session` | Opens the Stripe Customer Portal so a business can self-serve manage or cancel. |
| **Themis** *(goddess of divine law and decree)* | `stripe-webhook` | Receives and records Stripe's account-of-record events onto the business row. |
| **Charis** *(goddess of grace and gratitude)* | `send-referral-code-sms` | Texts a referral code the moment an invoice is marked paid — the "thank you, tell a friend" nudge. |
| **Euphemia** *(goddess of praise and good report)* | `send-review-request-sms` | Texts a paid client a link asking for a public review. |

### Growth & Marketing — human-approval gated, no exceptions
| Daemon | Function | Duty |
|---|---|---|
| **Icelus** *(a dream-shaping minor god — conjures a persuasive vision, not yet real)* | `generate-growth-drafts` | Weekly: drafts an ad idea and a win-back SMS as *pending* rows only — never sends or spends. |
| **Auxesia** *(obscure growth-goddess, worshipped at Aegina)* | `launch-ad-campaign` | The one place real ad spend commits — only on a human's explicit "Approve & Launch" click. |
| **Thelxinoe** *(an early, little-known Muse name meaning "she who charms the mind")* | `send-growth-message` | Sends an already-drafted, already-approved outreach SMS — only on a human's click. |

### Verification, Safety & Compliance
| Daemon | Function | Duty |
|---|---|---|
| **Rhadamanthus** *(one of the three Judges of the Underworld)* | `verify-checklist-photos` | AI-reviews technician checklist photos for dispute-protection evidence; never blocks the technician's own workflow. |
| **Horkos** *(obscure god who punishes broken oaths — son of Eris)* | `check-credential-expiry` | Flags technician licence/ticket expiries at 30/14/7 days, with an urgent ping if someone's on an active job. |

### Inventory & Consumables
| Daemon | Function | Duty |
|---|---|---|
| **Opora** *(personification of the harvest/autumn's yield)* | `check-inventory-levels` | Daily Slack alert when a stock item drops to/below its reorder threshold, once per low-stock episode. |
| **Aristaeus** *(minor god of husbandry, provisioning, and rural craft)* | `track-consumables` | Hourly sweep flagging depleted on-site consumables (chemicals, wire, valves) for reorder. |

### Weather & Field Risk
| Daemon | Function | Duty |
|---|---|---|
| **Aeolus** *(keeper of the winds)* | `check-weather-risk` | Checks tomorrow's jobs against a free forecast API and drafts a reschedule suggestion for weather-risky ones. |
| **Notus** *(the south wind, bringer of storms)* | `send-weather-reschedule-sms` | Sends an already-drafted reschedule text — only on a human's "Approve & Send" click. |

### Sustainability
| Daemon | Function | Duty |
|---|---|---|
| **Chloris** *(goddess of vegetation and greenery)* | `estimate-job-carbon` | Daily per-technician estimate of transit CO2-e from that day's completed jobs (straight-line distance, clearly caveated). |

### Industrial Sector
| Daemon | Function | Duty |
|---|---|---|
| **Pontos** *(primordial sea god, father of the sea-deities — a broad, central domain)* | `industrial-conductor` | Matches urgent industrial leads to the nearest available asset and posts a Slack recommendation — never auto-commits equipment. |
| **Glaucus** *(fisherman-turned-prophetic sea god, ever wandering)* | `optimize-industrial-routes` | Every 30 min, suggests the nearest unassigned asset for any site with none geofenced yet. |
| **Nereus** *(the Old Man of the Sea, always truthful)* | `monitor-asset-telemetry` | Real-time ingestion endpoint for asset telemetry pings — the ground-truth data source for the sector. |
| **Aergia** *(minor goddess of sloth and inactivity, daughter of Eris)* | `detect-idle-assets` | Daily sweep flagging assets that have gone quiet — no telemetry ping in the idle threshold window. |
| **Telesphorus** *(obscure god of convalescence, depicted as a hooded child)* | `predict-asset-maintenance` | Projects usage rate from real ping history to flag maintenance needs *before* the reactive threshold trips. |
| **Aeacus** *(a Judge of the Underworld)* | `package-client-verification` | Assembles telemetry/checkin/safety evidence into a client-facing sign-off package on request. |
| **Astraea** *(star-maiden goddess of justice, who fled the earth to the sky)* | `verify-industrial-compliance` | Hourly backstop escalating safety incidents unacknowledged 24h+ after being raised. |
| **Alastor** *(an avenging spirit for unresolved wrongs)* | `detect-safety-hazards` | Every 15 min, flags a human technician and an automated process both "on site" at once — a proximity hazard. |
| **Hecate** *(goddess of crossroads and guidance between paths)* | `sequence-handoffs` | Every 15 min, nudges Slack when an automated task finished and no human has picked up the handoff. |
| **Euryphaessa** *(obscure Titaness, "wide-shining" — mother of sun, moon, and dawn)* | `harvest-industrial-leads` | Ingests batches of industrial leads from CSV/vendor exports into structured rows. |
| **Euporia** *(personification of resourcefulness/plenty)* | `enrich-industrial-leads` | Accepts legitimately-sourced decision-maker contact data onto a lead, and nudges Slack when enrichment is the blocking step. |

### Xero / Accounting Integration
| Daemon | Function | Duty |
|---|---|---|
| **Pistis** *(personification of good faith and trust)* | `xero-oauth-connect` | Step 1 — redirects to Xero's own consent screen. |
| **Aletheia** *(goddess of truth)* | `xero-oauth-callback` | Step 2 — exchanges the auth code for real tokens and stores them. |
| **Palaemon** *(minor sea god, protector of safe harbor for merchants)* | `xero-sync-invoice` | Pushes a Minerva invoice into Xero as a draft ACCREC invoice for human review. |

### Public / Unauthenticated Endpoints
| Daemon | Function | Duty |
|---|---|---|
| **Adrasteia** *(epithet meaning "the inescapable one" — nothing that happens here goes unrecorded)* | `track-review-click` | Records the first click on a review-request link, then redirects to the business's Google review page. |
| **Melinoe** *(minor goddess associated with appeasing restless, ownerless spirits)* | `flag-abandoned-signups` | Daily flag (never deletes) for signups 48h+ old that never completed Stripe checkout. |

### Agent Operating System (Infrastructure)
| Daemon | Function | Duty |
|---|---|---|
| **Lachesis** *(the Fate who measures out the thread — apportions the past week into a report)* | `agent-council-report` | Weekly, platform-wide synthesis of the last 7 days' agent activity, written for the Minerva operator — not any one customer. |
| **Aceso** *(minor goddess of the process of healing/recovery from an illness)* | `test-agent-health` | Every 15 min, passively checks every other daemon's run history for staleness or errors. |
| **Talos** *(the mythical bronze automaton that patrolled Crete)* | `send-email` | Generic transactional email sender — a documented, honest no-op until `RESEND_API_KEY` is configured. |
| **Aglaea** *(goddess of splendor and adornment — the fresh start of a new setup)* | `send-setup-sms` | Texts each technician their setup link the moment a business finishes onboarding. |
| **Clio** *(Muse of history)* | `forecast-demand` | Weekly trend comparison (recent 2 weeks vs prior 2 weeks) per client address — directional signal, not a trained model. |

---

## 3. Character Dossiers

Every daemon below gets three things: a **Symbol** (a visual shorthand for
its domain), a **Nature** (a personality trait derived from what its code
*actually does* — cautious daemons are cautious because they're
human-approval-gated in the real code, not by invented flavor), and a
**Bond** (who it actually hands data or work to/from, where that's real).
Where a daemon has no real bond to another, none is listed — invented
relationships would misrepresent the architecture.

### Trade Dispatch & Field Ops

**Automedon** — *self-ruling*
- Symbol: a chariot wheel, already turning.
- Nature: decisive and silent — acts the instant a job with no technician
  is created, but only for businesses that opted in; otherwise doesn't
  move at all.
- Bond: hands the job to Angelia the moment it picks a technician.

**Angelia** — *the news-bearer*
- Symbol: a folded note, still warm.
- Nature: immediate and literal — repeats exactly what it's told (job
  address, client, time), nothing more, to whichever technician now holds
  the job and, if reassigned, to whoever just lost it.
- Bond: fires on Automedon's assignment and on a dispatcher's manual one.

**Arke** — *the swift herald of approach*
- Symbol: a horizon line, closing.
- Nature: watches distance, not time — says nothing until the technician
  crosses the 2km mark, then speaks exactly once per job.

**Ossa** — *the spreading report*
- Symbol: a closed door, opening.
- Nature: terse and final — one message, the moment a technician marks
  the job done, then goes quiet on that job forever.

**Panoptes** — *the all-seeing*
- Symbol: an unmoving dot, watched too long.
- Nature: patient and suspicious of stillness — reads the same GPS trail
  everyone else generates just by working, watching for a technician
  parked near a client for 15+ minutes on a job that never went "active."
- Bond: reuses Automedon's/technicians' breadcrumb trail; invents no new
  tracking of its own.

**Iaso** — *quiet recovery*
- Symbol: a hairline crack, sealed.
- Nature: self-healing and uncredited — fixes exactly one known drift
  (a completed job whose technician never got un-assigned) and never
  announces that it did.

**Nemesis** — *balance against excess*
- Symbol: a scale, gently correcting.
- Nature: fair rather than punitive — doesn't block overworked
  technicians from being assigned more jobs, just makes the imbalance
  visible (rolling hours, rolling emergency-job count) so a human can act.

**Thallo** — *the season of new growth*
- Symbol: an open gate, no lock on it.
- Nature: purely receptive — never pushes anything to anyone; sits still
  and answers whenever Google/Apple/Outlook's own calendar app happens to
  poll it.

**Proteus** — *the shape-shifter*
- Symbol: a blank shape, waiting to be told what to become.
- Nature: has no fixed personality at all — it is whatever trigger/
  condition/action rule each business writes for it, and nothing more;
  the one daemon whose behavior isn't fixed by Minerva at all.

### Leads, Intake & Client Relationships

**Phantasos** — *the shaper of imagined things*
- Symbol: a half-finished sketch, in conversation.
- Nature: adaptive under pressure — triages free-text into
  emergency/routine/out-of-scope using Claude, but instantly becomes
  rigid and literal (a fixed five-question script) the moment the AI key
  is missing, rather than failing the conversation.
- Bond: writes the lead that Talthybius then announces and Elpis later
  nurtures.

**Kairos** — *the opportune instant*
- Symbol: a phone, ringing once, unanswered.
- Nature: exists only in the moment of a missed call — has no memory
  before or after it, just a single reflex text back.

**Talthybius** — *the herald who carries word for others*
- Symbol: a webhook URL, pasted into a settings box.
- Nature: has no opinions of its own — relays exactly what every other
  daemon hands it, to exactly one Slack channel, and stays completely
  silent for any business that hasn't configured one.
- Bond: the shared voice of Phantasos, Elpis, Poine, Automedon, Pheme,
  and most others that need to speak to a human.

**Elpis** — *hope, kept alive twice*
- Symbol: an ember, fed exactly twice.
- Nature: gently persistent, then done — speaks once at 2 hours, once
  more at 24 hours, and never again regardless of outcome; doesn't chase.

**Peitho** — *persuasion, once*
- Symbol: a single closing door, held open a moment longer.
- Nature: patient to the point of stillness — waits 14 full days after a
  lead is marked lost, sends exactly one low-pressure message, then
  never revisits that lead no matter what happens.

**Philotes** — *the bond of affection maintained*
- Symbol: a porch light, left on.
- Nature: unhurried and warm — checks in only with people who already
  trusted the business once (a past completed job), never a stranger,
  and only after 30 days of silence.

**Pheme** — *report and rumor, gathered honestly*
- Symbol: an open ledger, read aloud each evening.
- Nature: comprehensive and self-critical — doesn't just tally wins
  (jobs, leads, revenue), but specifically calls out where its
  sibling daemons' own nudges have quietly failed to land.
- Bond: reads outcomes of Elpis's and Poine's touches to build its
  "silent automation" flags.

### Quoting, Invoicing & Billing

**Morpheus** — *shaper of forms out of nothing*
- Symbol: a blank invoice line, filling itself in.
- Nature: resourceful under failure — if the AI pricing pass fails or
  isn't configured, doesn't block the quote; hands back a blank editable
  line rather than an error.
- Bond: prices using this SAME business's own historical invoice lines
  only — never another business's pricing data.

**Pothos** — *yearning for an answer*
- Symbol: a paper airplane, mid-flight.
- Nature: entirely deferential — never sends on its own initiative,
  only the instant a dispatcher clicks "Send to Client."

**Plutus** — *wealth, delivered plainly*
- Symbol: a coin, handed over without ceremony.
- Nature: matter-of-fact — a single link, no persuasion, the moment a
  technician finishes building the invoice.

**Poine** — *the debt that doesn't forget*
- Symbol: a calendar square, circled in red.
- Nature: relentless but honest — re-sends every 3 days for as long as
  an invoice stays unpaid, but ONLY advances its own clock on a message
  that actually succeeded (fixed 2026-09-07 — it used to advance the
  clock even on a failed send, which meant a Twilio hiccup could buy an
  invoice 3 days of silence it hadn't earned).
- Bond: feeds Pheme's "3+ reminders, still unpaid" escalation flag.

**Eunomia** — *good order, quietly enforced*
- Symbol: two columns of numbers, compared.
- Nature: exacting and non-punitive — checks Stripe's billed quantity
  against who's actually connected, and on any mismatch tells a human
  rather than silently "correcting" what a client is charged.

**Harmonia** — *concord between two ledgers*
- Symbol: two gears, meshing.
- Nature: self-correcting by design — recomputes the full technician
  count from scratch every single time rather than incrementing, so a
  missed or duplicated call never leaves it wrong for long.

**Euthenia** — *prosperity, offered*
- Symbol: a door marked "Checkout."
- Nature: purely transactional — creates the Stripe session and steps
  aside; has no opinion on price or plan beyond what's configured.

**Eleutheria** — *the freedom to leave*
- Symbol: an unlocked exit.
- Nature: exists specifically so "cancel anytime" is true and not just
  promised copy — opens the real Stripe Customer Portal on request,
  closing a gap that used to require asking a human for help to cancel.

**Themis** — *the record of what was actually agreed*
- Symbol: a stamped ledger page.
- Nature: a scribe, not a judge — persists whatever Stripe reports onto
  the business record; makes no decisions of its own.

**Charis** — *gratitude, timed well*
- Symbol: a small gift, handed over at the door.
- Nature: opportunistic in the gentlest sense — speaks exactly once per
  invoice, at the single best possible moment (right after payment),
  and never again for that invoice.

**Euphemia** — *praise, requested politely*
- Symbol: a folded card that says "how did we do?"
- Nature: only ever asks, never insists — and refuses outright (an
  honest 400, not a broken link) if the business hasn't set up a review
  link yet, rather than sending a client somewhere dead.

### Growth & Marketing — every one of these three defers to a human

**Icelus** — *the vision, not yet real*
- Symbol: a sealed envelope marked "draft."
- Nature: proposes and stops — writes an ad idea and a win-back message
  as pending rows and never, under any configuration, sends or spends
  on its own.
- Bond: hands its drafts to Auxesia and Thelxinoe, and only they can act
  on them, only on a human's click.

**Auxesia** — *growth, only once approved*
- Symbol: a paused campaign, one switch from live.
- Nature: the one daemon in this pillar that touches real money — and
  for that exact reason, it never runs unless a human clicks "Approve &
  Launch"; even then it creates the campaign PAUSED first.

**Thelxinoe** — *the charm in a well-timed message*
- Symbol: a single sent message, already reviewed.
- Nature: executes, never composes — sends exactly what a human already
  read and approved in Icelus's draft; writes nothing itself.

### Verification, Safety & Compliance

**Rhadamanthus** — *a judge who never blocks the accused*
- Symbol: a photo, annotated in the margin.
- Nature: an evidence-keeper, not a gate — reviews checklist photos for
  a later dispute, but never stops or alters a technician's own
  submission in the moment.

**Horkos** — *the price of a broken oath*
- Symbol: a licence card, with a date circled.
- Nature: calm until it isn't — a routine 30/14/7-day nudge, until a
  credentialed technician is actually on an active job with an expired
  or near-expired ticket, at which point it escalates urgency sharply.

### Inventory & Consumables

**Opora** — *the yield, watched as it thins*
- Symbol: a shelf, one item lower than usual.
- Nature: alerts once per low-stock episode, not every day it stays
  low — waits for a restock (crossing back above threshold) before it
  will ever speak about that item again.

**Aristaeus** — *provisioning for the working day*
- Symbol: a nearly-empty drum, tagged for reorder.
- Nature: hourly and unglamorous — the industrial-sector mirror of
  Opora, watching chemicals/wire/valves instead of shelf stock, with the
  identical "flag once, re-arm after restock" discipline.

### Weather & Field Risk

**Aeolus** — *keeper of the winds, and what they'll disrupt tomorrow*
- Symbol: a weathervane, turning early.
- Nature: cautious and advisory only — checks a free public forecast
  against tomorrow's weather-sensitive jobs and writes a draft; never
  sends anything itself.
- Bond: hands its draft to Notus, who alone can act on it.

**Notus** — *the storm-wind, spoken of only when approved*
- Symbol: a single reschedule text, sent once.
- Nature: entirely reactive — exists only to fire the one message a
  human already approved on Aeolus's draft; never initiates on its own.

### Sustainability

**Chloris** — *green growth, honestly measured*
- Symbol: a straight line drawn between two points on a map.
- Nature: rigorously self-caveated — computes a real number from real
  completed-job locations, but is explicit (in its own header comment)
  that it's straight-line distance, not real road routing, and carries
  no material/embodied-carbon component at all.

### Industrial Sector

**Pontos** — *the sea that touches every shore*
- Symbol: a compass, pointed at the nearest available asset.
- Nature: central but deferential — matches an urgent lead to the
  nearest free asset and recommends it in Slack, but never commits
  equipment on its own; a wrong dispatch here is too expensive to
  automate past a human.

**Glaucus** — *the ever-wandering, watching for gaps*
- Symbol: a site marker with no asset pinned to it yet.
- Nature: a scout, not a dispatcher — every 30 minutes, finds sites with
  nothing geofenced and suggests, exactly like Pontos, without ever
  assigning outright.

**Nereus** — *the old man of the sea, who never lies*
- Symbol: a steady pulse on a live feed.
- Nature: purely a witness — has no vendor hardware to speak of yet, so
  it is honestly the raw ingestion point real telemetry (or a manual
  ping) would feed, nothing invented on top.
- Bond: feeds Aergia and Telesphorus their raw ping history.

**Aergia** — *the quiet that means something's wrong*
- Symbol: a dashboard gauge, frozen mid-reading.
- Nature: notices absence, not activity — flags an asset only once it's
  gone fully silent past the idle threshold; says nothing about assets
  that are simply being used normally.

**Telesphorus** — *recovery, anticipated before the injury*
- Symbol: an hourglass, still half full.
- Nature: forward-looking by real math, not guesswork — projects usage
  rate from an asset's own actual ping history to flag maintenance
  before the reactive threshold trips, and says plainly it isn't a
  cross-client model, just this asset's own trend.

**Aeacus** — *a judge who assembles the case, not the verdict*
- Symbol: a folder, three tabs, all filled.
- Nature: a compiler of evidence, not an authority — gathers telemetry,
  checkins, and safety records into one client-facing package only
  when asked, and never characterizes them beyond presenting them.

**Astraea** — *justice, fled to the sky but still watching*
- Symbol: a star, fixed above an unresolved case.
- Nature: patient once, insistent after — the backstop that escalates
  an incident specifically because 24 hours passed with no human
  acknowledgment; stays quiet before that window and escalates exactly
  once after.
- Bond: escalates what Alastor first raised.

**Alastor** — *the unresolved wrong, noticed early*
- Symbol: two dots on a map, closer than they should be.
- Nature: fast and literal — every 15 minutes, checks only for a human
  and an automated process both "on site" at once; raises it once per
  overlap, not on every sweep that overlap continues.
- Bond: hands anything unacknowledged to Astraea after 24 hours.

**Hecate** — *the guide between one hand and the next*
- Symbol: a torch, held out at a crossroads.
- Nature: notices handoffs that never happened — flags when an
  automated process finished a task and no human has picked up the
  follow-on work an hour later; says nothing if someone already has.

**Euryphaessa** — *wide-shining, at the start of the day's work*
- Symbol: a stack of intake forms, freshly filed.
- Nature: purely custodial — takes leads exactly as handed to it (a CSV
  export, a manual batch) and structures them; invents no leads and
  scrapes nothing itself.
- Bond: hands structured leads to Euporia and Pontos.

**Euporia** — *resourcefulness, applied honestly*
- Symbol: a half-filled contact card.
- Nature: accepts real data from real legitimate sources only — refuses
  to pretend it can scrape decision-maker contacts, and instead nudges
  a human when enrichment is genuinely the blocking step.

### Xero / Accounting Integration

**Pistis** — *good faith, extended first*
- Symbol: a door to someone else's house, knocked on politely.
- Nature: makes the first move and then steps back — redirects to
  Xero's own consent screen and does nothing further until Xero replies.

**Aletheia** — *the truth of a completed handshake*
- Symbol: a token, exchanged and locked away.
- Nature: careful with what it's given — exchanges the auth code for
  real tokens and stores them somewhere nothing else (not even the
  browser) can read, using the service-role key specifically because
  these are real third-party credentials, unlike the rest of the demo
  data in this build.
- Bond: completes what Pistis started.

**Palaemon** — *safe harbor for a merchant's ledger*
- Symbol: an invoice, still in draft, waiting in a harbor.
- Nature: deliberately incomplete on purpose — pushes a Minerva invoice
  into Xero as a DRAFT, never AUTHORISED, so a human reviews it in Xero
  before a client ever sees it from there.

### Public / Unauthenticated Endpoints

**Adrasteia** — *nothing here goes unrecorded*
- Symbol: a single footprint, timestamped.
- Nature: records exactly once — the first click on a review link, and
  never again for that link — then redirects, or fails honestly with
  plain text if the business's review link was since cleared.

**Melinoe** — *tending what was left unclaimed*
- Symbol: an open tab, left running.
- Nature: notices, never deletes — flags a signup abandoned 48+ hours
  after Stripe checkout never completed, and leaves the actual decision
  to delete anything entirely to a human.

### Agent Operating System (Infrastructure)

**Lachesis** — *measuring the week's thread*
- Symbol: a spool of thread, cut once a week.
- Nature: reflective and platform-wide — the one daemon that reports to
  the Minerva operator, not to any single business, synthesizing what
  every other daemon did across all tenants in the last 7 days.
- Bond: reads `agent_insights` and every daemon's run history at once.

**Aceso** — *recovery, monitored not performed*
- Symbol: a pulse line, checked every quarter hour.
- Nature: deliberately passive — refuses to invoke any of the daemons
  it watches (most have real side effects — an SMS, a Slack post, a
  Stripe charge), and instead only reads what they've already logged
  about themselves.
- Bond: reads what every other daemon writes via `record_agent_run()`.

**Talos** — *the automaton that keeps working even unconfigured*
- Symbol: a sealed envelope, stamped but unsent.
- Nature: honest about its own limits — if no email key is configured,
  says so plainly (`skipped:true`) rather than pretending to have sent
  anything, so callers relying on it never fail a real event over a
  missing email key.

**Aglaea** — *the polish on a fresh start*
- Symbol: a new phone, one notification waiting.
- Nature: exists at exactly one moment — the instant a business finishes
  onboarding — and speaks once to each technician, never again.

**Clio** — *history, read forward as a trend*
- Symbol: two bar charts, side by side.
- Nature: modest about what it actually is — real trend arithmetic
  (recent 2 weeks vs. prior 2 weeks) on a business's own bookings, and
  explicit that it is not a trained forecasting model.
- Bond: writes `trend_address` insights that Icelus later reads.

---

## 4. What this document is *not*

It is not a refactor, not a rename of any deployed slug, and not a claim
that any of this mythology exists in running code, database rows, or
customer-facing UI. It is a naming/organization layer for talking about
the system — useful for internal discussion, onboarding, or a future
architecture diagram — laid directly on top of the real, already-audited
58 functions and their real, already-verified behavior.
