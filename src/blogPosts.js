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
  {
    slug: 'the-fastest-quote-usually-wins-not-the-cheapest-one',
    title: 'The fastest quote usually wins, not the cheapest one',
    date: '2026-09-12',
    excerpt: 'A client who gets your number back in an hour books you even when your price isn\'t the lowest one in their inbox.',
    paragraphs: [
      'Most people asking three trades for a quote aren\'t running a careful bake-off on price. They\'re asking whoever answers first to come and fix the problem. The quote that arrives in an hour reads as "this business has their act together." The quote that arrives two days later reads as a preview of what it\'ll be like waiting for them to actually turn up.',
      'The usual reason a quote takes two days isn\'t that the pricing is hard to work out — it\'s that writing it up got left for "later," and later is whenever there\'s a free half hour between jobs. By the time that half hour shows up, the details from the site visit or the phone call have gone fuzzy, so it takes even longer to get right.',
      'The fix is writing the quote while the job is still fresh — straight after the call or the walkthrough, not batched up for end of day — and sending it as a text with a number in it, not an email that sits in an inbox next to twelve other things. The client isn\'t comparing you on price alone; they\'re comparing you on how it felt to deal with you so far.',
    ],
  },
  {
    slug: 'invoice-the-same-day-and-get-paid-faster',
    title: 'Invoice the same day and you\'ll get paid faster',
    date: '2026-09-26',
    excerpt: 'An invoice that arrives ten minutes after the job reads like a receipt. One that shows up next week reads like a bill.',
    paragraphs: [
      'A lot of trade businesses batch their invoicing — do the jobs all week, sit down Friday or on the weekend, and send everything out at once. It feels efficient, since it\'s one block of admin instead of ten small interruptions. But it means every client\'s invoice shows up days after the work is finished, disconnected from the job itself.',
      'That gap changes how the invoice reads. One sent while the technician is still packing up the van is basically a receipt — a confirmation of something the client just watched happen and is happy about. One that shows up five days later, competing with a stack of other bills, reads as a cold ask, and it\'s the first time anyone has to think back and recall exactly what was done to agree the total is fair.',
      'Invoicing from the job itself — while the client can still see the finished work and the price in front of them at the same time — settles the total before any doubt has a chance to set in, and it means there\'s no later disagreement about what the job even was, since both sides looked at the same number on the same day.',
    ],
  },
]
