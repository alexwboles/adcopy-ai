// AdCopy AI — template bank, CTA list, and checklist definitions.
// Pure data + zero DOM. Safe to load in a browser or require() in Node.
"use strict";

const CTAS = [
  "Shop Now",
  "Call Today",
  "Book Online",
  "Get a Free Quote",
  "Learn More",
  "Visit Us"
];

const CHECKLIST = [
  { id: "headlines-30",       label: "Headlines ≤ 30 chars" },
  { id: "desc-90",             label: "Descriptions ≤ 90 chars" },
  { id: "has-keyword",         label: "Includes a keyword from your description" },
  { id: "has-cta",             label: "Has a clear CTA" },
  { id: "has-benefit-number",  label: "Mentions a specific benefit or number" },
  { id: "no-caps",             label: "No ALL-CAPS shouting" },
  { id: "no-clickbait",        label: "No clickbait superlatives without proof" },
  { id: "fb-125",              label: "Facebook primary text ≤ 125 chars (ideal)" }
];

// Slot vocabulary: {keyword} {business} {benefit} {cta} {number}
// Templates are intentionally short so filled copy fits Google/Facebook limits.
const BANK = {
  friendly: {
    googleHeadlines: [
      "{keyword} Made Easy",
      "Friendly {keyword} Near You",
      "Your {keyword}, {benefit}",
      "Love Your {keyword} Again",
      "{business}: {keyword} Pros",
      "Hassle-Free {keyword}",
      "Get {keyword} Done Right",
      "Smiling {keyword} Experts"
    ],
    googleDescriptions: [
      "We make {keyword} simple and stress-free. {cta} today and see the difference.",
      "{business} delivers {keyword} {benefit}. Friendly service, honest pricing.",
      "Need {keyword}? Our happy team is ready to help. {cta}!",
      "{keyword} done {benefit} by people who care. {cta} to get started.",
      "Join hundreds of happy customers enjoying better {keyword}. {cta} now."
    ],
    fbPrimary: [
      "Looking for {keyword} you can actually feel good about? At {business}, we keep it simple, friendly, and honest. {cta} — we'd love to help!",
      "Good {keyword} shouldn't be stressful. Our team makes the whole process easy from start to finish. {cta} today!",
      "Your neighbors trust us for {keyword} {benefit}. Come see why everyone's smiling. {cta}!",
      "We believe {keyword} should come with a smile. Friendly folks, fair prices, great results. {cta}!"
    ],
    fbHeadlines: [
      "{keyword} You'll Love",
      "Friendly {keyword} Experts",
      "Say Hello to Better {keyword}",
      "{business} Can Help"
    ],
    fbLinkDesc: [
      "{cta} — it takes a minute",
      "Friendly service, fair prices",
      "Get started today",
      "{benefit}"
    ],
    benefits: ["with a smile", "done right", "made simple", "you can trust"]
  },
  bold: {
    googleHeadlines: [
      "Stop Settling. Get {keyword}",
      "{keyword} That Delivers",
      "Bold {keyword}, Real Results",
      "Serious {keyword} for You",
      "No-Nonsense {keyword}",
      "{keyword}, Done Right",
      "{business} Means {keyword}",
      "Upgrade Your {keyword} Now"
    ],
    googleDescriptions: [
      "Tired of mediocre {keyword}? We do it better, faster, stronger. {cta} now.",
      "{keyword} with zero excuses and real results. {business} gets it done. {cta}.",
      "Don't gamble on {keyword}. Choose the team that delivers every time. {cta}.",
      "Big promises, bigger delivery. That's our {keyword}. {cta} today.",
      "Your {keyword} problem ends here. Take action now — {cta}."
    ],
    fbPrimary: [
      "Enough with {keyword} that underdelivers. We show up, do the work, and stand behind it. {cta} — let's fix this today.",
      "Mediocre {keyword} costs you time and money. Ours doesn't. {business} delivers results you can measure. {cta}.",
      "Here's the truth: most {keyword} is forgettable. Ours isn't. Ready for the upgrade? {cta} now.",
      "Stop scrolling, start solving. {keyword} done decisively by {business}. {cta} today."
    ],
    fbHeadlines: [
      "{keyword} Without Excuses",
      "Results-Driven {keyword}",
      "Demand Better {keyword}",
      "Take Action: {keyword}"
    ],
    fbLinkDesc: [
      "{cta} — no waiting",
      "Real results, fast",
      "Act now",
      "{benefit}"
    ],
    benefits: ["with real results", "with zero hassle", "that delivers", "done decisively"]
  },
  professional: {
    googleHeadlines: [
      "Professional {keyword} Services",
      "Trusted {keyword} Experts",
      "{business} — {keyword}",
      "Quality {keyword}, Guaranteed",
      "Experienced {keyword} Team",
      "Reliable {keyword} Solutions",
      "{keyword} Done Professionally",
      "Your {keyword} Partner"
    ],
    googleDescriptions: [
      "{business} provides dependable {keyword} backed by years of experience. {cta} for a consultation.",
      "Certified experts delivering {keyword} on time and on budget. {cta} today.",
      "For {keyword} you can rely on, choose the professionals. {cta} to discuss your needs.",
      "We combine expertise and care in every {keyword} project. {cta} for details.",
      "Trusted by local businesses for {keyword} {benefit}. {cta} now."
    ],
    fbPrimary: [
      "When {keyword} matters to your business, experience counts. {business} brings proven expertise to every project. {cta} to schedule a consultation.",
      "Professional {keyword}, delivered on time and on budget. Our certified team handles the details so you don't have to. {cta}.",
      "Looking for a dependable {keyword} partner? We combine deep expertise with responsive service. {cta} today.",
      "{business}: the professional choice for {keyword} {benefit}. {cta} to learn more."
    ],
    fbHeadlines: [
      "Expert {keyword} Services",
      "The Professional Choice",
      "Certified {keyword} Team",
      "{business} Delivers"
    ],
    fbLinkDesc: [
      "{cta} for a consultation",
      "On time, on budget",
      "Proven expertise",
      "{benefit}"
    ],
    benefits: ["on time, on budget", "with proven results", "backed by experts", "done right"]
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CTAS, CHECKLIST, BANK };
}
