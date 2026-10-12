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

check "adsToCSV produces header + 10 data rows incl. display paths, with CSV escaping" node -e "
const L=require('./js/logic.js');
const input={business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings.',cta:'Book Online'};
const g=Object.assign(L.generateGoogleAd(input,'friendly'),{path1:'services',path2:'book'});
const f=L.generateFacebookAd(input,'friendly');
const csv=L.adsToCSV(g,f,input.business);
const lines=csv.split('\n');
if(lines[0]!=='business,tone,field,text,chars,limit') throw new Error('header: '+lines[0]);
if(lines.length!==11) throw new Error('rows: '+lines.length);
if(!lines.some(l=>l.includes('headline_1'))) throw new Error('no headline rows');
if(!lines.some(l=>l.includes('fb_primary'))) throw new Error('no fb rows');
if(!lines.some(l=>l.includes('path_1')&&l.includes('services'))) throw new Error('no path rows');
// cell with a comma must be quoted
const q=L.adsToCSV({headlines:['A, B'],descriptions:[],tone:'friendly'},{primary:'',headline:'',linkDesc:''},'Biz');
if(!q.split('\n')[1].includes('\"A, B\"')) throw new Error('no CSV quoting');
"

check "generateRSAAssets returns up to 15 headlines + 4 descriptions, all within limits" node -e "
const L=require('./js/logic.js');
const input={business:'Bright Smile Dental',description:'Family dental clinic offering gentle cleanings.',cta:'Book Online',_seed:2};
const r=L.generateRSAAssets(input,'bold');
if(r.headlines.length>15||r.descriptions.length>4) throw new Error('too many: '+r.headlines.length+'/'+r.descriptions.length);
if(r.headlines.length<10) throw new Error('asset pool too small: '+r.headlines.length);
if(!r.headlines.every(h=>h.length<=30)) throw new Error('headline over 30');
if(!r.descriptions.every(d=>d.length<=90)) throw new Error('desc over 90');
if(new Set(r.headlines).size!==r.headlines.length) throw new Error('dup headlines');
if(new Set(r.descriptions).size!==r.descriptions.length) throw new Error('dup descs');
"

check "fitPath trims display paths to 15 chars" node -e "
const L=require('./js/logic.js');
if(L.fitPath('  a very long path name here  ')!=='a very long pat') throw new Error('not trimmed');
if(L.fitPath('short')!=='short') throw new Error('short changed');
"

check "adsToCSVAll exports one block per tone with tone column" node -e "
const L=require('./js/logic.js');
const input={business:'Biz',description:'We fix sinks fast.',cta:'Call Today',_seed:1};
const camps=['friendly','bold','professional'].map(t=>({tone:t,google:L.generateGoogleAd(input,t),fb:L.generateFacebookAd(input,t)}));
const csv=L.adsToCSVAll(camps,input.business);
const lines=csv.split('\n');
['friendly','bold','professional'].forEach(t=>{ if(!lines.some(l=>l.split(',')[1]===t)) throw new Error('missing tone '+t); });
if(!lines.every(l=>l.split(',')[0]==='business'||l.split(',')[0]==='Biz')) throw new Error('business col drift');
"

check "index.html wires the RSA panel, paths, and A/B export" node -e "
const fs=require('fs'), h=fs.readFileSync('index.html','utf8');
for (const id of ['rsa-card','rsa-headlines','rsa-descs','g-paths','export-ab','copy-rsa']) if(!h.includes('id=\"'+id+'\"')) throw new Error('missing '+id);
const a=fs.readFileSync('js/app.js','utf8');
for (const fn of ['generateRSAAssets','adsToCSVAll','renderRsa','exportAB','copyRsa']) if(!a.includes(fn)) throw new Error('missing fn '+fn);
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
