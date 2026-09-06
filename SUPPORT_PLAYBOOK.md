# Minerva — Support Playbook

This is the actual process to run for the `/admin` Support tab, written for
a sole-trader/single-operator support team. It doesn't require any new
tooling beyond what's already built (`support_requests` table, `/admin`
Support tab with urgent/normal triage, "Reply by email" links).

## How a request gets to you

1. A business owner or technician submits "Contact support" from the
   Dispatch or Technician view.
2. `ContactSupportModal.jsx` classifies it `urgent` or `normal` automatically
   based on keywords (down, can't log in, broken, charged twice, cancel,
   refund, emergency, etc. — see `URGENT_KEYWORDS` in that file).
3. It appears in `/admin` → Support tab, urgent-open requests sorted first.
4. There is currently **no push notification** for a new request — you have
   to check `/admin` yourself. Until that's built (see "Not yet built"
   below), check it at least once per business day, and immediately after
   sending any customer-facing SMS/email campaign (which tends to generate
   a burst of replies).

## SLA targets (self-imposed, not shown to customers)

| Priority | Target first response |
|---|---|
| Urgent (billing, cancellation, "it's down", data-loss) | Within 2 hours, business hours |
| Normal (how-do-I, feature request, general question) | Within 1 business day |

These are internal targets to hold yourself to, not a contractual SLA — do
not publish specific hour commitments externally unless you're confident
you can consistently meet them.

## Canned responses (copy/adapt via "Reply by email")

**Billing question / "why was I charged":**
> Hi [name], thanks for reaching out. Minerva bills monthly per technician
> in advance via Stripe — you can see your next billing date and past
> invoices any time from Dispatch → "Manage billing / Cancel". Let me know
> if anything there looks wrong and I'll dig in.

**Cancellation request:**
> Hi [name], sorry to see you go. You can cancel directly and immediately
> from Dispatch → "Manage billing / Cancel" — no need to wait on me. If
> you'd like me to do it for you instead, confirm and I'll cancel it today.
> Mind sharing what didn't work for you? It helps me improve the product.

**"It's not working" / bug report:**
> Hi [name], sorry about that. Can you tell me: (1) what page/screen you were
> on, (2) what you expected to happen vs what happened, and (3) roughly what
> time it happened? That's usually enough for me to find it in the logs.

**Feature request:**
> Thanks for the suggestion — logging this. I can't promise a timeline, but
> I read every request and prioritise based on how many businesses hit the
> same need.

**Technician can't log in / lost their link:**
> Hi [name], no problem — ask your dispatcher to resend your tech link from
> Dispatch → your name in the technician list. If they can't find it either,
> reply here with your name and phone number registered with the business
> and I'll help directly.

## Escalation

There is no second-tier support person — you are the only escalation path
right now. If a request involves a real outage (Supabase/Stripe/Twilio
provider incident, not a Minerva bug), check the relevant provider's status
page before spending time debugging Minerva's own code.

## Not yet built (roadmap, not needed to start operating)

- Real-time alert (email/SMS to yourself) the moment an urgent request comes
  in, instead of having to check `/admin` — worth building once request
  volume makes manual checking unreliable, not before.
- In-app reply (currently "Reply by email" opens your own mail client with
  the customer's email prefilled — there's no reply history stored back
  onto the `support_requests` row, so you'd want to CC/BCC yourself or keep
  your own email thread as the record for now).
