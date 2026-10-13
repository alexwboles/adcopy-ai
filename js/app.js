// AdCopy AI — DOM glue. Renders UI, wires live counters/checklist,
// clipboard, saved campaigns, and the optional OpenAI polish.
"use strict";

/* global CTAS, CHECKLIST, generateGoogleAd, generateFacebookAd, validateCopy,
   fitTo, campaignsToJSON, campaignsFromJSON, generateRSAAssets, adsToCSV, adsToCSVAll,
   qualityScore, extractKeywords */

const STORE_KEY = "adcopy.v1";
const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "bold", label: "Bold" },
  { id: "professional", label: "Professional" }
];

const state = {
  tone: "friendly",
  cta: CTAS[0],
  seed: 0,
  generated: false,
  saved: [],
  openaiKey: "",
  pinnedKeyword: "",
  bannedWords: [],
  rsa: null,
  history: [],
  histIdx: -1,
  savedQuery: ""
};

function $(id) { return document.getElementById(id); }

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.saved)) state.saved = s.saved;
    if (typeof s.openaiKey === "string") state.openaiKey = s.openaiKey;
    if (Array.isArray(s.bannedWords)) state.bannedWords = s.bannedWords.filter(w => typeof w === "string");
  } catch (e) { /* corrupted store: start fresh */ }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      saved: state.saved,
      openaiKey: state.openaiKey,
      bannedWords: state.bannedWords
    }));
  } catch (e) { /* storage full/blocked: non-fatal */ }
}

function readInput() {
  return {
    business: $("business").value.trim(),
    description: $("description").value.trim(),
    website: $("website").value.trim(),
    keywords: $("keywords").value.trim(),
    cta: state.cta,
    pinnedKeyword: state.pinnedKeyword,
    bannedWords: state.bannedWords.slice(),
    _seed: state.seed
  };
}

// ---------- editable fields with live counters ----------

function makeEditable(value, limit, multiline) {
  const line = document.createElement("div");
  line.className = "copyline";

  const grow = document.createElement("div");
  grow.className = "grow";
  const field = multiline ? document.createElement("textarea") : document.createElement("input");
  if (!multiline) field.type = "text";
  field.value = value || "";
  field.dataset.limit = String(limit);
  if (multiline) field.rows = 2;
  grow.appendChild(field);

  const counter = document.createElement("span");
  counter.className = "counter";

  function update() {
    const n = field.value.length;
    counter.textContent = n + "/" + limit;
    counter.classList.toggle("over", n > limit);
  }
  field.addEventListener("input", () => { update(); refreshChecklist(); });
  update();

  line.appendChild(grow);
  line.appendChild(counter);
  return line;
}

function currentGoogleAd() {
  const val = sel => [...document.querySelectorAll(sel)].map(el => el.value);
  const paths = [...document.querySelectorAll("#g-paths input")];
  return {
    tone: state.tone,
    headlines: val("#g-headlines input"),
    descriptions: val("#g-descriptions textarea"),
    path1: paths[0] ? paths[0].value : "",
    path2: paths[1] ? paths[1].value : "",
    cta: state.cta
  };
}

function currentFbAd() {
  const p = document.querySelector("#f-primary textarea");
  const rest = [...document.querySelectorAll("#f-rest input")];
  return {
    tone: state.tone,
    primary: p ? p.value : "",
    headline: rest[0] ? rest[0].value : "",
    linkDesc: rest[1] ? rest[1].value : "",
    cta: state.cta
  };
}

// ---------- rendering ----------

function renderToneBar() {
  const bar = $("tone-bar");
  bar.innerHTML = "";
  TONES.forEach(t => {
    const b = document.createElement("button");
    b.className = "btn ghost" + (state.tone === t.id ? " active" : "");
    b.textContent = t.label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", state.tone === t.id ? "true" : "false");
    b.addEventListener("click", () => {
      state.tone = t.id;
      renderToneBar();
      if (state.generated) generate(false);
    });
    bar.appendChild(b);
  });
}

