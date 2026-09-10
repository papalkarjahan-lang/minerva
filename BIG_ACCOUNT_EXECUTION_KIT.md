# Big Account Execution Kit

The tooling (`generate-roi-proposal`, `big_account_targets` CRM in
`AdminConsole.jsx`'s Big Accounts tab) removes the busywork. This document
is the other half: what to actually say, in what order, and — the part
that matters most — the *real, researched reasons* a multi-van/FM/council/
strata decision-maker would actually say yes, not assumed ones. Every claim
below is sourced; see the bottom of each section.

**Use this alongside `BIG_CONTRACTS_PLAYBOOK.md`** (the target types and
market math) and the Big Accounts tab (the tracker).

---

## 1. Who you're actually selling to (the buying committee)

This is not a single-decision-maker SMB sale once the target has real
scale. Real B2B fleet/facilities procurement research shows the buying
chain is typically: **Fleet/Operations Manager** (identifies the problem,
evaluates the solution) → **HR** (driver/technician policy implications) →
**Finance** (cost justification) → **Procurement** (contracting) →
**COO/owner** (final sign-off for anything with a real budget line). For a
true multi-van owner-operator business this collapses to just the owner;
for an FM company or council it's the full chain, and sales cycles run
**3-6+ months** — decision-maker access matters more than pitch quality
once the cycle is that long.

**How to apply:** for multi-van companies, one good call with the owner can
close it. For FM/council targets, expect to need a champion (usually the
Fleet/Ops Manager) who sells it internally for you — equip them with the
ROI proposal link and a one-line internal-forwarding summary, not just a
pitch aimed at them personally.

---

## 2. Discovery call script (first real conversation)

Goal of call 1: qualify + gather the real numbers `generate-roi-proposal`
needs (don't estimate fleet size/fuel spend if you can just ask).

1. "How many vehicles/technicians are you running right now, and how are
   you currently tracking where they are and what jobs they're on?" —
   qualifies fleet size AND surfaces whether they're on paper/spreadsheets,
   a competitor, or nothing.
2. "Roughly what's your monthly fuel spend across the fleet?" — if they
   don't know exactly, that's fine, the tool estimates conservatively from
   fleet size; a real number is always better when they have it.
3. "Have you had any compliance incidents, insurance claims, or audit
   findings related to vehicle safety or driver credentials in the last
   12 months?" — this is the real compliance pain point, not a hypothetical
   one (see §4).
4. "Who else would need to be involved in a decision like this?" — surfaces
   the buying committee from §1 directly instead of guessing.
5. "What's stopped you from adopting something like this already?" —
   surfaces the real objection up front (see §3) instead of discovering it
   at the end of the call.

Close call 1 with: "I'll put together a real numbers page for your fleet
specifically — no cost, no obligation, just the actual math for your
situation" → generate the ROI proposal from the Big Accounts tab using
what you just learned, and follow up with the link within 24 hours.

---

## 3. Objection handling (grounded, not guessed)

| Objection | Real research behind it | Response |
|---|---|---|
| "We already manage this fine with spreadsheets/paper." | Paper-based vehicle inspection records are skipped **40-55% of the time** on job sites under schedule pressure, and regulators treat incomplete paper records as evidence of negligent safety management — a real liability exposure, not a hypothetical one. | "That's exactly the gap — paper records get skipped under pressure and can't be produced cleanly in an audit. Minerva timestamps and signs every check automatically." |
| "How do we know you'll still be around / you're a small vendor." | This is a legitimate risk for any small vendor, and small vendors that offer a bounded pilot on a subset of the fleet (not the whole contract) measurably reduce this perceived risk and get onto a buyer's approved-vendor shortlist faster. | Be honest: "Minerva doesn't have enterprise certifications like SOC 2 yet — what we can offer instead is a no-lock-in pilot on 5-10 vehicles for 30-60 days, month-to-month, so you're not betting the whole fleet on day one." Never claim a certification Minerva doesn't have. |
| "Our drivers/techs won't adopt new tech." | Employee/driver buy-in is a real, commonly-cited failure point for fleet software rollouts — but the friction is usually proprietary hardware and unfamiliar devices, not the app itself. | "There's no dedicated hardware — it runs on the phone they already carry, same as texting. Nothing new to install in the vehicle." |
| "We don't want to pay for modules we won't use." | Enterprise fleet platforms commonly bundle GPS, maintenance, fuel, safety, and dispatch into one price tier regardless of what a given fleet actually needs — a real, cited buyer frustration. | "Minerva's priced per technician, not as a bundled enterprise suite — you're not paying for modules built for a different kind of fleet." |
| "Switching later would be a nightmare / vendor lock-in." | Hardware lock-in (proprietary tracking devices tied to one vendor's platform) is the actual mechanism that makes fleet-software switching costly in real cases. | "There's no proprietary hardware to rip out — it's phone-based. Your data also exports to Xero/CSV rather than being trapped in a closed system." |
| "This is a big decision, we need to loop in [Finance/Procurement/COO]." | This is not really an objection — per §1, it's the buying committee showing up as expected. | Don't push back on this — ask "what would be most useful to hand them?" and provide the ROI proposal link plus a one-paragraph summary they can forward directly. |

**Sources:** paper DVIR skip rates and audit-liability framing — fleet
compliance software research (Heavy Vehicle Inspection, FleetRabbit,
Vehocheck, Field Eagle); driver buy-in and bundled-module cost concerns —
FleetX 2026 Buyer's Playbook, MoldStud fleet-software decision-maker
toolkit; small-vendor pilot/trust-building — SaaStr, Heavybit, and
enterprise-SaaS-sales pilot-program research; hardware lock-in as the real
switching-cost driver — telematics vendor-evaluation research (Utilimarc,
cardata.co).

---

## 4. Why each target type would realistically say yes

Not generic optimism — the specific, real trigger for each type:

- **Multi-van trade company (10-50 vans, one owner):** the pain is almost
  always "we grew faster than our systems" — more vans than the owner can
  personally track by phone calls, and often a recent insurance renewal or
  a near-miss that made compliance suddenly feel urgent. Trigger to listen
  for: "we've had some close calls" or "our insurance broker asked about
  our driver records." Fastest close of the four types — one decision-maker,
  usually within weeks of a good discovery call, not months.
- **Facilities-management company:** the real trigger is a client contract
  renewal or a new client win that requires proof of compliance/response-
  time SLAs across many sites — FM companies dispatch technicians under
  contract and are contractually exposed if they can't prove service
  delivery. Slower close (3-6+ months, full buying committee from §1), but
  the payoff (50-200 techs) justifies the longer cycle.
- **Council/government fleet:** the real trigger is budget-cycle timing,
  not a pain point — councils run formal tender/procurement processes on
  fixed annual cycles. Realistically a 2027 win: start the relationship now
  (get on their vendor radar before their next budget cycle opens) but
  don't count this toward 2026 numbers.
- **Strata/property management company:** similar pain to FM (proving
  service delivery across sites) but smaller scale (5-30 techs) and a much
  smaller buying committee — often just the strata manager and the
  business owner — so this can close nearly as fast as a multi-van deal.

---

## 5. The pilot offer (use for every "not ready to commit" response)

A specific, real structure, not a vague "try it out":
- **Scope:** 5-10 vehicles/technicians (not the whole fleet) for 30-60 days.
- **Terms:** month-to-month, cancel anytime, no annual lock-in contract.
- **Success measure:** agree upfront on 1-2 things to check at the end —
  e.g. "did GPS/dispatch actually save dispatcher time" and "were
  compliance checklist records complete for 100% of jobs" (a real,
  checkable outcome, not a vague "see how it feels").
- **Why this works:** bounded pilots are a well-documented way for a small
  vendor to get onto a cautious buyer's shortlist without asking them to
  bet the whole fleet on an unproven vendor upfront.

---

## 6. Guardrails — do not overclaim

- Never claim SOC 2, ISO 27001, or any security certification Minerva does
  not actually have (it doesn't, as of this writing — see
  `SECURITY_NOTES.md` for the real unguessable-URL access model, and be
  ready to explain that honestly if asked).
- Every savings figure must stay framed as "estimated, conservative" —
  exactly how `generate-roi-proposal`/`ProposalView.jsx` already present it.
  Never present the ROI proposal number as a guarantee.
- Do not claim "lawsuit-proof" records or invent case studies/testimonials
  — no real client outcomes exist yet to cite. Use the real, general
  industry stats in §3 (which are about the industry, not fabricated
  Minerva-specific results) until real client data exists.
