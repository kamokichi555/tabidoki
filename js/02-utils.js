/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 02-utils.js
   純粋ユーティリティ（DOM非依存）
   依存: 00-constants.js（LIMIT, EC等）
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
// @ts-check

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
/* ── 共通: 分数→「○時間○分」整形 ──
   opt.span : 単位を <span style="font-size:.75em"> で小さく表示し、両表記時は分を2桁ゼロ詰め
   opt.paren: 全体を ( ) で囲む
   ※ 呼び出し側で 0/負値・深夜補正を済ませた「非負の分数」を渡す前提 */
function fmtHM(min,opt){
  const o=opt||{};
  const t=Math.max(0,Math.trunc(min||0));
  const h=Math.floor(t/60),m=t%60;
  const TS=o.span?'<span style="font-size:.75em">時間</span>':'時間';
  const MS=o.span?'<span style="font-size:.75em">分</span>':'分';
  const mm=o.span?String(m).padStart(2,'0'):String(m);
  const s=h>0&&m>0?`${h}${TS}${mm}${MS}`:h>0?`${h}${TS}`:`${m}${MS}`;
  return o.paren?`(${s})`:s;
}
/* ── 共通: 深夜またぎ補正（±12時間を超える差を1日分巻き戻す） ── */
function wrapDiff(d){if(d<-720)d+=1440;if(d>720)d-=1440;return d;}
function stayDur(arr,dep){const a=toMin(arr),d=toMin(dep);if(a===null||d===null)return'';const diff=d-a;if(diff<=0)return'';return fmtHM(diff,{paren:true});}
function actDiff(plan,actual){const p=toMin(plan),a=toMin(actual);if(p===null||a===null)return null;return wrapDiff(a-p);}
function actDiffHtml(plan,actual){const d=actDiff(plan,actual);if(d===null)return'';const str=fmtHM(Math.abs(d));if(d===0)return`<span class="stop-act-diff ontime">定刻</span>`;if(d>0)return`<span class="stop-act-diff late">+${str}</span>`;return`<span class="stop-act-diff early">-${str}</span>`;}
function moveDur(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return'';let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return'';return fmtHM(diff);}
function moveDurLevel(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return -1;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return -1;return diff<=60?0:diff<=120?1:2;}
function moveDurRide(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return null;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return null;const level=diff<=60?0:diff<=120?1:2;const html=fmtHM(diff,{span:true});return{html,level};}
function sanitize(s,max){if(typeof s!=='string')return'';return s.replace(/<[^>]*>/g,'').replace(/javascript\s*:/gi,'').replace(/on\w+\s*=/gi,'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'').slice(0,max).trim();}
function isSafeUrl(s){if(!s)return true;try{const u=new URL(s);return u.protocol==='http:'||u.protocol==='https:';}catch(e){return false;}}
function isValidTime(s){return typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
function isValidDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);}
/* ── 共通: iOS判定（iOSは a.download非対応のため保存方法を分岐する） ── */
const IS_IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;
/**
 * 取り込みデータを破壊的にサニタイズ（不正値の除去・上限切詰・ID再発行）。
 * 受け取るのは外部由来の未検証データなので型は any。
 * @param {any} p
 * @returns {boolean} 1日あたり上限超過で地点を切り捨てたら true
 */
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
      // mk16新規フィールド（旧データには存在しないためデフォルト付与）
      s.actArr=isValidTime(s.actArr)?s.actArr:'';
      s.actDep=isValidTime(s.actDep)?s.actDep:'';
      s.log=sanitize(s.log||'',LIMIT.log);
    }
  }
  return truncated;
}
/* ── 旧バージョンデータの移行（_applyImportedData / 起動時復元 で共用） ──
   p を破壊的に更新。対象バージョン以外は無変更。
   ・mk4-v1: 日別 currentStopId から全体 currentStopId を確定
   ・version を最新へ更新し、欠落フィールド(date/routeUrl/addr)を補完
   ※フィールドの型サニタイズは後続の _sanitizeImportedData が担う。
   ※対応バージョン一覧をここ1箇所に集約（追加漏れによる移行不全を防ぐ）。 */
/** @param {any} p 移行前（旧版・フィールド欠落あり）の未検証データを破壊的に更新 */
function _migrateData(p){
  const LEGACY=['mk15-v1','mk13-v1','mk8-v1','mk7-v2','mk7-v1','mk6-v1','mk5-v1','mk4-v2','mk4-v1'];
  if(!(p&&p.version&&LEGACY.includes(p.version))) return;
  if(p.version==='mk4-v1'){let mid=null;for(const d of p.days){if(d.currentStopId){mid=d.currentStopId;break;}}p.currentStopId=mid;}
  p.version=DEFAULT.version;
  for(const d of p.days||[]){
    if(!('date' in d)) d.date='';
    if(!('routeUrl' in d)) d.routeUrl='';
    for(const s of d.stops||[]) if(!('addr' in s)) s.addr='';
  }
}
/* ── currentStopId を解決して返す（_applyImportedData / 起動時復元 で共用） ──
   d.currentStopId（無ければ先頭地点ID）を採用し、その地点が実在しなければ先頭地点IDへフォールバック。
   どこにも地点が無ければ null。getStatus の誤判定防止のため実在チェックを行う。 */
/** @param {TouringData} d @returns {string|null} 有効な現在地ID */
function _resolveCurrentStopId(d){
  const firstId=(d.days?.[0]?.stops||[])[0]?.id??null;
  let id=d.currentStopId??firstId;
  if(id){
    let found=false;
    for(const day of d.days){ if((day.stops||[]).some(s=>s.id===id)){found=true;break;} }
    if(!found) id=firstId;
  }
  return id;
}
function isTimeOrderOk(a,d){if(!a||!d)return true;return toMin(a)<=toMin(d);}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