function renderCtaPicker() {
  const grid = $("cta-picker");
  grid.innerHTML = "";
  CTAS.forEach(c => {
    const b = document.createElement("button");
    b.className = "btn ghost small" + (state.cta === c ? " active" : "");
    b.textContent = c;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", state.cta === c ? "true" : "false");
    b.addEventListener("click", () => {
      state.cta = c;
      renderCtaPicker();
      if (state.generated) generate(false);
    });
    grid.appendChild(b);
  });
}

function renderAdFields(g, f, rsa) {
  const gh = $("g-headlines"), gd = $("g-descriptions");
  const fp = $("f-primary"), fr = $("f-rest");
  gh.innerHTML = ""; gd.innerHTML = ""; fp.innerHTML = ""; fr.innerHTML = "";

  g.headlines.forEach(h => gh.appendChild(makeEditable(h, 30, false)));
  g.descriptions.forEach(d => gd.appendChild(makeEditable(d, 90, true)));
  fp.appendChild(makeEditable(f.primary, 125, true));
  fr.appendChild(makeEditable(f.headline, 40, false));
  fr.appendChild(makeEditable(f.linkDesc, 30, false));

  // Display paths under the SERP URL — 15 chars each, live-synced to the URL line.
  const gp = $("g-paths");
  if (gp) {
    gp.innerHTML = "";
    const p1 = makeEditable(g.path1 || "", 15, false);
    const p2 = makeEditable(g.path2 || "", 15, false);
    const slash = document.createElement("span");
    slash.className = "path-slash";
    slash.textContent = "/";
    gp.appendChild(p1);
    gp.appendChild(slash);
    gp.appendChild(p2);
    gp.querySelectorAll("input").forEach(inp => {
      inp.placeholder = "path";
      inp.addEventListener("input", () => { syncChrome(); refreshChecklist(); });
    });
  }

  renderRsa(rsa);

  ["google-card", "fb-card", "check-card", "strength-card"].forEach(id => { $(id).hidden = false; });
  const ae = $("assets-empty");
  if (ae) ae.hidden = true;
  renderPreviewPane();
  const rsaCard = $("rsa-card");
  if (rsaCard) rsaCard.hidden = !(rsa && (rsa.headlines.length || rsa.descriptions.length));
  ["regenerate", "save-campaign", "export-csv", "export-ab", "fit-limits"].forEach(id => {
    const b = $(id);
    if (b) b.disabled = false;
  });
  $("polish").disabled = false;
  state.generated = true;
}

