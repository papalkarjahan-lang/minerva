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

### Self-monitoring: `record_agent_run` + Hygieia (`test-agent-health`)
Every daemon calls `record_agent_run()` on completion, logging its own
last-run timestamp and outcome. `test-agent-health` (named Hygieia below)
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
| **Arke** *(Iris's swift, lesser-known sister)* | `send-eta-sms` | Fires when a technician comes within 2km of the client — sends the "on our way" text. |
| **Ossa** *(Homeric personification of a spreading report)* | `send-completion-sms` | Texts the client once a technician marks the job done. |
| **Argus** *(Panoptes, the hundred-eyed watchman)* | `detect-wasted-trips` | Cross-checks GPS breadcrumbs against jobs stuck at "scheduled" to catch no-shows/wasted trips. |
| **Iaso** *(goddess of recuperation)* | `reconcile-technician-state` | Self-heals a known drift where a job completes but the technician's `current_job_id` never clears. |
| **Nemesis** *(balance and retribution against excess)* | `update-technician-workload` | Recomputes rolling hours/emergency-job load per technician — the burnout/fair-rotation guard. |
| **Thallo** *(a Hora, goddess of the season of blooming)* | `calendar-feed` | Serves the public, unauthenticated ICS calendar feed for Google/Apple/Outlook subscription. |
| **Proteus** *(shape-shifting prophetic sea god)* | `run-custom-workflows` | Executes each business's own custom trigger→condition→action rules — takes whatever shape a business configures. |

### Leads, Intake & Client Relationships
| Daemon | Function | Duty |
|---|---|---|
| **Phantasos** *(one of the three Oneiroi, shaper of imagined things)* | `ai-intake-chat` | Runs the AI intake widget that triages a prospect and captures a lead. |
| **Kairos** *(god of the critical, opportune moment)* | `missed-call-webhook` | Catches a missed call on Twilio and texts the caller back immediately. |
| **Iris** *(rainbow messenger of the gods)* | `notify-slack` | Generic internal Slack notifier used by most other daemons. |
| **Elpis** *(spirit of hope)* | `nurture-stale-leads` | Two scheduled touches keeping a new, unclaimed lead warm before it goes cold. |
| **Peitho** *(goddess of persuasion)* | `winback-lost-leads` | One re-engagement text, 14 days after a lead is marked lost — then never touches it again. |
| **Philotes** *(goddess of friendship/affection)* | `retention-checkin` | A low-pressure "need anything else?" text to past clients who haven't returned in 30+ days. |
| **Pheme** *(goddess of fame and report)* | `daily-digest` | Posts each business's 24-hour Slack summary, plus "silent automation" escalation flags. |

### Quoting, Invoicing & Billing
| Daemon | Function | Duty |
|---|---|---|
| **Morpheus** *(Oneiros who shapes human forms in dreams)* | `draft-quote` | Drafts a line-item quote from a plain-English job description. |
| **Litae** *(the Litai, spirits of entreaty from the Iliad)* | `send-quote-sms` | Texts a quote to the client — only on a dispatcher's explicit click. |
| **Plutus** *(god of wealth)* | `send-invoice-sms` | Texts the client their invoice link after job completion. |
| **Poine** *(spirit of penalty for an unpaid debt)* | `chase-unpaid-invoices` | Daily reminder sweep for invoices unpaid 3+ days, throttled to once every 3 days on actual send success. |
| **Dike** *(goddess of just judgment)* | `reconcile-billing` | Compares local connected-technician counts against Stripe's billed quantity and flags drift. |
| **Harmonia** *(goddess of concord)* | `sync-technician-billing` | Recomputes and syncs Stripe subscription quantity the moment a technician's phone first reports in. |
| **Euthenia** *(personification of prosperity)* | `create-checkout-session` | Creates the Stripe Checkout session for a new subscription. |
| **Eleutheria** *(personification of liberty)* | `create-billing-portal-session` | Opens the Stripe Customer Portal so a business can self-serve manage or cancel. |
| **Themis** *(goddess of divine law and decree)* | `stripe-webhook` | Receives and records Stripe's account-of-record events onto the business row. |
| **Charis** *(grace/gratitude, singular of the Charites)* | `send-referral-code-sms` | Texts a referral code the moment an invoice is marked paid — the "thank you, tell a friend" nudge. |
| **Euphemia** *(goddess of praise and good report)* | `send-review-request-sms` | Texts a paid client a link asking for a public review. |

### Growth & Marketing — human-approval gated, no exceptions
| Daemon | Function | Duty |
|---|---|---|
| **Icelus** *(also called Phobetor — the Oneiros who shapes animal/fearsome dream-forms)* | `generate-growth-drafts` | Weekly: drafts an ad idea and a win-back SMS as *pending* rows only — never sends or spends. |
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
| **Aether** *(primordial personification of the upper atmosphere)* | `estimate-job-carbon` | Daily per-technician estimate of transit CO2-e from that day's completed jobs (straight-line distance, clearly caveated). |

### Industrial Sector
| Daemon | Function | Duty |
|---|---|---|
| **Pontos** *(primordial sea god, father of the sea-deities — a broad, central domain)* | `industrial-conductor` | Matches urgent industrial leads to the nearest available asset and posts a Slack recommendation — never auto-commits equipment. |
| **Glaucus** *(fisherman-turned-prophetic sea god, ever wandering)* | `optimize-industrial-routes` | Every 30 min, suggests the nearest unassigned asset for any site with none geofenced yet. |
| **Nereus** *(the Old Man of the Sea, always truthful)* | `monitor-asset-telemetry` | Real-time ingestion endpoint for asset telemetry pings — the ground-truth data source for the sector. |
| **Hypnos** *(god of sleep)* | `detect-idle-assets` | Daily sweep flagging assets that have gone quiet — no telemetry ping in the idle threshold window. |
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
| **Mnemosyne** *(Titaness of memory)* | `track-review-click` | Records the first click on a review-request link, then redirects to the business's Google review page. |
| **Lethe** *(spirit of forgetting/oblivion)* | `flag-abandoned-signups` | Daily flag (never deletes) for signups 48h+ old that never completed Stripe checkout. |

### Agent Operating System (Infrastructure)
| Daemon | Function | Duty |
|---|---|---|
| **Moirai** *(the three Fates, who see the whole thread of things)* | `agent-council-report` | Weekly, platform-wide synthesis of the last 7 days' agent activity, written for the Minerva operator — not any one customer. |
| **Hygieia** *(goddess of health)* | `test-agent-health` | Every 15 min, passively checks every other daemon's run history for staleness or errors. |
| **Talos** *(the mythical bronze automaton that patrolled Crete)* | `send-email` | Generic transactional email sender — a documented, honest no-op until `RESEND_API_KEY` is configured. |
| **Hebe** *(goddess of youth)* | `send-setup-sms` | Texts each technician their setup link the moment a business finishes onboarding. |
| **Clio** *(Muse of history)* | `forecast-demand` | Weekly trend comparison (recent 2 weeks vs prior 2 weeks) per client address — directional signal, not a trained model. |

---

## 3. What this document is *not*

It is not a refactor, not a rename of any deployed slug, and not a claim
that any of this mythology exists in running code, database rows, or
customer-facing UI. It is a naming/organization layer for talking about
the system — useful for internal discussion, onboarding, or a future
architecture diagram — laid directly on top of the real, already-audited
58 functions and their real, already-verified behavior.
