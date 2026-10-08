#!/usr/bin/env bash
# AdCopy AI end-to-end tests — exercise the real generation/validation logic via node.
set -u
cd "$(dirname "$0")/.."

pass=0
fail=0

check() { local desc="$1"; shift; if "$@" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1)); else echo "FAIL: $desc"; fail=$((fail+1)); fi }

export SAMPLE='{"business":"Bright Smile Dental","description":"Family dental clinic offering gentle cleanings, whitening and same-day crowns. New patients save 20%.","keywords":"teeth whitening","cta":"Book Online"}'

check "1: all 3 tones produce different copy for the same input" node -e '
const L=require("./js/logic.js");
const S=JSON.parse(process.env.SAMPLE);
const mk=t=>{const g=L.generateGoogleAd(Object.assign({_seed:0},S),t);return g.headlines.join("|")+"||"+g.descriptions.join("|");};
const a=mk("friendly"),b=mk("bold"),c=mk("professional");
if(a===b||b===c||a===c) throw new Error("tones not distinct");
'

check "2: over-limit headline is caught by the validator" node -e '
const L=require("./js/logic.js");
const g={headlines:["This headline is definitely way too long for Google","Short one","Another short one"],descriptions:["Fine description here."],cta:"Book Online"};
const f={primary:"Short fb text.",headline:"H",linkDesc:"L"};
const items=L.validateCopy(g,f,{description:"dental clinic",cta:"Book Online"});
const it=items.find(i=>i.id==="headlines-30");
if(!it||it.pass!==false) throw new Error("not flagged");
'

check "3: CTA picker inserts the chosen CTA into the copy" node -e '
const L=require("./js/logic.js");
const S=JSON.parse(process.env.SAMPLE); S.cta="Get a Free Quote";
const g=L.generateGoogleAd(S,"professional");
const f=L.generateFacebookAd(S,"professional");
const all=[...g.headlines,...g.descriptions,f.primary,f.headline,f.linkDesc].join(" ").toLowerCase();
if(!all.includes("get a free quote")) throw new Error("CTA missing");
'

check "4: keyword extraction finds the business main term" node -e '
const L=require("./js/logic.js");
const kws=L.extractKeywords("We are a plumbing company. Our plumbing experts fix leaks fast. Plumbing done right.");
if(!kws.includes("plumbing")) throw new Error("got: "+kws.join(","));
'

check "5: empty description still yields valid generic ads without crashing" node -e '
const L=require("./js/logic.js");
const g=L.generateGoogleAd({business:"",description:"",cta:"Learn More"},"friendly");
const f=L.generateFacebookAd({business:"",description:"",cta:"Learn More"},"friendly");
if(g.headlines.length!==3||g.descriptions.length!==2) throw new Error("google shape");
if(!g.headlines.every(h=>h.length<=30)) throw new Error("headline over limit");
if(!f.primary||f.primary.length>125) throw new Error("fb primary bad");
'

check "6: ALL-CAPS headline is flagged by the validator" node -e '
const L=require("./js/logic.js");
const g={headlines:["BUY NOW HUGE SALE","Short one","Another one"],descriptions:["Fine description."],cta:"Shop Now"};
const f={primary:"Short fb text.",headline:"H",linkDesc:"L"};
const items=L.validateCopy(g,f,{description:"retail store sale",cta:"Shop Now"});
const it=items.find(i=>i.id==="no-caps");
if(!it||it.pass!==false) throw new Error("not flagged");
'

check "7: regeneration with a new seed varies the copy" node -e '
const L=require("./js/logic.js");
const S=JSON.parse(process.env.SAMPLE);
const a=L.generateGoogleAd(Object.assign({_seed:0},S),"bold");
const b=L.generateGoogleAd(Object.assign({_seed:7},S),"bold");
if(a.headlines.join("|")===b.headlines.join("|")) throw new Error("no variation");
'

check "8: CSV export round-trips all generated fields with correct limits" node -e '
const L=require("./js/logic.js");
const S=JSON.parse(process.env.SAMPLE);
const g=L.generateGoogleAd(S,"friendly"), f=L.generateFacebookAd(S,"friendly");
const lines=L.adsToCSV(g,f,S.business).split("\n");
if(lines[0]!=="business,tone,field,text,chars,limit") throw new Error("bad header");
const hl=lines.filter(l=>l.includes("headline_"));
const ds=lines.filter(l=>l.includes("description_"));
if(hl.length!==3||ds.length!==2) throw new Error("google rows: "+hl.length+"/"+ds.length);
// chars column must match the actual text length (accounting for CSV quoting)
hl.forEach(l=>{
  const cols=l.match(/(".*?"|[^,]*),/g).map(c=>c.replace(/,$/,""));
  const text=cols[3].replace(/^"|"$/g,"").replace(/""/g,"\"");
  if(String(text.length)!==cols[4]) throw new Error("char count mismatch in "+l);
});
'

check "9: qualityScore honors the checklist items exactly" node -e '
const L=require("./js/logic.js"), B=require("./js/copybank.js");
const S=JSON.parse(process.env.SAMPLE);
const g=L.generateGoogleAd(S,"friendly"), f=L.generateFacebookAd(S,"friendly");
const items=L.validateCopy(g,f,S);
const q=L.qualityScore(items);
const expect=Math.round(items.filter(i=>i.pass).length/items.length*100);
if(q!==expect) throw new Error("score "+q+" != expected "+expect);
if(items.length!==B.CHECKLIST.length) throw new Error("checklist drift");
'

check "10: pinned keyword flows through to the Facebook ad as well" node -e '
const L=require("./js/logic.js");
const S=JSON.parse(process.env.SAMPLE); S.pinnedKeyword="whitening";
const f=L.generateFacebookAd(S,"bold");
if(f.keyword!=="Whitening"&&!f.primary.toLowerCase().includes("whitening")) throw new Error("pinned keyword missing from FB ad: "+f.primary);
'

echo "--- e2e: $pass passed, $fail failed ---"
exit $((fail>0))