// ---------- live preview pane (Meta Ads Manager pattern): read-only mirrors ----------

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function displayUrl() {
  const business = $("business").value.trim();
  const website = $("website").value.trim();
  const host = (website.replace(/^https?:\/\//, "").split("/")[0] || "").toLowerCase();
  const base = host || (business ? business.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com" : "yourbusiness.com");
  const paths = [...document.querySelectorAll("#g-paths input")].map(i => i.value.trim()).filter(Boolean);
  return base + (paths.length ? "/" + paths.join("/") : "");
}

function renderPreviewPane() {
  const body = $("pv-body"), empty = $("pv-empty");
  if (!state.generated) {
    if (body) body.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (body) body.hidden = false;
  if (empty) empty.hidden = true;

  const g = currentGoogleAd(), f = currentFbAd();
  setText("pv-g-url", displayUrl());

  const ph = $("pv-g-headlines");
  if (ph) {
    ph.innerHTML = "";
    g.headlines.forEach((h, i) => {
      if (i > 0) {
        const s = document.createElement("span");
        s.className = "hsep";
        s.textContent = "|";
        ph.appendChild(s);
      }
      const a = document.createElement("span");
      a.textContent = h;
      ph.appendChild(a);
    });
  }
  setText("pv-g-descriptions", g.descriptions.join(" "));

  const business = $("business").value.trim();
  setText("pv-f-page", business || "Your business");
  setText("pv-f-avatar", (business || "B").trim().charAt(0).toUpperCase());
  setText("pv-f-domain", ($("website").value.trim().replace(/^https?:\/\//, "").split("/")[0] || "").toLowerCase() || "yourbusiness.com");
  setText("pv-f-primary", f.primary);
  setText("pv-f-headline", f.headline);
  setText("pv-f-linkdesc", f.linkDesc);
  setText("pv-f-cta", state.cta || "Learn more");
}

// ---------- ad strength ring + improvement ideas (Google Ads pattern) ----------

const STRENGTH_IDEAS = {
  "headlines-30":      { text: "Some headlines run over 30 characters — hit Fit to limits to trim them.", anchor: "google-card" },
  "desc-90":           { text: "Some descriptions run over 90 characters — hit Fit to limits to trim them.", anchor: "google-card" },
  "has-keyword":       { text: "Add a keyword from your description into a headline — Google rewards relevance.", anchor: "brief-card" },
  "has-cta":           { text: "Give the ad a stronger call to action.", anchor: "brief-card" },
  "has-benefit-number": { text: "Mention a specific number or benefit (e.g. “from $45”, “same-day”).", anchor: "brief-card" },
  "no-caps":           { text: "Remove ALL-CAPS shouting — it reads as spam.", anchor: "check-card" },
  "no-clickbait":      { text: "Drop unproven superlatives (“best ever”) or back them with proof.", anchor: "check-card" },
  "fb-125":            { text: "Trim the Facebook primary text to 125 characters or less for feed.", anchor: "fb-card" },
  "paths-15":          { text: "Shorten the display paths to 15 characters each.", anchor: "google-card" },
  "no-banned":         { text: "A banned word slipped into the copy — edit or regenerate.", anchor: "brief-card" }
};

function renderStrength(items) {
  const num = $("strength-num"), arc = $("strength-arc"), label = $("strength-label"), list = $("strength-ideas");
  if (!num || !arc || !label || !list) return;
  const score = qualityScore(items);
  num.textContent = score;
  const C = 2 * Math.PI * 42;
  arc.style.strokeDasharray = String(C);
  arc.style.strokeDashoffset = String(C * (1 - score / 100));
  arc.classList.remove("good", "warn", "bad");
  arc.classList.add(score >= 80 ? "good" : score >= 50 ? "warn" : "bad");
  label.textContent = score >= 80 ? "Excellent — ready to ship."
    : score >= 50 ? "Good — a few improvements available."
    : score >= 25 ? "Average — fix the flagged items." : "Needs work — address the suggestions below.";

  list.innerHTML = "";
  const failing = items.filter(i => !i.pass).slice(0, 4);
  if (!failing.length) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="idea-dot">●</span> All checks passing — nothing to fix.';
    list.appendChild(li);
    return;
  }
  failing.forEach(it => {
    const idea = STRENGTH_IDEAS[it.id] || { text: it.label, anchor: "check-card" };
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "idea-dot";
    dot.textContent = "●";
    const t = document.createElement("span");
    t.textContent = idea.text + " ";
    const a = document.createElement("a");
    a.href = "#" + idea.anchor;
    a.textContent = "View";
    li.appendChild(dot); li.appendChild(t); li.appendChild(a);
    list.appendChild(li);
  });
}

// ---------- full RSA asset set ----------

function rsaLine(text, limit) {
  const li = document.createElement("li");
  const t = document.createElement("span");
  t.className = "rsa-text";
  t.textContent = text;
  const c = document.createElement("span");
  c.className = "counter" + (text.length > limit ? " over" : "");
  c.textContent = text.length + "/" + limit;
  li.appendChild(t);
  li.appendChild(c);
  return li;
}

function renderRsa(rsa) {
  state.rsa = rsa || null;
  const hl = $("rsa-headlines"), ds = $("rsa-descs");
  if (!hl || !ds) return;
  hl.innerHTML = ""; ds.innerHTML = "";
  if (!rsa) return;
  (rsa.headlines || []).forEach(h => hl.appendChild(rsaLine(h, 30)));
  (rsa.descriptions || []).forEach(d => ds.appendChild(rsaLine(d, 90)));
  const cnt = $("rsa-count");
  if (cnt) cnt.textContent =
    (rsa.headlines || []).length + " / 15 headlines · " +
    (rsa.descriptions || []).length + " / 4 descriptions";
}

function copyRsa() {
  const rsa = state.rsa;
  if (!rsa) return;
  const text = "GOOGLE RSA ASSET SET (" + state.tone + ")\nHeadlines:\n- " +
    (rsa.headlines || []).join("\n- ") +
    "\nDescriptions:\n- " + (rsa.descriptions || []).join("\n- ");
  copyText(text, $("copy-rsa"));
}

function generate(bumpSeed) {
  if (bumpSeed) state.seed += 1;
  const input = readInput();
  const g = generateGoogleAd(input, state.tone);
  const f = generateFacebookAd(input, state.tone);
  const rsa = generateRSAAssets(input, state.tone);
  renderAdFields(g, f, rsa);
  refreshChecklist();
  syncChrome();
  pushHistory();
}

// ---------- regeneration history: keep the last 8 variants ----------

function pushHistory() {
  if (!state.generated) return;
  state.history.push({
    google: currentGoogleAd(),
    fb: currentFbAd(),
    rsa: state.rsa,
    tone: state.tone,
    cta: state.cta,
    label: "Variant " + (state.seed + 1) + " · " + state.tone
  });
  if (state.history.length > 8) state.history.shift();
  state.histIdx = state.history.length - 1;
  syncHistNav();
}

function showHistory(idx) {
  const h = state.history[idx];
  if (!h) return;
  state.histIdx = idx;
  state.tone = h.tone;
  state.cta = h.cta;
  renderToneBar(); renderCtaPicker();
  renderAdFields(h.google, h.fb, h.rsa);
  refreshChecklist();
  syncChrome();
  syncHistNav();
}

function syncHistNav() {
  const p = $("hist-prev"), n = $("hist-next");
  if (!p || !n) return;
  const has = state.history.length > 1;
  p.disabled = !has || state.histIdx <= 0;
  n.disabled = !has || state.histIdx >= state.history.length - 1;
  const lbl = $("hist-label");
  if (lbl) lbl.textContent = state.history.length
    ? ("variant " + (state.histIdx + 1) + " of " + state.history.length)
    : "";
}

// ---------- detected keyword chips: pin the primary keyword ----------

function renderKeywordChips() {
  const box = $("kw-chips");
  if (!box) return;
  box.innerHTML = "";
  const text = [$("description").value, $("keywords").value].filter(Boolean).join(" ");
  const kws = (typeof extractKeywords === "function" ? extractKeywords(text) : []).slice(0, 6);
  if (!kws.length) {
    const p = document.createElement("p");
    p.className = "empty mini";
    p.textContent = "Type a description and keywords will appear here — tap one to force it as the headline keyword.";
    box.appendChild(p);
    return;
  }
  const head = document.createElement("p");
  head.className = "microcopy";
  head.textContent = "Detected keywords — tap to pin one as the headline keyword:";
  box.appendChild(head);
  kws.forEach(k => {
    const b = document.createElement("button");
    b.type = "button";
    const pinned = state.pinnedKeyword === k;
    b.className = "chipbtn" + (pinned ? " active" : "");
    b.textContent = (pinned ? "● " : "") + k;
    b.title = pinned ? "Pinned — click to unpin" : "Pin as the headline keyword";
    b.addEventListener("click", () => {
      state.pinnedKeyword = pinned ? "" : k;
      renderKeywordChips();
      if (state.generated) generate(false);
    });
    box.appendChild(b);
  });
}

// ---------- banned words: brand-safety list kept out of generated + edited copy ----------

function renderBannedChips() {
  const box = $("ban-words");
  if (!box) return;
  box.innerHTML = "";
  if (!state.bannedWords.length) {
    const p = document.createElement("p");
    p.className = "empty mini";
    p.textContent = "None yet — the generator skips any template containing a banned word.";
    box.appendChild(p);
    return;
  }
  state.bannedWords.forEach(w => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chipbtn ban";
    b.title = "Remove from banned list";
    b.textContent = w + " ✕";
    b.addEventListener("click", () => {
      state.bannedWords = state.bannedWords.filter(x => x !== w);
      persist();
      renderBannedChips();
      if (state.generated) generate(false);
    });
    box.appendChild(b);
  });
}

function addBannedWord() {
  const inp = $("ban-input");
  const w = (inp.value || "").trim().toLowerCase();
  inp.value = "";
  if (!w || state.bannedWords.includes(w)) return;
  state.bannedWords.push(w);
  persist();
  renderBannedChips();
  if (state.generated) generate(false);
}

// ---------- fit-to-limits: auto-trim every over-limit editable line ----------

function fitToLimits() {
  let fixed = 0;
  document.querySelectorAll(".copyline input, .copyline textarea").forEach(field => {
    const limit = parseInt(field.dataset.limit || "0", 10);
    if (limit > 0 && field.value.length > limit) {
      field.value = fitTo(field.value, limit);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      fixed++;
    }
  });
  const btn = $("fit-limits");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = fixed ? ("Fixed " + fixed + " line" + (fixed > 1 ? "s" : "") + " ✓") : "All within limits ✓";
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }
}

// ---------- saved-campaign JSON export / import ----------

function exportJSON() {
  const json = campaignsToJSON(state.saved);
  downloadFile("adcopy-campaigns.json", json, "application/json;charset=utf-8");
  const btn = $("export-json");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = "Exported ✓";
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { campaigns, dropped } = campaignsFromJSON(reader.result);
      const known = new Set(state.saved.map(c => c.id));
      let added = 0;
      campaigns.forEach(c => {
        if (known.has(c.id)) return; // skip exact duplicates
        state.saved.push(c);
        added++;
      });
      persist(); renderSaved();
      savedNotice(added + " campaign" + (added === 1 ? "" : "s") + " imported" +
        (dropped ? " · " + dropped + " row" + (dropped === 1 ? "" : "s") + " skipped" : "") + ".");
    } catch (e) {
      savedNotice("That file isn't an AdCopy AI campaign export.", "warn");
    }
  };
  reader.readAsText(file);
}

function savedNotice(msg, kind) {
  const n = $("saved-notice");
  if (!n) return;
  n.textContent = msg;
  n.className = "notice show " + (kind || "info");
  setTimeout(() => { n.className = "notice"; }, 5000);
}

// ---------- CSV export ----------

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportCSV() {
  const csv = adsToCSV(currentGoogleAd(), currentFbAd(), $("business").value.trim());
  downloadFile("adcopy-ads.csv", csv, "text/csv;charset=utf-8");
  const btn = $("export-csv");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = "Exported ✓";
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }
}

// A/B test export: regenerate the same brief in every tone and export all
// three as one CSV, so variants can be bulk-uploaded side by side.
function exportAB() {
  const input = readInput();
  const campaigns = TONES.map(t => ({
    tone: t.id,
    google: generateGoogleAd(input, t.id),
    fb: generateFacebookAd(input, t.id)
  }));
  // Keep the paths the user typed in the preview on every variant row.
  const g = currentGoogleAd();
  campaigns.forEach(c => { c.google.path1 = g.path1; c.google.path2 = g.path2; });
  const csv = adsToCSVAll(campaigns, $("business").value.trim());
  downloadFile("adcopy-ab-test.csv", csv, "text/csv;charset=utf-8");
  const btn = $("export-ab");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = "Exported ✓";
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }
}

