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

check "parseBannedWords normalizes and dedupes; findBannedWord is whole-word" node -e "
const L=require('./js/logic.js');
const b=L.parseBannedWords([' Easy ','easy','X',' cheap ']);
if(b.join('|')!=='easy|cheap') throw new Error('parse: '+b.join('|')); // single letters dropped
if(L.findBannedWord('The cheapest option in town',['cheap'])!==null) throw new Error('substring false positive');
if(L.findBannedWord('Healthcare for families',['care'])!==null) throw new Error('word-char false positive');
if(L.findBannedWord('Nothing cheap about us',['cheap'])!=='cheap') throw new Error('no match found');
"

check "generator skips templates containing a banned word" node -e "
const L=require('./js/logic.js');
const input={business:'Biz',description:'We make plumbing easy and simple for everyone.',cta:'Call Today',bannedWords:['easy'],_seed:0};
const g=L.generateGoogleAd(input,'friendly');
const f=L.generateFacebookAd(input,'friendly');
const r=L.generateRSAAssets(input,'friendly');
const all=[...g.headlines,...g.descriptions,f.primary,f.headline,f.linkDesc,...r.headlines,...r.descriptions].join(' ');
if(/\beasy\b/i.test(all)) throw new Error('banned word leaked into copy');
if(g.headlines.length!==3||g.descriptions.length!==2) throw new Error('shape broke under filter');
"

check "validateCopy reports the no-banned checklist item" node -e "
const L=require('./js/logic.js'), B=require('./js/copybank.js');
if(!B.CHECKLIST.some(c=>c.id==='no-banned')) throw new Error('no-banned not in checklist');
const g={headlines:['Great plumbing today'],descriptions:['Call us now.'],cta:'Call Today'};
const f={primary:'Short fb text.',headline:'H',linkDesc:'L'};
const bad=L.validateCopy(g,f,{description:'plumbing',cta:'Call Today',bannedWords:['plumbing']});
const it=bad.find(i=>i.id==='no-banned');
if(!it||it.pass!==false) throw new Error('banned word not flagged');
const none=L.validateCopy(g,f,{description:'plumbing',cta:'Call Today'});
const it2=none.find(i=>i.id==='no-banned');
if(!it2||it2.pass!==true) throw new Error('empty banned list should pass');
"

check "fitTo is exported and trims at word boundaries" node -e "
const L=require('./js/logic.js');
const out=L.fitTo('This headline is far too long for Google',30);
if(out.length>30) throw new Error('still over: '+out);
if(out!=='This headline is far too long') throw new Error('bad cut: '+out);
"

check "campaignsToJSON / campaignsFromJSON round-trip saved campaigns" node -e "
const L=require('./js/logic.js');
const saved=[{id:'c1',name:'Test',date:'2026-10-13T00:00:00.000Z',tone:'bold',
  input:{business:'Biz',description:'d',website:'',keywords:'',cta:'Call Today',pinnedKeyword:'',bannedWords:['cheap']},
  google:{tone:'bold',headlines:['H1','H2','H3'],descriptions:['D1','D2'],path1:'a',path2:'',cta:'Call Today'},
  fb:{tone:'bold',primary:'P',headline:'H',linkDesc:'L',cta:'Call Today'},rsa:null}];
const json=L.campaignsToJSON(saved);
const res=L.campaignsFromJSON(json);
if(res.campaigns.length!==1||res.dropped!==0) throw new Error('round-trip lost data');
if(res.campaigns[0].id!=='c1'||res.campaigns[0].input.bannedWords[0]!=='cheap') throw new Error('fields not preserved');
const res2=L.campaignsFromJSON(JSON.stringify({campaigns:[saved[0],null,42,'junk-string']}));
if(res2.campaigns.length!==1||res2.dropped!==3) throw new Error('bad rows not dropped: '+res2.campaigns.length+'/'+res2.dropped);
let threw=false; try{ L.campaignsFromJSON('{\"campaigns\":42}'); }catch(e){ threw=true; }
if(!threw) throw new Error('invalid shape not rejected');
"

check "index.html + app.js wire the new UI (banned words, fit-to-limits, JSON io)" node -e "
const fs=require('fs'), h=fs.readFileSync('index.html','utf8');
for (const id of ['ban-input','ban-add','ban-words','fit-limits','export-json','import-json','import-json-file','saved-notice']) if(!h.includes('id=\"'+id+'\"')) throw new Error('missing '+id);
const a=fs.readFileSync('js/app.js','utf8');
for (const fn of ['renderBannedChips','addBannedWord','fitToLimits','exportJSON','importJSONFile','savedNotice']) if(!a.includes(fn)) throw new Error('missing fn '+fn);
const l=fs.readFileSync('js/logic.js','utf8');
for (const fn of ['parseBannedWords','findBannedWord','campaignsToJSON','campaignsFromJSON']) if(!l.includes(fn)) throw new Error('missing logic fn '+fn);
"

echo "--- smoke: $pass passed, $fail failed ---"
exit $((fail>0))
