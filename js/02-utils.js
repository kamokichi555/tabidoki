/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 02-utils.js
   純粋ユーティリティ（DOM非依存）
   依存: 00-constants.js（LIMIT, EC等）
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
// @ts-check

/* --- 自動生成: モジュール依存のインポート --- */
import { DEFAULT, LIMIT } from './00-constants.js';
import { _geoCacheGet } from './04-weather.js';


export function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// インラインonclick="func('${value}',...)" のJS文字列リテラル内に動的データを安全に埋め込む
// 順番重要: \ → ' (JSエスケープ) → " < > & (HTML属性エスケープ)
export function escJsAttr(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* ── ジオクエリ生成（共通） ── */
export function buildGeoTargets(addr){
  const cleanAddr=addr.replace(/〒\s*\d[\d\-]+\s*/,'').trim()||addr;
  const geoQuery=cleanAddr
    .replace(/[０-９]/g,m=>String.fromCharCode(m.charCodeAt(0)-0xFEE0))
    .replace(/\s*\d[\d\-号番丁目地]*.*$/,'')
    .trim()||cleanAddr;
  const cityOnly=(cleanAddr.match(/^(.+?[都道府県].+?[市区町村])/)||[])[1]||'';
  return [geoQuery,...(cityOnly&&cityOnly!==geoQuery?[cityOnly]:[])];
}
export function hasCachedCoords(addr){return buildGeoTargets(addr).some(q=>!!_geoCacheGet(q));}
/* ── 「緯度, 経度」文字列を座標に解析（住所欄が座標形式かを判定）──
   Googleマップ等からのコピペを想定。全角数字・記号や括弧・空白も受ける。
   座標として妥当（lat -90..90 / lon -180..180、両方に小数点あり）なときだけ {lat,lon}。
   日本語住所は「数字.小数,数字.小数」だけにならないため住所と誤認しない。 */
export function parseCoord(str){
  if(typeof str!=='string') return null;
  const s=str
    .replace(/[０-９．，－＋]/g,m=>String.fromCharCode(m.charCodeAt(0)-0xFEE0)) // 全角→半角
    .replace(/[()（）\s]/g,'');                                                 // 括弧・空白除去
  const m=s.match(/^([+-]?\d{1,3}\.\d+)[,，]([+-]?\d{1,3}\.\d+)$/);
  if(!m) return null;
  const lat=parseFloat(m[1]),lon=parseFloat(m[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
  if(lat<-90||lat>90||lon<-180||lon>180) return null;
  return {lat,lon};
}
/* ── 住所欄テキストから座標を抽出 ──
   ①「緯度, 経度」形式（parseCoord）②GoogleマップのURL各種から緯度経度を拾う。
   Googleで場所を探して URL を貼り付ければ、その座標を自動で取り込めるようにするための関数。
   ※ スマホGoogleマップアプリの共有短縮URL(maps.app.goo.gl/…)は座標を含まないため抽出不可。
      その場合は「地点を長押し→座標をコピー」して貼るか、ブラウザ版のフルURL(@lat,lon)を貼る。*/
export function extractMapCoord(str){
  if(typeof str!=='string') return null;
  const direct=parseCoord(str);                 // すでに「緯度, 経度」形式
  if(direct) return direct;
  let s=str; try{ s=decodeURIComponent(str); }catch(e){} // %2C 等をデコード
  const pick=m=>{
    if(!m) return null;
    const lat=parseFloat(m[1]),lon=parseFloat(m[2]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
    if(lat<-90||lat>90||lon<-180||lon>180) return null;
    return {lat,lon};
  };
  return pick(s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))            // 場所の正確な座標
      || pick(s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))               // 地図中心 @lat,lon
      || pick(s.match(/[?&](?:q|query|ll|sll|daddr|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)) // q=/ll= 等
      || null;
}
/* ── Googleマップの「共有」短縮URLか判定 ──
   maps.app.goo.gl/… や goo.gl/maps/… は座標を含まないため extractMapCoord で座標を取れない。
   これらを「住所」と取り違えず、ユーザーへ座標の貼り直しを案内するための判定。
   ※ フルURL等の座標が取れるものは、呼び出し側で先に座標として確定される前提（ここには来ない）。*/
export function isShareMapUrl(str){
  if(typeof str!=='string') return false;
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(str);
}
/* ── 度分秒（DMS）形式かを判定 ──
   parseCoord は十進法のみ対応のため、DMS（35°26'37"N など）は座標として取り込めない。
   これらを「住所」と取り違えず、ユーザーへ十進法への変換を案内するための判定。
   対応例: 35°26'37"N, 35°26′37″N, N35°26'37", 35 26 37 N, 35d26m37sN 等
   全角記号・全角数字も許容（parseCoord と同様に半角化してから判定）。*/
export function isDmsCoord(str){
  if(typeof str!=='string') return false;
  const s=str
    .replace(/[０-９．，－＋]/g,m=>String.fromCharCode(m.charCodeAt(0)-0xFEE0)) // 全角→半角
    .replace(/[（）()]/g,' ').trim();
  // 度記号(°/d)・分記号('/′/m)・方位(N/S/E/W) のいずれかを含み、かつ数字を伴うこと
  // 十進法（小数点付き数字のみ）を誤検出しないよう、度分秒/方位記号の存在を必須とする
  const hasDir=/[NSEWnsew]/.test(s);
  const hasDeg=/\d\s*[°dD]/.test(s);
  const hasMin=/\d\s*['′mM]/.test(s);
  // 「度＋方位」「度＋分」「分＋秒」など、十進法では出ない記号の組み合わせを座標候補とみなす
  const dmsLike=(hasDeg&&(hasDir||hasMin))||(hasMin&&hasDir);
  if(!dmsLike) return false;
  // 緯度経度らしい数字が2組以上あること（単一の「35°」だけの住所表記等を除外）
  const nums=s.match(/\d{1,3}(?:\.\d+)?/g);
  return !!(nums&&nums.length>=2);
}
/* ── 地点が有効な実座標(geo)を持つか ── */
export function hasGeo(s){
  return !!(s&&s.geo&&Number.isFinite(s.geo.lat)&&Number.isFinite(s.geo.lon)
    &&s.geo.lat>=-90&&s.geo.lat<=90&&s.geo.lon>=-180&&s.geo.lon<=180);
}
/* ── 地点のGoogleマップ用URLを生成（共通） ──
   実座標(geo)があればそれを最優先、無ければ「地点名＋住所」で検索クエリを組む。
   座標も検索語も無ければ '' を返す（呼び出し側でボタン非表示の判定に使う）。
   ※ 返すのは生URL。HTML属性へ埋める際は呼び出し側で esc() すること。 */
export function buildMapHref(s){
  if(hasGeo(s)) return `https://maps.google.com/?q=${s.geo.lat},${s.geo.lon}`;
  const q=[s.name,s.addr].filter(Boolean).join(' ');
  return q?`https://maps.google.com/?q=${encodeURIComponent(q)}`:'';
}
/* ── precip分類 ── */
export function pClass(p){return typeof p==='number'?(p>=70?'high':p>=40?'mid':'low'):'low';}
export function toMin(t){if(!t)return null;const[h,m]=t.split(':').map(Number);return h*60+m;}
export function fromMin(m){m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
/* nowMin: 現在時刻を「時×60+分」で返す。
   _nowMinOverride が非nullのときはその固定値を返す（自動テストで現在時刻を固定するためのフック。
   本番では常に null のため通常動作には影響しない）。 */
export let _nowMinOverride=null;
export function _setNowMinOverride(v){ _nowMinOverride=(v===null||v===undefined)?null:v; }
export function nowMin(){
  if(_nowMinOverride!==null) return _nowMinOverride;
  const n=new Date();return n.getHours()*60+n.getMinutes();
}
/* ── 共通: 分数→「○時間○分」整形 ──
   opt.span : 単位を <span style="font-size:.75em"> で小さく表示し、両表記時は分を2桁ゼロ詰め
   opt.paren: 全体を ( ) で囲む
   ※ 呼び出し側で 0/負値・深夜補正を済ませた「非負の分数」を渡す前提 */
export function fmtHM(min,opt){
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
export function wrapDiff(d){if(d<-720)d+=1440;if(d>720)d-=1440;return d;}
/* ── 共通: 曜日・日付整形（WEEK配列とフォーマット重複を1箇所に集約） ──
   parseISODate: "YYYY-MM-DD" を正午のDateへ（不正・空は null）。
   mdw  : Date → "M/D(曜)"。  ymdw: Date → "YYYY年M月D日(曜)"。 */
export const WEEK=['日','月','火','水','木','金','土'];
export function parseISODate(iso){if(!iso)return null;const d=new Date(iso+'T12:00:00');return isNaN(d.getTime())?null:d;}
export function mdw(d){return `${d.getMonth()+1}/${d.getDate()}(${WEEK[d.getDay()]})`;}
export function ymdw(d){return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;}
export function stayDur(arr,dep){const a=toMin(arr),d=toMin(dep);if(a===null||d===null)return'';const diff=d-a;if(diff<=0)return'';return fmtHM(diff,{paren:true});}
export function actDiff(plan,actual){const p=toMin(plan),a=toMin(actual);if(p===null||a===null)return null;return wrapDiff(a-p);}
export function actDiffHtml(plan,actual){const d=actDiff(plan,actual);if(d===null)return'';const str=fmtHM(Math.abs(d));if(d===0)return`<span class="stop-act-diff ontime">定刻</span>`;if(d>0)return`<span class="stop-act-diff late">+${str}</span>`;return`<span class="stop-act-diff early">-${str}</span>`;}
export function moveDur(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return'';let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return'';return fmtHM(diff);}
export function moveDurLevel(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return -1;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return -1;return diff<=60?0:diff<=120?1:2;}
export function moveDurRide(dep,nextArr){const d=toMin(dep),a=toMin(nextArr);if(d===null||a===null)return null;let diff=a-d;if(diff<0)diff+=1440;if(diff<=0||diff>720)return null;const level=diff<=60?0:diff<=120?1:2;const html=fmtHM(diff,{span:true});return{html,level};}
export function sanitize(s,max){if(typeof s!=='string')return'';return s.replace(/<[^>]*>/g,'').replace(/javascript\s*:/gi,'').replace(/on\w+\s*=/gi,'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'').slice(0,max).replace(/[\uD800-\uDBFF]$/,'').trim();}
export function isSafeUrl(s){if(!s)return true;try{const u=new URL(s);return u.protocol==='http:'||u.protocol==='https:';}catch(e){return false;}}
export function isValidTime(s){return typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
export function isValidDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);}
/* ── 共通: iOS判定（iOSは a.download非対応のため保存方法を分岐する） ── */
export const IS_IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;
/**
 * 取り込みデータを破壊的にサニタイズ（不正値の除去・上限切詰・ID再発行）。
 * 受け取るのは外部由来の未検証データなので型は any。
 * @param {any} p
 * @returns {boolean} 1日あたり上限超過で地点を切り捨てたら true
 */
export function _sanitizeImportedData(p){
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
      s.log=sanitize((typeof s.log==='string'?s.log:'').replace(/[\r\n]+/g,' '),LIMIT.log);
      // mk18新規: 実座標(geo)。妥当ならそのまま、無ければ住所が座標形式のとき導出。
      if(hasGeo(s)){ s.geo={lat:s.geo.lat,lon:s.geo.lon}; }
      else{ const g=parseCoord(s.addr); s.geo=g||null; }
    }
  }
  return truncated;
}
/* ── 旧バージョンデータの移行（_applyImportedData / 起動時復元 で共用） ──
   p を破壊的に更新。最新版（DEFAULT.version）以外はすべて旧版として共通補完を通す。
   ・mk4-v1: 日別 currentStopId から全体 currentStopId を確定（版固有処理）
   ・version を最新へ更新し、欠落フィールド(date/routeUrl/addr)を補完
   ※フィールドの型サニタイズは後続の _sanitizeImportedData が担う。
   ※以前の版許可リストは撤廃（版の追加漏れで移行がスキップされる事故を防ぐため）。 */
/** @param {any} p 移行前（旧版・フィールド欠落あり）の未検証データを破壊的に更新 */
export function _migrateData(p){
  if(!(p&&typeof p.version==='string')) return; // version不明は触らない（後続の_sanitizeImportedDataが型を整える）
  if(p.version===DEFAULT.version) return;        // 既に最新スキーマ → 何もしない
  // 旧版データは版を問わずすべてここを通す。
  // 以前は LEGACY 許可リストで版を列挙していたが、版を1つ追加し忘れると
  // その版のデータが移行（version更新＋欠落フィールド補完）をスキップする事故が起きるため撤廃。
  // 「最新版以外＝旧版」とみなし共通補完を必ず通す。版固有の処理が要るものだけ個別分岐する。
  // ※全ユーザーが同一デプロイ版を使う前提（GitHub Pages公開）なので「最新より新しいデータ」は来ない。
  if(p.version==='mk4-v1'){let mid=null;for(const d of p.days||[]){if(d.currentStopId){mid=d.currentStopId;break;}}p.currentStopId=mid;}
  for(const d of p.days||[]){
    if(!('date' in d)) d.date='';
    if(!('routeUrl' in d)) d.routeUrl='';
    for(const s of d.stops||[]) if(!('addr' in s)) s.addr='';
  }
  p.version=DEFAULT.version;
}
/* ── currentStopId を解決して返す（_applyImportedData / 起動時復元 で共用） ──
   d.currentStopId（無ければ先頭地点ID）を採用し、その地点が実在しなければ先頭地点IDへフォールバック。
   どこにも地点が無ければ null。getStatus の誤判定防止のため実在チェックを行う。 */
/** @param {TouringData} d @returns {string|null} 有効な現在地ID */
export function _resolveCurrentStopId(d){
  const firstId=(d.days?.[0]?.stops||[])[0]?.id??null;
  let id=d.currentStopId??firstId;
  if(id){
    let found=false;
    for(const day of d.days){ if((day.stops||[]).some(s=>s.id===id)){found=true;break;} }
    if(!found) id=firstId;
  }
  return id;
}
export function isTimeOrderOk(a,d){if(!a||!d)return true;return toMin(a)<=toMin(d);}
export function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