function refreshChecklist() {
  if (!state.generated) return;
  const input = readInput();
  const items = validateCopy(currentGoogleAd(), currentFbAd(), input);
  const ul = $("checklist");
  ul.innerHTML = "";
  const known = new Set(items.map(i => i.id));
  CHECKLIST.forEach(def => { if (!known.has(def.id)) items.push({ id: def.id, label: def.label, pass: false, detail: "not evaluated" }); });
  items.forEach(it => {    const li = document.createElement("li");
    li.className = it.pass ? "pass" : "";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = it.pass ? "✓" : "✕";
    const label = document.createElement("span");
    label.textContent = it.label;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = it.detail || "";
    li.appendChild(mark); li.appendChild(label); li.appendChild(detail);
    ul.appendChild(li);
  });
  const passed = items.filter(i => i.pass).length;
  const qc = $("qa-count");
  if (qc) qc.textContent = passed + " / " + items.length + " passing";
  const qs = $("qa-score");
  if (qs) {
    const score = qualityScore(items);
    qs.textContent = "Quality " + score + "%";
    qs.classList.remove("good", "warn", "bad");
    qs.classList.add(score >= 80 ? "good" : score >= 50 ? "warn" : "bad");
  }
  renderStrength(items);
  renderPreviewPane();
}

