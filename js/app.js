// AdCopy AI — DOM glue. Renders UI, wires live counters/checklist,
// clipboard, saved campaigns, and the optional OpenAI polish.
"use strict";

/* global CTAS, CHECKLIST, generateGoogleAd, generateFacebookAd, validateCopy */

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
  openaiKey: ""
};

function $(id) { return document.getElementById(id); }

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.saved)) state.saved = s.saved;
    if (typeof s.openaiKey === "string") state.openaiKey = s.openaiKey;
  } catch (e) { /* corrupted store: start fresh */ }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      saved: state.saved,
      openaiKey: state.openaiKey
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
  return {
    tone: state.tone,
    headlines: val("#g-headlines input"),
    descriptions: val("#g-descriptions textarea"),
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

function renderAdFields(g, f) {
  const gh = $("g-headlines"), gd = $("g-descriptions");
  const fp = $("f-primary"), fr = $("f-rest");
  gh.innerHTML = ""; gd.innerHTML = ""; fp.innerHTML = ""; fr.innerHTML = "";

  g.headlines.forEach(h => gh.appendChild(makeEditable(h, 30, false)));
  g.descriptions.forEach(d => gd.appendChild(makeEditable(d, 90, true)));
  fp.appendChild(makeEditable(f.primary, 125, true));
  fr.appendChild(makeEditable(f.headline, 40, false));
  fr.appendChild(makeEditable(f.linkDesc, 30, false));

  ["google-card", "fb-card", "check-card"].forEach(id => { $(id).hidden = false; });
  $("regenerate").disabled = false;
  $("save-campaign").disabled = false;
  $("polish").disabled = false;
  state.generated = true;
}

function generate(bumpSeed) {
  if (bumpSeed) state.seed += 1;
  const input = readInput();
  const g = generateGoogleAd(input, state.tone);
  const f = generateFacebookAd(input, state.tone);
  renderAdFields(g, f);
  refreshChecklist();
  syncChrome();
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
}

// ---------- mockup chrome: keep the fake platform UI in sync with the brief ----------

function syncChrome() {
  const business = $("business").value.trim();
  const website = $("website").value.trim();
  const host = (website.replace(/^https?:\/\//, "").split("/")[0] || "").toLowerCase();
  const urlEl = $("g-url");
  if (urlEl) urlEl.textContent = host || (business ? business.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com" : "yourbusiness.com");
  const pageEl = $("fb-page");
  if (pageEl) pageEl.textContent = business || "Your business";
  const avEl = $("fb-avatar");
  if (avEl) avEl.textContent = (business || "B").trim().charAt(0).toUpperCase();
  const domEl = $("fb-domain");
  if (domEl) domEl.textContent = host || "yourbusiness.com";
  const ctaBtn = $("fb-cta-btn");
  if (ctaBtn) ctaBtn.textContent = state.cta || "Learn more";
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
          "\nDescriptions:\n- " + g.descriptions.join("\n- ")
        : "FACEBOOK AD\n" + f.primary + "\nHeadline: " + f.headline + "\nLink: " + f.linkDesc;
      copyText(text, btn);
    });
  });
}

// ---------- saved campaigns ----------

function renderSaved() {
  const list = $("saved-list");
  list.innerHTML = "";
  if (!state.saved.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No saved campaigns yet — generate some ads and save them here.";
    list.appendChild(p);
    return;
  }
  state.saved.forEach(c => {
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

    const del = document.createElement("button");
    del.className = "btn ghost small";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      state.saved = state.saved.filter(x => x.id !== c.id);
      persist(); renderSaved();
    });

    row.appendChild(meta); row.appendChild(load); row.appendChild(del);
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
    fb: currentFbAd()
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
  renderToneBar(); renderCtaPicker();
  renderAdFields(c.google, c.fb);
  refreshChecklist();
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
      {
        tone: state.tone,
        headlines: polished.headlines.slice(0, 3),
        descriptions: (polished.descriptions || []).slice(0, 2),
        cta: state.cta
      },
      {
        tone: state.tone,
        primary: polished.primary,
        headline: polished.fbHeadline || "",
        linkDesc: polished.linkDesc || "",
        cta: state.cta
      }
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
  $("regenerate").addEventListener("click", () => generate(true));
  $("save-campaign").addEventListener("click", saveCampaign);
  $("polish").addEventListener("click", polishWithAI);

  // Keep the mockup chrome (SERP breadcrumb, FB page card) in sync with the brief.
  ["business", "website"].forEach(id => {
    $(id).addEventListener("input", syncChrome);
  });
  const _renderCta = renderCtaPicker;
  renderCtaPicker = function () { _renderCta(); syncChrome(); };
  syncChrome();

  // Regenerate when the business inputs change after first generation? No —
  // keep it explicit so the checklist stays tied to visible copy.
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
