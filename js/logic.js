// AdCopy AI — pure generation + validation logic. No DOM, no network.
// In the browser, js/copybank.js is loaded first via <script> order.
// In Node, the bank is pulled in with require() below so the module is
// standalone require()-able.
"use strict";

var __AD = null;
try {
  /* global BANK, CTAS, CHECKLIST */
  __AD = (typeof BANK !== "undefined")
    ? { BANK: BANK, CTAS: CTAS, CHECKLIST: CHECKLIST }
    : require("./copybank.js");
} catch (e) {
  __AD = require("./copybank.js");
}

const STOPWORDS = [
  "a", "an", "the", "and", "or", "but", "of", "for", "to", "in", "on", "at",
  "with", "from", "by", "we", "our", "us", "you", "your", "i", "it", "is",
  "are", "was", "were", "be", "been", "do", "does", "did", "have", "has",
  "had", "will", "would", "can", "could", "should", "that", "this", "these",
  "those", "as", "so", "such", "my", "me", "they", "them", "their", "he",
  "she", "his", "her", "its", "not", "no", "all", "any", "each", "every",
  "more", "most", "very", "just", "also", "than", "then", "there", "here",
  "into", "over", "under", "about", "between", "through", "during", "up",
  "out", "off", "who", "what", "when", "where", "which", "how", "why",
  "if", "because", "while", "both", "own", "same", "too", "s"
];

const CLICKBAIT_WORDS = [
  "best", "amazing", "incredible", "unbelievable", "shocking",
  "secret", "miracle", "jaw-dropping", "mind-blowing"
];

const BENEFIT_WORDS = [
  "free", "fast", "guaranteed", "certified", "trusted", "save", "discount",
  "warranty", "same-day", "expert", "proven", "reliable", "honest", "simple"
];

function countChars(s) {
  return (s || "").length;
}

function tokenize(text) {
  return ((text || "").toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
}

// Top content words in the text, most frequent first. Never throws on empty input.
function extractKeywords(text) {
  const stop = new Set(STOPWORDS);
  const freq = new Map();
  const firstSeen = new Map();
  tokenize(text).forEach((w, i) => {
    if (w.length < 3 || stop.has(w) || /^\d+$/.test(w)) return;
    freq.set(w, (freq.get(w) || 0) + 1);
    if (!firstSeen.has(w)) firstSeen.set(w, i);
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || firstSeen.get(a[0]) - firstSeen.get(b[0]))
    .slice(0, 8)
    .map(e => e[0]);
}

function extractNumber(text) {
  const m = (text || "").match(/\d[\d,]*/);
  return m ? m[0] : null;
}

function titleCase(s) {
  return (s || "").replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
}

function fillTemplate(tpl, slots) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (slots[k] == null ? "" : String(slots[k])));
}

function escapeCsvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Export the current ads as a CSV (Google Ads Editor-friendly columns plus the
// Facebook block). Pure function — the caller handles the download.
function adsToCSV(googleAd, fbAd, business) {
  const g = googleAd || { headlines: [], descriptions: [] };
  const f = fbAd || { primary: "", headline: "", linkDesc: "" };
  const rows = [
    ["business", "tone", "field", "text", "chars", "limit"]
  ];
  const biz = business || "";
  const push = (field, text, limit) => rows.push([biz, g.tone || "", field, text || "", String((text || "").length), String(limit || "")]);
  (g.headlines || []).forEach((h, i) => push("headline_" + (i + 1), h, 30));
  (g.descriptions || []).forEach((d, i) => push("description_" + (i + 1), d, 90));
  push("fb_primary", f.primary, 125);
  push("fb_headline", f.headline, 40);
  push("fb_link_desc", f.linkDesc, 30);
  return rows.map(r => r.map(escapeCsvCell).join(",")).join("\n");
}

// Quality score 0–100 from the checklist pass rate. Pure.
function qualityScore(items) {
  const list = items || [];
  if (!list.length) return 0;
  return Math.round((list.filter(i => i.pass).length / list.length) * 100);
}

function slotsAvailable(tpl, slots) {
  const needed = tpl.match(/\{(\w+)\}/g) || [];
  return needed.every(s => {
    const v = slots[s.slice(1, -1)];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
}

// Shrink text to fit a character limit, preferring clean word boundaries.
function fitTo(text, limit) {
  let t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= limit) return t;
  for (const sep of [" — ", " – ", " - ", "; ", ", ", ": "]) {
    const i = t.lastIndexOf(sep);
    if (i > 0) {
      const cut = t.slice(0, i).trim();
      if (cut.length <= limit && cut.length >= Math.min(12, limit)) { t = cut; break; }
    }
  }
  if (t.length > limit) {
    const words = t.split(" ");
    let out = "";
    for (const w of words) {
      const next = out ? out + " " + w : w;
      if (next.length > limit) break;
      out = next;
    }
    t = out || t.slice(0, limit);
  }
  return t.trim();
}

// Pick `count` distinct filled templates that honor every slot and the char limit.
// Rotation offset makes regeneration produce different variants.
function pickFitting(templates, makeSlots, limit, count, offset) {
  const n = templates.length;
  const picked = [];
  const seen = new Set();
  for (let r = 0; r < n && picked.length < count; r++) {
    const tpl = templates[(offset + r) % n];
    const slots = makeSlots(picked.length);
    if (!slotsAvailable(tpl, slots)) continue;
    const filled = fitTo(fillTemplate(tpl, slots), limit);
    const key = filled.toLowerCase();
    if (!filled || seen.has(key)) continue;
    seen.add(key);
    picked.push(filled);
  }
  return picked;
}

function buildSlots(input, toneKey, number) {
  const bank = __AD.BANK[toneKey] || __AD.BANK.friendly;
  const text = [input.description, input.keywords].filter(Boolean).join(" ");
  const kws = extractKeywords(text);
  const pinned = (input.pinnedKeyword || "").trim();
  const keyword = pinned || (kws.length ? titleCase(kws[0]) : "Services");
  return {
    keywords: kws,
    keyword,
    number: number,
    business: (input.business || "").trim(),
    cta: input.cta || __AD.CTAS[0],
    makeSlots: (i, seed) => ({
      keyword,
      business: (input.business || "").trim(),
      benefit: bank.benefits[(seed + i) % bank.benefits.length],
      cta: input.cta || __AD.CTAS[0],
      number: number
    })
  };
}

function ensureCta(texts, cta, limit) {
  const lower = (cta || "").toLowerCase();
  const has = texts.some(t => t.toLowerCase().includes(lower));
  if (has || !cta) return texts;
  const out = texts.slice();
  out[out.length - 1] = fitTo(out[out.length - 1] + " " + cta, limit);
  return out;
}

function generateGoogleAd(input, tone) {
  const toneKey = __AD.BANK[tone] ? tone : "friendly";
  const bank = __AD.BANK[toneKey];
  const seed = (input && input._seed) || 0;
  const number = extractNumber(input.description || "") || extractNumber(input.keywords || "");
  const ctx = buildSlots(input, toneKey, number);

  let headlines = pickFitting(bank.googleHeadlines, i => ctx.makeSlots(i, seed), 30, 3, seed);
  let descriptions = pickFitting(bank.googleDescriptions, i => ctx.makeSlots(i, seed + 3), 90, 2, seed + 5);
  headlines = ensureCta(headlines, ctx.makeSlots(0, seed).cta, 30);
  descriptions = ensureCta(descriptions, ctx.makeSlots(0, seed).cta, 90);

  return {
    tone: toneKey,
    headlines,
    descriptions,
    cta: ctx.makeSlots(0, seed).cta,
    keyword: ctx.keyword
  };
}

function generateFacebookAd(input, tone) {
  const toneKey = __AD.BANK[tone] ? tone : "friendly";
  const bank = __AD.BANK[toneKey];
  const seed = (input && input._seed) || 0;
  const number = extractNumber(input.description || "") || extractNumber(input.keywords || "");
  const ctx = buildSlots(input, toneKey, number);

  let primary = pickFitting(bank.fbPrimary, i => ctx.makeSlots(i, seed + 2), 125, 1, seed)[0] || "";
  let headline = pickFitting(bank.fbHeadlines, i => ctx.makeSlots(i, seed), 40, 1, seed + 1)[0] || "";
  let linkDesc = pickFitting(bank.fbLinkDesc, i => ctx.makeSlots(i, seed), 30, 1, seed + 2)[0] || "";
  const cta = ctx.makeSlots(0, seed).cta;
  primary = ensureCta([primary], cta, 125)[0];

  return { tone: toneKey, primary, headline, linkDesc, cta, keyword: ctx.keyword };
}

// Validate generated copy against every checklist item.
// Always returns one entry per CHECKLIST item, each with a boolean `pass`.
function validateCopy(googleAd, fbAd, input) {
  const g = googleAd || { headlines: [], descriptions: [] };
  const f = fbAd || { primary: "", headline: "", linkDesc: "" };
  const text = [input.description, input.keywords].filter(Boolean).join(" ");
  const kws = extractKeywords(text).slice(0, 3);
  const copy = [...(g.headlines || []), ...(g.descriptions || []), f.primary, f.headline, f.linkDesc]
    .filter(Boolean).join(" \n ");
  const lower = copy.toLowerCase();
  const cta = ((input && input.cta) || (g && g.cta) || "").toLowerCase();

  const results = {
    "headlines-30": {
      pass: (g.headlines || []).length > 0 && (g.headlines || []).every(h => countChars(h) <= 30),
      detail: (g.headlines || []).map(h => countChars(h) + "/30").join(", ")
    },
    "desc-90": {
      pass: (g.descriptions || []).length > 0 && (g.descriptions || []).every(d => countChars(d) <= 90),
      detail: (g.descriptions || []).map(d => countChars(d) + "/90").join(", ")
    },
    "has-keyword": {
      pass: kws.length === 0 ? true : kws.some(k => lower.includes(k)),
      detail: kws.length ? "keywords: " + kws.join(", ") : "no keywords in description"
    },
    "has-cta": {
      pass: !!cta && lower.includes(cta),
      detail: cta ? ("looking for \u201c" + cta + "\u201d") : "no CTA selected"
    },
    "has-benefit-number": {
      pass: /\d/.test(copy) || BENEFIT_WORDS.some(w => lower.includes(w)),
      detail: /\d/.test(copy) ? "contains a number" : "checked for benefit words"
    },
    "no-caps": {
      pass: !/\b[A-Z]{3,}\b/.test(copy),
      detail: /\b[A-Z]{3,}\b/.test(copy) ? "found ALL-CAPS word" : "no shouting detected"
    },
    "no-clickbait": {
      pass: !(CLICKBAIT_WORDS.some(w => lower.includes(w)) && !/\d/.test(copy)),
      detail: "superlatives need proof (a number)"
    },
    "fb-125": {
      pass: countChars(f.primary || "") <= 125,
      detail: countChars(f.primary || "") + "/125 chars"
    }
  };

  return __AD.CHECKLIST.map(item => ({
    id: item.id,
    label: item.label,
    pass: !!results[item.id].pass,
    detail: results[item.id].detail
  }));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractKeywords, generateGoogleAd, generateFacebookAd, validateCopy, adsToCSV, qualityScore };
}