// ---------- mockup chrome: keep the fake platform UI in sync with the brief ----------

function syncChrome() {
  const business = $("business").value.trim();
  const website = $("website").value.trim();
  const host = (website.replace(/^https?:\/\//, "").split("/")[0] || "").toLowerCase();
  const base = host || (business ? business.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com" : "yourbusiness.com");
  const paths = [...document.querySelectorAll("#g-paths input")].map(i => i.value.trim()).filter(Boolean);
  const urlText = base + (paths.length ? "/" + paths.join("/") : "");
  // Asset-card chrome (kept for the fb-card creative note) + preview-pane mirrors.
  setText("g-url", urlText);
  setText("pv-g-url", urlText);
  const pageText = business || "Your business";
  setText("fb-page", pageText);
  setText("pv-f-page", pageText);
  setText("fb-avatar", (business || "B").trim().charAt(0).toUpperCase());
  setText("pv-f-avatar", (business || "B").trim().charAt(0).toUpperCase());
  setText("fb-domain", host || "yourbusiness.com");
  setText("pv-f-domain", host || "yourbusiness.com");
  setText("fb-cta-btn", state.cta || "Learn more");
  setText("pv-f-cta", state.cta || "Learn more");
  const creative = $("fb-creative-line");
  if (creative) creative.textContent = business ? ("Sponsored · " + business) : "Your creative goes here";
}

// ---------- clipboard ----------

async function copyText(text, btn) {
  const done = ok => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => { btn.textContent = orig; }, 1400);
  };
  try {
    await navigator.clipboard.writeText(text);
    done(true);
  } catch (e) {
    // Fallback for non-secure contexts (file://)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { done(document.execCommand("copy")); }
    catch (err) { done(false); }
    document.body.removeChild(ta);
  }
}

function wireCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const g = currentGoogleAd(), f = currentFbAd();
      const text = btn.dataset.copy === "google"
        ? "GOOGLE SEARCH AD\nHeadlines:\n- " + g.headlines.join("\n- ") +
          "\nDescriptions:\n- " + g.descriptions.join("\n- ") +
          ((g.path1 || g.path2) ? "\nDisplay path: /" + (g.path1 || "") + "/" + (g.path2 || "") : "")
        : "FACEBOOK AD\n" + f.primary + "\nHeadline: " + f.headline + "\nLink: " + f.linkDesc;
      copyText(text, btn);
    });
  });
}

