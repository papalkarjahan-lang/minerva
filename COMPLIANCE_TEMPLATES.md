# Compliance & Admin — Document Templates

**⚠️ NOT LEGAL ADVICE.** These are generic starting-point templates only, written for
a hypothetical small Australian trade services business. They have **not** been
reviewed by a lawyer, are not tailored to your specific state/territory, business
structure, or client base, and may be missing clauses required for your situation
(e.g. Australian Consumer Law guarantees, state-based home building contract
thresholds like NSW's $5,000 HBA trigger, or industry licensing conditions).
**Have a qualified Australian solicitor review and customize every document below
before using it with real clients.** Minerva/Claude take no responsibility for
outcomes from using these templates as-is.

Fill in every `[BRACKETED]` field before use.

---

## 1. Terms of Service (client-facing, for quotes/invoices)

```
[BUSINESS NAME] — Terms of Service

1. Quotes are valid for 30 days from the date issued unless stated otherwise.
2. A quote is an estimate based on information available at the time of
   inspection/description. Final price may vary if the scope of work changes
   once work has begun, and [BUSINESS NAME] will notify the client before
   proceeding with any material price change.
3. Payment is due within [7] days of invoice date unless otherwise agreed in
   writing. Late payments may incur a reminder fee of [$0 / $X] after [X] days.
4. [BUSINESS NAME] warrants workmanship for [X months/years] from completion
   date, excluding damage from misuse, normal wear, or third-party work.
5. Cancellations within [24/48] hours of a scheduled appointment may incur a
   call-out fee of [$X].
6. Nothing in these terms limits any consumer guarantee you have under the
   Australian Consumer Law that cannot lawfully be excluded.
```

## 2. Privacy Notice (short-form, for SMS/chat intake)

```
[BUSINESS NAME] collects your name, phone number, address and job details
solely to provide the service you've requested (quoting, scheduling,
invoicing, and following up about that job). We do not sell your data. We may
send you SMS updates about your job, invoice, or — occasionally — a check-in
if you haven't needed us in a while; reply STOP at any time to opt out of
non-essential messages. Data is stored with our service provider (Supabase,
hosted in [REGION]) and retained for as long as reasonably needed for
bookkeeping and warranty purposes. Contact [EMAIL] to request access to or
deletion of your data.
```

## 3. Job Completion Sign-off (for the technician checklist / client signature)

```
Job completed at [ADDRESS] on [DATE] by [TECHNICIAN NAME].
Work performed: [SUMMARY]
Client acknowledges the work described above has been completed to their
satisfaction. Any concerns should be raised with [BUSINESS NAME] within
[48 hours / 7 days] of this sign-off.

Client signature: ______________________   Date: __________
```

## 4. Subcontractor / Technician Onboarding Checklist (paperwork side, not the in-app checklist)

```
[ ] Signed services agreement / employment contract on file
[ ] Relevant trade license or certification sighted and copy kept on file
    (sighted by: __________, date: __________)
[ ] Public liability insurance certificate sighted (if subcontractor)
[ ] Working with Children Check (if applicable to your work — e.g. school/
    childcare site visits) sighted
[ ] Emergency contact details collected
[ ] Briefed on [BUSINESS NAME]'s customer-facing standards and use of Minerva
    (GPS tracking while clocked on, job checklist completion, etc.)
```

---

### Why these aren't wired into the app automatically

Minerva can store and surface these documents (e.g. attach the Terms of
Service link to quotes, or gate technician onboarding on the checklist above),
but generating *legally binding, jurisdiction-correct* text is outside what
Claude should do unsupervised — a wrong clause here has real legal
consequences for you and your clients. Use these as a first draft only.
