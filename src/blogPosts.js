// Static blog content — no CMS, no database table, just a plain array.
// Deliberately no fabricated case-study numbers, customer quotes, or
// testimonials in any post: general, honest, verifiable-by-common-sense
// advice about running a field-service business, not "our customers saw
// a 340% increase in..." style claims we have no data to back up.
export const BLOG_POSTS = [
  {
    slug: 'stop-calling-your-technicians-to-ask-where-they-are',
    title: 'Stop calling your technicians to ask where they are',
    date: '2026-08-01',
    excerpt: 'The "where are you now?" phone call is one of the most common and most avoidable interruptions in a dispatcher\'s day.',
    paragraphs: [
      'If you run a plumbing, electrical, HVAC, locksmith, or cleaning & pest control business, you already know the call: a client rings in asking where their technician is, so you call the technician to ask, then call the client back. Multiply that by every job, every day, and it adds up to hours of interruption for something a map should just answer.',
      'The fix isn\'t complicated. A live location shared from the technician\'s own phone — no separate GPS hardware, no fleet-tracking contract — lets the dispatcher see where everyone is in real time, and lets an automatic text handle the client update once the technician is close by. Both sides stop needing to call anyone to find out what a map already knows.',
      'The part that matters most for actually adopting this: it has to work without technicians installing an app, and without clients installing one either. A link that opens straight in a phone\'s browser removes the single biggest reason these tools don\'t get used in practice — nobody wants to make their crew download something new.',
    ],
  },
  {
    slug: 'the-real-cost-of-a-missed-technician-eta',
    title: 'The real cost of a missed technician ETA',
    date: '2026-08-15',
    excerpt: 'A late technician costs more than the job itself — it costs the next five phone calls that job generates.',
    paragraphs: [
      'When a technician runs late and nobody tells the client, the client doesn\'t just get annoyed about that one job. They call your office to ask what\'s going on, which takes a staff member off whatever they were doing. If it happens more than once, they start calling competitors instead of rebooking.',
      'Most of this is a communication gap, not a scheduling gap. Jobs run long for good reasons all the time — the previous job took longer, there was more traffic, the fix was more involved than expected. The problem isn\'t that schedules slip; it\'s that nobody proactively tells the client before they have to ask.',
      'An automatic "your technician is on the way" text sent once the technician is genuinely close (not the moment the job is scheduled, which just trains clients to ignore it) solves this without adding a task to anyone\'s to-do list. It\'s not a booking confirmation email — it\'s a real-time signal tied to where the technician actually is.',
    ],
  },
  {
    slug: 'why-website-chat-widgets-lose-you-jobs',
    title: 'Why website chat widgets lose you jobs (and how to fix it without hiring anyone)',
    date: '2026-08-29',
    excerpt: 'A chat widget that just says "someone will be with you shortly" is often worse than no widget at all.',
    paragraphs: [
      'A visitor lands on your site at 9pm with a burst pipe. If your chat widget collects their message and nobody sees it until 8am, you\'ve lost a same-day emergency job to whichever competitor answered a call instead.',
      'The fix isn\'t staffing a night shift. It\'s triaging automatically — recognizing urgency-signaling language ("emergency," "burst," "no power," "flooding") and immediately texting your on-call team a qualified lead, instead of dropping every enquiry into an inbox that only gets checked in the morning.',
      'The key word is "qualified." A flood of every form submission as an urgent text just trains your team to ignore the texts. Scoring by actual urgency — separating "my tap drips sometimes" from "water is coming through my ceiling" — is what makes automatic intake worth having instead of just another notification to silence.',
    ],
  },
]