// ---------- saved campaigns ----------

function renderSaved() {
  const list = $("saved-list");
  list.innerHTML = "";
  const q = (state.savedQuery || "").toLowerCase().trim();
  const visible = state.saved.filter(c =>
    !q || (c.name || "").toLowerCase().includes(q) ||
    (c.input.business || "").toLowerCase().includes(q)
  );
  if (!state.saved.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No saved campaigns yet — generate some ads and save them here.";
    list.appendChild(p);
    return;
  }
  if (!visible.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No campaigns match your search.";
    list.appendChild(p);
    return;
  }
  visible.forEach(c => {
    const row = document.createElement("div");
    row.className = "saved-item";
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = c.name;
    const sub = document.createElement("span");
    const d = new Date(c.date);
    sub.textContent = (c.input.business || "Untitled business") + " · " + c.tone +
      " · " + (isNaN(d) ? "" : d.toLocaleDateString());
    meta.appendChild(name); meta.appendChild(sub);

    const load = document.createElement("button");
    load.className = "btn ghost small";
    load.textContent = "Load";
    load.addEventListener("click", () => loadCampaign(c));

    const dup = document.createElement("button");
    dup.className = "btn ghost small";
    dup.textContent = "Duplicate";
    dup.title = "Copy this campaign";
    dup.addEventListener("click", () => {
      state.saved.unshift(Object.assign({}, c, {
        id: "c" + Date.now().toString(36),
        name: (c.name || "Campaign") + " (copy)",
        date: new Date().toISOString()
      }));
      persist(); renderSaved();
    });

    const del = document.createElement("button");
    del.className = "btn ghost small";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      state.saved = state.saved.filter(x => x.id !== c.id);
      persist(); renderSaved();
    });

    row.appendChild(meta); row.appendChild(load); row.appendChild(dup); row.appendChild(del);
    list.appendChild(row);
  });
}

