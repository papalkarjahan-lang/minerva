# Minerva Industrial — Sub-Vertical Expansion Roadmap (Scoping Only)

Client 9 as currently scoped ("Industrial / Heavy-Equipment Site
Operations") is deliberately a single, broad profile — not split into
sub-verticals yet. This doc is a scoping reference for how it *could* split
later, once there's real client feedback to justify it. **This is not a
build plan and not a set of new pitch scripts** — writing 3-4 more full
Client-9-style scripts before a single real industrial client exists would
be scope creep ahead of evidence, which cuts against how every other part
of Minerva has been built (real client first, script refined after).

## Why not split now

Client 9 is unproven — zero real industrial clients as of this writing. The
broad "site operations" framing lets one sales motion cover the buyer types
below without committing to which one actually converts first. Splitting
now would mean guessing which sub-vertical matters before any real
conversation confirms it.

## The plausible splits, and what would actually be different about each

Drawn from the wider "Blueprint" doc's industry list, cross-checked against
what Track B's actual schema (`supabase_schema_delta_industrial.sql`)
already supports — none of these need new tables to pilot, only a narrower
opener and objection set:

- **Civil / roadworks contractors** — multiple crews across scattered,
  short-duration sites (weeks, not months). What would differ: the site
  check-in log matters more than the asset register here, since equipment
  is often leased short-term rather than owned. Pitch would lean harder on
  the client verification package (councils/principal contractors often
  require proof-of-work sign-off) and less on engine-hours maintenance
  alerts.
- **Utilities subcontractors (power/water/telecoms)** — safety incident
  logging matters most here (regulated, auditable work), and the
  human/equipment proximity flag (the Warden) is a genuinely strong fit
  given live-line and trench-work hazards. Would need to check whether
  this buyer's compliance requirements need anything the current safety
  incident log doesn't capture (e.g., specific regulator-mandated fields) —
  unknown until a real conversation happens.
- **Mining services subcontractors** — asset register + engine-hours
  maintenance alerts matter most (owned, expensive, long-lived equipment).
  Real telemetry (not just manual entry) is more likely to be a hard
  requirement here, not a nice-to-have, given the equipment values
  involved — meaning this sub-vertical may not be sellable at all until a
  real telematics integration exists, unlike the others.
- **Logistics / site-transport subcontractors** — closest to Minerva's
  original GPS-tracking core, but for freight/plant-transport rather than
  trade technicians. Would need to check whether `site_checkins` and
  `industrial_assets` map cleanly onto vehicles-in-transit rather than
  fixed-site equipment, or whether this is actually closer to a Trade-tier
  fit than an Industrial-tier one — genuinely unclear, worth a real
  conversation before assuming either way.

## What determines the actual split (do this before writing more scripts)

1. Run Client 9 as currently scoped against real prospects across at least
   2-3 of the buyer types above.
2. Track which objections and questions differ by buyer type — if
   everyone asks the same 3 questions regardless of sector, there's no
   real case for splitting. If civil-sector prospects keep asking something
   utilities prospects never do, that's the signal to write a dedicated
   script.
3. Only then write a sub-vertical-specific pitch — and only for the
   sub-vertical(s) that actually showed a distinct pattern, not all four
   pre-emptively.

## What NOT to do

- Don't build sub-vertical-specific database fields or UI before a real
  client asks for something the current schema can't represent.
  `supabase_schema_delta_industrial.sql` is intentionally general-purpose
  across all four of these buyer types right now — keep it that way until
  proven otherwise.
- Don't quote mining-services prospects on real-time telemetry pricing
  until a specific hardware/vendor integration has actually been scoped
  and costed for that client — per the honesty note already in the schema
  file and repeated in `CLIENT_PITCHES_ADDENDUM.md`.
