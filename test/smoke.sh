#!/usr/bin/env bash
# AdCopy AI smoke tests — fast structural checks.
set -u
cd "$(dirname "$0")/.."

pass=0
fail=0

check() { local desc="$1"; shift; if "$@" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1)); else echo "FAIL: $desc"; fail=$((fail+1)); fi }

check "index.html exists" test -f index.html
check "css/style.css exists" test -f css/style.css
check "js/copybank.js exists" test -f js/copybank.js
check "js/logic.js exists" test -f js/logic.js
check "js/app.js exists" test -f js/app.js
check "README.md exists" test -f README.md

check "node --check js/copybank.js" node --check js/copybank.js
check "node --check js/logic.js" node --check js/logic.js
check "node --check js/app.js" node --check js/app.js

check "bank has >=20 headline templates" node -e "
const B=require('./js/copybank.js').BANK;
const n=Object.values(B).reduce((a,t)=>a+t.googleHeadlines.length,0);
if(n<20) throw new Error('only '+n);
"

check "generator produces 3 headlines <=30 chars for sample input" node -e "
const L=require('./js/logic.js');
const g=L.generateGoogleAd({business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings, whitening and same-day crowns.',cta:'Book Online'},'friendly');
if(g.headlines.length!==3) throw new Error('headlines: '+g.headlines.length);
if(!g.headlines.every(h=>h.length<=30)) throw new Error('over limit: '+JSON.stringify(g.headlines));
if(g.descriptions.length!==2 || !g.descriptions.every(d=>d.length<=90)) throw new Error('descriptions bad');
"

check "validation returns all checklist items with boolean pass" node -e "
const L=require('./js/logic.js'), B=require('./js/copybank.js');
const input={business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings.',cta:'Book Online'};
const g=L.generateGoogleAd(input,'bold'), f=L.generateFacebookAd(input,'bold');
const items=L.validateCopy(g,f,input);
if(items.length!==B.CHECKLIST.length) throw new Error('count '+items.length);
if(!items.every(i=>typeof i.pass==='boolean' && i.id && i.label)) throw new Error('shape bad');
"

check "adsToCSV produces header + 8 data rows with CSV escaping" node -e "
const L=require('./js/logic.js');
const input={business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings.',cta:'Book Online'};
const g=L.generateGoogleAd(input,'friendly'), f=L.generateFacebookAd(input,'friendly');
const csv=L.adsToCSV(g,f,input.business);
const lines=csv.split('\n');
if(lines[0]!=='business,tone,field,text,chars,limit') throw new Error('header: '+lines[0]);
if(lines.length!==9) throw new Error('rows: '+lines.length);
if(!lines.some(l=>l.includes('headline_1'))) throw new Error('no headline rows');
if(!lines.some(l=>l.includes('fb_primary'))) throw new Error('no fb rows');
// cell with a comma must be quoted
const q=L.adsToCSV({headlines:['A, B'],descriptions:[],tone:'friendly'},{primary:'',headline:'',linkDesc:''},'Biz');
if(!q.split('\n')[1].includes('\"A, B\"')) throw new Error('no CSV quoting');
"

check "qualityScore maps pass-rate to 0-100" node -e "
const L=require('./js/logic.js');
if(L.qualityScore([])!==0) throw new Error('empty not 0');
const all=[{pass:true},{pass:true},{pass:true},{pass:true}];
if(L.qualityScore(all)!==100) throw new Error('all-pass not 100');
if(L.qualityScore([{pass:true},{pass:false}])!==50) throw new Error('half not 50');
"

check "index.html references all three js files" node -e "
const fs=require('fs'), h=fs.readFileSync('index.html','utf8');
for(const f of ['js/copybank.js','js/logic.js','js/app.js']) if(!h.includes(f)) throw new Error('missing '+f);
"

check "pinnedKeyword overrides the extracted headline keyword" node -e "
const L=require('./js/logic.js');
const S={business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings, whitening and same-day crowns.',cta:'Book Online',pinnedKeyword:'whitening'};
const g=L.generateGoogleAd(Object.assign({_seed:0},S),'friendly');
const joined=g.headlines.join(' ').toLowerCase();
if(!joined.includes('whitening')) throw new Error('pinned keyword absent: '+g.headlines.join(' | '));
"

echo "--- smoke: $pass passed, $fail failed ---"
exit $((fail>0))