function saveCampaign() {
  const name = $("campaign-name").value.trim() || ("Campaign " + (state.saved.length + 1));
  state.saved.unshift({
    id: "c" + Date.now().toString(36),
    name,
    date: new Date().toISOString(),
    tone: state.tone,
    input: readInput(),
    google: currentGoogleAd(),
    fb: currentFbAd(),
    rsa: state.rsa
  });
  $("campaign-name").value = "";
  persist(); renderSaved();
}

function loadCampaign(c) {
  $("business").value = c.input.business || "";
  $("description").value = c.input.description || "";
  $("website").value = c.input.website || "";
  $("keywords").value = c.input.keywords || "";
  state.tone = c.tone || "friendly";
  state.cta = c.input.cta || CTAS[0];
  state.pinnedKeyword = c.input.pinnedKeyword || "";
  if (Array.isArray(c.input.bannedWords)) state.bannedWords = c.input.bannedWords.filter(w => typeof w === "string");
  renderToneBar(); renderCtaPicker(); renderKeywordChips(); renderBannedChips();
  renderAdFields(c.google, c.fb, c.rsa);
  refreshChecklist();
  syncChrome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- optional AI polish (graceful fallback) ----------

function aiNotice(msg, kind) {
  const n = $("ai-notice");
  n.textContent = msg;
  n.className = "notice show " + (kind || "info");
}

async function polishWithAI() {
  const key = $("openai-key").value.trim();
  if (!key) {
    aiNotice("No API key entered — keeping your local version. The built-in generator needs no key at all.", "warn");
    return;
  }
  state.openaiKey = key;
  persist();
  aiNotice("Asking the AI to polish your copy…", "info");

  const g = currentGoogleAd(), f = currentFbAd();
  const prompt =
    "Polish this ad copy. Keep Google headlines ≤30 chars, descriptions ≤90 chars, " +
    "Facebook primary ≤125 chars. Return ONLY JSON: " +
    '{"headlines":["h1","h2","h3"],"descriptions":["d1","d2"],' +
    '"primary":"...","fbHeadline":"...","linkDesc":"..."}\n\n' +
    "Headlines: " + g.headlines.join(" | ") + "\n" +
    "Descriptions: " + g.descriptions.join(" | ") + "\n" +
    "FB primary: " + f.primary + "\nFB headline: " + f.headline + "\nLink desc: " + f.linkDesc;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const raw = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("empty response");
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const polished = JSON.parse(jsonText);
    if (!Array.isArray(polished.headlines) || !polished.primary) throw new Error("bad shape");

    renderAdFields(
      Object.assign({ path1: "", path2: "" }, currentGoogleAd(), {
        tone: state.tone,
        headlines: polished.headlines.slice(0, 3),
        descriptions: (polished.descriptions || []).slice(0, 2),
        cta: state.cta
      }),
      {
        tone: state.tone,
        primary: polished.primary,
        headline: polished.fbHeadline || "",
        linkDesc: polished.linkDesc || "",
        cta: state.cta
      },
      state.rsa
    );
    refreshChecklist();
    aiNotice("Polished with AI. The checklist above still validates every character limit.", "info");
  } catch (e) {
    // ANY failure: honest fallback to the local engine, which is the real product.
    aiNotice("Couldn't reach the AI service (" + (e && e.message ? e.message : "network error") +
      ") — showing the local version instead. Nothing was lost.", "warn");
  }
}

