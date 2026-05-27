/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 02-utils.js
   純粋ユーティリティ（DOM非依存）
   依存: 00-constants.js（LIMIT, EC等）
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// インラインonclick="func('${value}',...)" のJS文字列リテラル内に動的データを安全に埋め込む
// 順番重要: \ → ' (JSエスケープ) → " < > & (HTML属性エスケープ)
function escJsAttr(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* ── ジオクエリ生成（共通） ── */
function buildGeoTargets(addr){
  const cleanAddr=addr.replace(/〒\s*\d[\d\-]+\s*/,'').trim()||addr;
  const geoQuery=cleanAddr
    .replace(/[０-９]/g,m=>String.fromCharCode(m.charCodeAt(0)-0xFEE0))
    .replace(/\s*\d[\d\-号番丁目地]*.*$/,'')
    .trim()||cleanAddr;
  const cityOnly=(cleanAddr.match(/^(.+?[都道府県].+?[市区町村])/)||[])[1]||'';
  return [geoQuery,...(cityOnly&&cityOnly!==geoQuery?[cityOnly]:[])];
}
function hasCachedCoords(addr){return buildGeoTargets(addr).some(q=>!!_geoCacheGet(q));}
/* ── precip分類 ── */
function pClass(p){return typeof p==='number'?(p>=70?'high':p>=40?'mid':'low'):'low';}
function toMin(t){if(!t)return null;const[h,m]=t.split(':').map(Number);return h*60+m;}
function fromMin(m){m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function nowMin(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function stayDur(arr,dep){const a=toMin(arr),d=toMin(dep);if(a===null||d===null)return'';const diff=d-a;if(diff<=0)return'';const h=Math.floor(diff/60),m=diff%60;return h>0&&m>0?`(${h}時間${m}分)`:h>0?`(${h}時間)`:`(${m}分)`;}
function actDiff(plan,actual){const p=toMin(plan),a=toMin(actual);if(p===null||a===null)return null;let d=a-p;if(d<-720)d+=1440;if(d>720)d-=1440;return d;}
function actDiffHtml(plan,actual){const d=actDiff(plan,actual);if(d===null)return'';const abs=Math.abs(d),h=Math.floor(abs/60),m=abs%60;const str=h>0&&m>0?`${h}時間${m}分`:h>0?`${h}時間`:`${m}分`;if(d===0)return`<span class="stop-act-diff ontime">定刻</span>`;if(d>0)return`<span class="stop-act-diff late">+${str}</span>`;return`<span class="stop-act-diff early">-${str}</span>`;}
function moveDur(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return'';let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return'';const h=Math.floor(diff/60),m=diff%60;return h>0&&m>0?`${h}時間${m}分`:h>0?`${h}時間`:`${m}分`;}
function moveDurLevel(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return -1;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return -1;return diff<=60?0:diff<=120?1:2;}
function moveDurRide(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return null;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return null;const h=Math.floor(diff/60),m=diff%60;const level=diff<=60?0:diff<=120?1:2;let html=h>0&&m>0?`${h}<span style="font-size:.75em">時間</span>${String(m).padStart(2,'0')}<span style="font-size:.75em">分</span>`:h>0?`${h}<span style="font-size:.75em">時間</span>`:`${m}<span style="font-size:.75em">分</span>`;return{html,level};}
function sanitize(s,max){if(typeof s!=='string')return'';return s.replace(/<[^>]*>/g,'').replace(/javascript\s*:/gi,'').replace(/on\w+\s*=/gi,'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'').slice(0,max).trim();}
function isSafeUrl(s){if(!s)return true;try{const u=new URL(s);return u.protocol==='http:'||u.protocol==='https:';}catch(e){return false;}}
function isValidTime(s){return typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
function isValidDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);}
function _sanitizeImportedData(p){
  if(!p||typeof p!=='object')return false;
  if('title' in p) p.title=sanitize(p.title,LIMIT.title);
  if('currentStopId' in p && typeof p.currentStopId!=='string') p.currentStopId=null;
  if(!Array.isArray(p.days)){p.days=[];return false;}
  const seenIds=new Set(); // 重複ID検出用（wxStopResの衝突を防ぐ）
  let truncated=false;
  for(const d of p.days){
    if(!d||typeof d!=='object')continue;
    d.date=isValidDate(d.date)?d.date:'';
    d.routeUrl=isSafeUrl(d.routeUrl)?sanitize(d.routeUrl,LIMIT.url):'';
    if('label' in d) d.label=sanitize(d.label,40);
    if(!Array.isArray(d.stops)){d.stops=[];continue;}
    if(d.stops.length>LIMIT.stopsPerDay){d.stops=d.stops.slice(0,LIMIT.stopsPerDay);truncated=true;}
    for(const s of d.stops){
      if(!s||typeof s!=='object')continue;
      s.id=(typeof s.id==='string'&&/^[a-z0-9]+$/i.test(s.id)&&s.id.length<=40)?s.id:(Date.now().toString(36)+Math.random().toString(36).slice(2));
      // 重複IDは新規発行（wxStopResキー衝突防止）
      while(seenIds.has(s.id)){s.id=Date.now().toString(36)+Math.random().toString(36).slice(2);}
      seenIds.add(s.id);
      s.name=sanitize(s.name,LIMIT.name);
      s.addr=sanitize(s.addr,LIMIT.addr);
      s.note=sanitize(s.note,LIMIT.note);
      s.arr=isValidTime(s.arr)?s.arr:'';
      s.dep=isValidTime(s.dep)?s.dep:'';
      s.fuel=!!s.fuel;
      // mk15新規フィールド（旧データには存在しないためデフォルト付与）
      s.actArr=isValidTime(s.actArr)?s.actArr:'';
      s.actDep=isValidTime(s.actDep)?s.actDep:'';
      s.log=sanitize(s.log||'',LIMIT.log);
    }
  }
  return truncated;
}
function isTimeOrderOk(a,d){if(!a||!d)return true;return toMin(a)<=toMin(d);}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