// ---------- boot ----------

function boot() {
  loadStore();
  $("openai-key").value = state.openaiKey || "";
  $("openai-key").addEventListener("change", () => {
    state.openaiKey = $("openai-key").value.trim();
    persist();
  });
  $("foot-year").textContent = new Date().getFullYear();
  renderToneBar();
  renderCtaPicker();
  renderSaved();
  wireCopyButtons();

  $("generate").addEventListener("click", () => generate(false));
  const ctGen = $("ct-generate");
  if (ctGen) ctGen.addEventListener("click", () => generate(false));
  $("regenerate").addEventListener("click", () => generate(true));
  $("save-campaign").addEventListener("click", saveCampaign);
  $("polish").addEventListener("click", polishWithAI);
  const csvBtn = $("export-csv");
  if (csvBtn) csvBtn.addEventListener("click", exportCSV);
  const abBtn = $("export-ab");
  if (abBtn) abBtn.addEventListener("click", exportAB);
  const rsaBtn = $("copy-rsa");
  if (rsaBtn) rsaBtn.addEventListener("click", copyRsa);
  const hp = $("hist-prev"), hn = $("hist-next");
  if (hp) hp.addEventListener("click", () => showHistory(state.histIdx - 1));
  if (hn) hn.addEventListener("click", () => showHistory(state.histIdx + 1));
  const sq = $("saved-search");
  if (sq) sq.addEventListener("input", () => {
    state.savedQuery = sq.value;
    renderSaved();
  });

  // Keep the mockup chrome (SERP breadcrumb, FB page card) in sync with the brief.
  ["business", "website"].forEach(id => {
    $(id).addEventListener("input", syncChrome);
  });
  // Live keyword chips as the brief changes.
  ["description", "keywords"].forEach(id => {
    $(id).addEventListener("input", renderKeywordChips);
  });
  renderKeywordChips();

  // Banned-word list wiring.
  renderBannedChips();
  const banInp = $("ban-input"), banAdd = $("ban-add");
  if (banInp) banInp.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addBannedWord(); }
  });
  if (banAdd) banAdd.addEventListener("click", addBannedWord);

  // Fit-to-limits button.
  const fitBtn = $("fit-limits");
  if (fitBtn) fitBtn.addEventListener("click", fitToLimits);

  // Saved-campaign JSON export / import.
  const jsonBtn = $("export-json");
  if (jsonBtn) jsonBtn.addEventListener("click", exportJSON);
  const impBtn = $("import-json"), impFile = $("import-json-file");
  if (impBtn && impFile) {
    impBtn.addEventListener("click", () => impFile.click());
    impFile.addEventListener("change", () => {
      if (impFile.files.length) importJSONFile(impFile.files[0]);
      impFile.value = "";
    });
  }

  const _renderCta = renderCtaPicker;
  renderCtaPicker = function () { _renderCta(); syncChrome(); };
  syncChrome();

  // Preview device toggle (desktop / mobile width).
  document.querySelectorAll(".devbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".devbtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const body = $("pv-body");
      if (body) body.classList.toggle("mobile", btn.dataset.dev === "mobile");
    });
  });

  // Regenerate when the business inputs change after first generation? No —
  // keep it explicit so the checklist stays tied to visible copy.
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
