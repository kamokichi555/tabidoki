/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 04-weather.js
   天気取得・ジオコーディング・キュー管理
   依存: 00-constants.js（WMO）, 02-utils.js（esc/pClass/buildGeoTargets等）
   実行時依存: data, S.currentDay, S.isRide, render, renderRide, showInfoToast
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { S, data } from './01-state.js';
import { LSK, SK, WMO, WX_GEOCODE_INTERVAL_MS } from './00-constants.js';
import { buildGeoTargets, hasCachedCoords, hasGeo, pClass } from './02-utils.js';
import { currentDayFlat } from './06-day.js';
import { renderRide, showInfoToast, updateClock } from './07-render.js';
import { _dbgLog } from './12-debug.js';
/* ══ 天気キャッシュ ══
   geoCache   : クエリ文字列 → {lat,lon}  ※localStorageに永続化
   fcastCache : "lat2,lon2_date" → {wcode,tmax,tmin,precip,time}
   wxStopRes  : stopId → result | 'loading' | null
*/
/* ══ localStorage ユーティリティ（容量管理） ══ */
export function _lsSetItem(key,val){
  try{
    localStorage.setItem(key,val);
  }catch(e){
    if(e.name==='QuotaExceededError'||e.code===22){
      // 容量超過 → キャッシュ系を優先削除して再試行
      console.warn('[旅刻] localStorage容量超過。キャッシュを削減します');
      _dbgLog('ls_quota_exceeded',{key});
      try{localStorage.removeItem(GEO_SK);}catch(_){}
      try{localStorage.removeItem(LSK.highwayCache);}catch(_){}
      try{localStorage.removeItem(LSK.michiCache);}catch(_){}
      try{localStorage.setItem(key,val);}catch(e2){
        console.error('[旅刻] localStorage保存失敗（容量不足）:',key);
        _dbgLog('ls_save_failed',{key,err:String(e2&&e2.name||e2).slice(0,80)});
        if(key===SK) showInfoToast('⚠️ ストレージ容量不足のため自動保存できません',4000);
      }
    }else if(e instanceof DOMException){
      // プライベートモード等でアクセス不可の場合
      console.warn('[旅刻] localStorage利用不可:',e.name,key);
      _dbgLog('ls_unavailable',{key,name:e.name});
      if(key===SK) showInfoToast('⚠️ このブラウザではデータを自動保存できません（JSONで手動保存してください）',5000);
    }
  }
}

export const GEO_SK='touring_geo';
export const GEO_MAX=80; // LRU上限
export const geoCache=(()=>{try{return JSON.parse(localStorage.getItem(GEO_SK))||{};}catch(e){return{};}})();
export function _geoCacheGet(q){const e=geoCache[q];if(!e)return null;e.ts=Date.now();return e;}
export function _geoCacheSet(q,lat,lon){geoCache[q]={lat,lon,ts:Date.now()};_saveGeoCache();}
export function _saveGeoCache(){try{
  const keys=Object.keys(geoCache);
  if(keys.length>GEO_MAX){
    // LRU: tsが古い順に削除
    keys.sort((a,b)=>(geoCache[a].ts||0)-(geoCache[b].ts||0))
      .slice(0,keys.length-GEO_MAX).forEach(k=>delete geoCache[k]);
  }
  _lsSetItem(GEO_SK,JSON.stringify(geoCache));
}catch(e){}}
export const FCST_SK='touring_fcast';
export const fcastCache=(()=>{try{return JSON.parse(sessionStorage.getItem(FCST_SK))||{};}catch(e){return{};}})();
export function _saveFcastCache(){try{sessionStorage.setItem(FCST_SK,JSON.stringify(fcastCache));}catch(e){}}
export const wxStopRes={};
/* ── 共通: idから地点オブジェクトを取得（onStopWxReady/_showLoadingDomで共用） ── */
export function _stopById(id){
  for(const day of data.days){for(const s of day.stops){if(s.id===id) return s;}}
  return null;
}
export let wxQueueRunning=false;
export let wxGen=0; // 世代トークン：refreshAllWeatherで++し、実行中ループは世代変化で自然離脱する
export function _bumpWxGen(){ wxGen++; } // 他モジュールからの世代更新用（importは再代入不可のため）
export const wxQueue=[];
export const wxQueueFast=[];
// キューが刺さった場合の自動リセット（30秒ごとに監視）
setInterval(()=>{
  if(wxQueueRunning&&!wxQueue.length&&!wxQueueFast.length) wxQueueRunning=false;
  // 非表示タブでは監視不要（復帰時に visibilitychange で再取得する）
  if(document.hidden) return;
  // loading 状態の地点が1つも無ければ全地点走査はスキップ（通常時のコストを回避）
  if(!Object.values(wxStopRes).some(v=>v==='loading')) return;
  // 孤立したloading（キューに存在しない＝処理されない）のみリセット再投入。
  // wxQueueIdsに在る地点は処理中/待機中なので触らない（重複投入を防ぐ）
  data.days.forEach((day,di)=>{
    const date=day.date||_isoToday(di);
    day.stops.forEach(s=>{
      if(wxStopRes[s.id]==='loading'&&!wxQueueIds.has(s.id)){delete wxStopRes[s.id];enqueueStop(s,date);}
    });
  });
},30000);

/* ── 天気タップ再取得 ── */
export function retryStopWeather(stopId){
  const r=wxStopRes[stopId];
  if(r==='loading'||wxQueueIds.has(stopId)){showInfoToast('🌐 取得中です',1500);return;}
  // 対象地点とその日付を取得
  let stop=null,date='';
  for(let di=0;di<data.days.length;di++){
    const s=data.days[di].stops.find(s=>s.id===stopId);
    if(s){stop=s;date=data.days[di].date||_isoToday(di);break;}
  }
  if(!stop){return;}
  if(!(stop.addr||'').trim()&&!hasGeo(stop)){showInfoToast('⚠️ 住所または座標がないため取得できません',2000);return;}
  delete wxStopRes[stopId];
  wxQueueIds.delete(stopId);
  enqueueStop(stop,date);
  // 即時 loading 表示
  const el=document.getElementById('wx-'+stopId);
  if(el) el.innerHTML='<div class="stop-wx-loading">🌐 取得中…</div>';
  showInfoToast('🌐 天気を再取得します',2000);
}

export function stopWxInner(stopId,hasAddr){
  if(!hasAddr) return '';  // 住所なしは一切表示しない
  const r=wxStopRes[stopId];
  if(!r) return '<div class="stop-wx-loading">🌐 取得中…</div>';
  if(r==='loading') return '<div class="stop-wx-loading">🌐 取得中…</div>';
  if(r.isPast) return '';
  if(r.outOfRange) return '<div class="stop-wx-loading" title="予報は16日先まで取得できます">📅 予報期間外</div>';
  if(r.error) return `<div class="stop-wx-loading" onclick="retryStopWeather('${stopId}')" style="cursor:pointer" title="タップして再取得">↻ 再取得</div>`;
  const w=WMO[r.wcode]??{e:'🌡️',t:'不明'};
  const p=r.precip??null;
  const pStr=p!==null?`${p}%`:'--';
  let tStr,tnStr;
  if(r.hourly&&r.temp!=null){
    // 到着時刻の気温を大きく、日最高最低をサブで
    const tmx=r.tmax!=null?Math.round(r.tmax):null;
    const tmn=r.tmin!=null?Math.round(r.tmin):null;
    tStr=`<span style="color:var(--amber)">${Math.round(r.temp)}°</span>`;
    tnStr=tmx!=null?`<span class="stop-wx-tmax"> ↑${tmx}°</span><span class="stop-wx-tmin"> ↓${tmn!=null?tmn:'--'}°</span>`:'';
  }else{
    const tmx=r.tmax!=null?Math.round(r.tmax):null;
    const tmn=r.tmin!=null?Math.round(r.tmin):null;
    tStr=tmx!=null?`<span class="stop-wx-tmax">↑${tmx}°</span>`:'--';
    tnStr=tmn!=null?`<span class="stop-wx-tmin"> ↓${tmn}°</span>`:'';
  }
  return `<div class="stop-wx">
    <span class="stop-wx-icon">${w.e}</span>
    <div class="stop-wx-body">
      <div class="stop-wx-row1"><span class="stop-wx-cond">${w.t}</span><span class="stop-wx-precip ${pClass(p)}">💧${pStr}</span></div>
      <div class="stop-wx-row2"><span class="stop-wx-temp">${tStr}${tnStr}</span></div>
    </div>
  </div>`;
}

/* 走行画面 天気表示（2行レイアウト） */
export function rideWxCompact(stopId,hasAddr){
  const r=wxStopRes[stopId];
  if(!hasAddr) return '';
  const _state=(icon,msg)=>`<div class="ride-wx-compact"><div class="cw-row1"><span class="cw-icon">${icon}</span><span class="cw-cond" style="opacity:.5">${msg}</span></div></div>`;
  if(!r||r==='loading') return _state('🌐','取得中…');
  if(r.isPast) return '';
  if(r.outOfRange) return _state('📅','予報期間外');
  if(r.error) return `<div class="ride-wx-compact" onclick="retryStopWeather('${stopId}')" style="cursor:pointer"><div class="cw-row1"><span class="cw-icon">↻</span><span class="cw-cond" style="opacity:.5">再取得</span></div></div>`;
  const w=WMO[r.wcode]??{e:'🌡️',t:''};
  const p=r.precip??null;
  const pStr=p!==null?`${p}%`:'';
  const pCls=pClass(p);
  const tmax=r.tmax!=null?Math.round(r.tmax):null;
  const tmin=r.tmin!=null?Math.round(r.tmin):null;
  const temp=r.temp!=null?Math.round(r.temp):null;
  // 2行目: 気温
  let row2='';
  if(r.hourly&&temp!==null){
    const range=(tmax!==null&&tmin!==null)
      ?`<span class="stop-wx-tmax">↑${tmax}°</span><span class="stop-wx-tmin">↓${tmin}°</span>`:'';
    row2=`<div class="cw-row2"><span class="cw-temp">${temp}°</span>${range}</div>`;
  }else if(tmax!==null&&tmin!==null){
    row2=`<div class="cw-row2"><span class="stop-wx-tmax">↑${tmax}°</span><span class="stop-wx-tmin">↓${tmin}°</span></div>`;
  }else if(temp!==null){
    row2=`<div class="cw-row2"><span class="cw-temp">${temp}°</span></div>`;
  }
  return `<div class="ride-wx-compact">
    <div class="cw-row1"><span class="cw-icon">${w.e}</span><span class="cw-cond">${w.t||''}</span>${pStr?`<span class="cw-precip ${pCls}">💧${pStr}</span>`:''}</div>
    ${row2}
  </div>`;
}

/* ── 走行画面・次地点ストリップ用：天気を1行（アイコン＋気温＋降水%）で返す ── */
export function rideWxStrip(stopId,hasAddr){
  if(!hasAddr) return '';
  const r=wxStopRes[stopId];
  if(!r||r==='loading') return '<span class="ride-wx-strip"><span class="rws-ic">🌐</span></span>';
  if(r.isPast) return '';
  if(r.outOfRange) return '<span class="ride-wx-strip"><span class="rws-ic">📅</span></span>';
  if(r.error) return `<span class="ride-wx-strip" onclick="event.stopPropagation();retryStopWeather('${stopId}')" style="cursor:pointer"><span class="rws-ic">↻</span></span>`;
  const w=WMO[r.wcode]??{e:'🌡️',t:''};
  const temp=r.temp!=null?Math.round(r.temp):(r.tmax!=null?Math.round(r.tmax):null);
  const p=r.precip??null;
  return `<span class="ride-wx-strip"><span class="rws-ic">${w.e}</span>${temp!==null?`<span class="rws-t">${temp}°</span>`:''}${p!==null?`<span class="rws-p ${pClass(p)}">💧${p}%</span>`:''}</span>`;
}

/* ── 取得完了後 DOM部分更新 ── */
export function onStopWxReady(stopId){
  wxQueueIds.delete(stopId);
  if(S.isRide){
    // 走行ビューはwx-ラッパーを持たない → 現在地/次地点の更新時のみrenderRideで再描画
    const flat=currentDayFlat();
    const vs=flat[S.rideViewIdx],ns=flat[S.rideViewIdx+1];
    if((vs&&vs.id===stopId)||(ns&&ns.id===stopId)) renderRide();
    return;
  }
  // 通常ビュー：該当地点のwx-要素のみ部分更新
  const el=document.getElementById('wx-'+stopId);
  if(el){
    const s=_stopById(stopId);
    el.innerHTML=stopWxInner(stopId,!!(s&&(s.addr||hasGeo(s))));
  }
}
/* ── 取得開始時に即座にDOM更新（loading表示） ── */
export function _showLoadingDom(stopId){
  const el=document.getElementById('wx-'+stopId);
  if(!el) return;
  // addrがある地点のみloading表示（住所なしは取得しても表示しない）
  const s=_stopById(stopId);
  if(s&&(s.addr||hasGeo(s))) el.innerHTML='<div class="stop-wx-loading">🌐 取得中…</div>';
}

/* ── wttr.in コード → WMO近似変換 ── */
export function _wttrToWmo(c){
  if(c===113) return 0;
  if(c===116) return 2;
  if(c===119||c===122) return 3;
  if(c===143||c===248||c===260) return 45;
  if(c===176||c===263||c===266||c===353) return 61;
  if(c===293||c===296||c===299||c===356) return 63;
  if(c===302||c===305||c===308||c===359) return 65;
  if(c===179||c===323||c===368) return 71;
  if(c===326||c===329||c===332||c===335||c===338||c===371) return 75;
  if(c===200||c===386||c===389||c===392||c===395) return 95;
  return 3;
}

/* ── wttr.in フォールバックフェッチ ── */
export async function _fetchWttr(lat,lon,date,arrHour){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),8000);
  try{
    const r=await fetch(`https://wttr.in/${lat},${lon}?format=j1`,{signal:ctrl.signal,credentials:'omit'});
    clearTimeout(t);
    if(!r.ok) return null;
    const j=await r.json();
    const dayData=j?.weather?.find(w=>w.date===date)??j?.weather?.[0];
    if(!dayData) return null;
    const tmax=parseFloat(dayData.maxtempC);
    const tmin=parseFloat(dayData.mintempC);
    let wcode=3,temp=null,precip=null;
    if(arrHour!==null&&dayData.hourly?.length){
      // time は "0","300","600"... → 実時刻に変換して最近傍を選ぶ
      const h=dayData.hourly.reduce((best,cur)=>{
        const ct=parseInt(cur.time)/100;
        const bt=parseInt(best.time)/100;
        return Math.abs(ct-arrHour)<=Math.abs(bt-arrHour)?cur:best;
      });
      wcode=_wttrToWmo(parseInt(h.weatherCode));
      temp=Math.round(parseFloat(h.tempC));
      precip=parseInt(h.chanceofrain??0);
    }else{
      const noon=dayData.hourly?.[4]??dayData.hourly?.[0];
      if(noon) wcode=_wttrToWmo(parseInt(noon.weatherCode));
      if(dayData.hourly?.length)
        precip=Math.max(...dayData.hourly.map(h=>parseInt(h.chanceofrain??0)));
    }
    return{wcode,temp,tmax:isNaN(tmax)?null:tmax,tmin:isNaN(tmin)?null:tmin,precip,time:Date.now()};
  }catch(e){clearTimeout(t);return null;}
}

/* ── 予報フェッチ（Open-Meteoはレート制限なし） ── */
export async function _fetchForecast(stop,lat,lon,date){
  // 到着時刻がある場合はその時刻のhourly天気を取得。時刻なしは正午(12時)で代用し、
  // 「該当日の正午あたりの気温」を常に出す（最高/最低だけでなく現在気温も揃える）。
  const arrTime=stop.arr||stop.dep||null; // "HH:MM" or null
  const arrHour=arrTime?parseInt(arrTime.split(':')[0]):12; // 時刻なしは正午で代用
  const useHourly=true; // 常にhourlyを取得して気温を出す
  const fk=`${lat.toFixed(2)},${lon.toFixed(2)}_${date}_h${arrHour}`;
  if(fcastCache[fk]&&Date.now()-fcastCache[fk].time<2*60*60*1000){
    if(_stopStillValid(stop)) wxStopRes[stop.id]={...fcastCache[fk],date};
    return;
  }
  const doReq=async(model)=>{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),8000);
    let u;
    if(useHourly){
      u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        +`&hourly=weather_code,temperature_2m,precipitation_probability`
        +`&daily=temperature_2m_max,temperature_2m_min`
        +`&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`
        +(model?`&models=${model}`:'');
    }else{
      u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
        +`&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`
        +(model?`&models=${model}`:'');
    }
    const r=await fetch(u,{signal:ctrl.signal,mode:'cors',credentials:'omit'});
    clearTimeout(t);if(!r.ok)throw new Error(r.status);return r.json();
  };
  // wttr.in フォールバック呼び出し用ヘルパー（1リクエスト保証）
  let _wttrPromise=null;
  const callWttr=()=>(_wttrPromise||(_wttrPromise=_fetchWttr(lat,lon,date,arrHour)));
  try{
    // Open-Meteo 2系統を並列実行（wttr.in は失敗時のみ呼ぶ）
    const [rJma,rBm]=await Promise.allSettled([doReq('jma_seamless'),doReq('')]);
    const j=rJma.status==='fulfilled'?rJma.value:(rBm.status==='fulfilled'?rBm.value:null);
    if(!j){
      // Open-Meteo 両系統失敗 → ここで初めて wttr.in を呼ぶ
      const wr=await callWttr();
      if(wr){fcastCache[fk]=wr;_saveFcastCache();if(_stopStillValid(stop))wxStopRes[stop.id]={...wr,date};}
      else if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};
      return;
    }
    let res;
    if(useHourly){
      const h=j?.hourly;
      const d=j?.daily;
      if(h?.time?.length){
        // arrHour に最も近いインデックスを探す
        const idx=h.time.findIndex(t=>parseInt(t.split('T')[1])>=arrHour);
        const i=idx>=0?idx:h.time.length-1;
        let precip=h.precipitation_probability?.[i];
        if(precip===null||precip===undefined){
          const jBm=rBm.status==='fulfilled'?rBm.value:null;
          precip=jBm?.hourly?.precipitation_probability?.[i]??null;
        }
        // 気温・天気コードが該当時刻でnullの場合がある（JMAモデル等）→ BoM系へフォールバック
        const jBm2=rBm.status==='fulfilled'?rBm.value:null;
        let tRaw=h.temperature_2m?.[i];
        if(tRaw==null) tRaw=jBm2?.hourly?.temperature_2m?.[i];
        let wRaw=h.weather_code?.[i];
        if(wRaw==null) wRaw=jBm2?.hourly?.weather_code?.[i];
        res={
          wcode:wRaw??null,
          temp:tRaw!=null?Math.round(tRaw):null,          // 到着時刻の気温（null時は0°と誤表示しない）
          tmax:d?.temperature_2m_max?.[0]??null,
          tmin:d?.temperature_2m_min?.[0]??null,
          precip,
          hourly:true,
          arrHour,
          time:Date.now()
        };
      }
    }else{
      const d=j?.daily;
      const dBm=rBm.status==='fulfilled'?rBm.value?.daily:null; // 副モデル(BoM系)フォールバック用
      if(d?.time?.length){
        // 各フィールドを「主モデル→副モデル→null」でオプショナルに取得。
        // JMA等が daily の一部フィールド(precip等)を返さない場合に添字直アクセスでthrowし、
        // 取得済みのOpen-Meteoデータを捨ててwttrへ落ちる不具合を防ぐ（hourly分岐と同じ防御）。
        let precip=d.precipitation_probability_max?.[0];
        if(precip==null) precip=dBm?.precipitation_probability_max?.[0]??null;
        let wcode=d.weather_code?.[0];
        if(wcode==null) wcode=dBm?.weather_code?.[0];
        let tmax=d.temperature_2m_max?.[0];
        if(tmax==null) tmax=dBm?.temperature_2m_max?.[0];
        let tmin=d.temperature_2m_min?.[0];
        if(tmin==null) tmin=dBm?.temperature_2m_min?.[0];
        res={wcode:wcode??null,tmax:tmax??null,tmin:tmin??null,precip,time:Date.now()};
      }
    }
    if(res){fcastCache[fk]=res;_saveFcastCache();if(_stopStillValid(stop))wxStopRes[stop.id]={...res,date};}
    else{if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};}
  }catch(e){
    // Open-Meteo 例外 → wttr.in フォールバック（既に呼ばれていれば結果を再利用）
    const wr=await callWttr();
    if(wr){fcastCache[fk]=wr;_saveFcastCache();if(_stopStillValid(stop))wxStopRes[stop.id]={...wr,date};}
    else if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};
  }
}

/* ── ジオコーディング（国土地理院GSIを使用。Nominatimは現在未使用＝下のフォールバックを外したため） ── */
export async function _geocodeGSI(q){
  // 国土地理院 住所検索API（日本住所専用・CORS完全対応・APIキー不要）
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      {signal:ctrl.signal}
    );
    clearTimeout(t);
    if(r.ok){
      const j=await r.json();
      if(j&&j.length>0){
        // GeoJSON形式: coordinates[0]=lon, coordinates[1]=lat
        const lon=parseFloat(j[0].geometry.coordinates[0]);
        const lat=parseFloat(j[0].geometry.coordinates[1]);
        if(!isNaN(lat)&&!isNaN(lon)) return {lat,lon};
      }
    }
  }catch(e){clearTimeout(t);}
  return null;
}
// ※現在は未使用（_geocodeParallel から呼んでいない）。公開ポリシー対策でGSIのみ運用中。
//   個人利用で精度を上げたい場合は _geocodeParallel のコメントを参照して復活できる。
export async function _geocodeNominatim(q){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=jp&accept-language=ja`,
      {signal:ctrl.signal,credentials:'omit'}
    );
    clearTimeout(t);
    if(r.ok){
      const j=await r.json();
      if(j&&j.length>0) return {lat:parseFloat(j[0].lat),lon:parseFloat(j[0].lon)};
    }
  }catch(e){clearTimeout(t);}
  return null;
}

/* ══ 地点名クリーニング → 複数ジオクエリ候補を生成 ══ */
export function buildNameTargets(name){
  // 絵文字・記号除去
  const emojiRe=/(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\u2B50\u231A-\u231B\u23E9-\u23F3\u23F8-\u23FA\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2614-\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA-\u26AB\u26BD-\u26BE\u26C4-\u26C5\u26CE\u26D4\u26EA\u26F2-\u26F3\u26F5\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B55\u3030\u303D\u3297\u3299])/g;
  const clean=name.replace(emojiRe,"").replace(/[\u2605\u2606\u25CE\u25CB\u25CF\u25C6\u25C7\u25A0\u25A1\u25B2\u25B3\u25BC\u25BD]/g,"").trim();
  // 括弧内テキストを抽出
  const parenMatch=clean.match(/[\uff08(]([^\uff09)]+)[\uff09)]/);
  const parenContent=parenMatch?parenMatch[1].trim():"";
  const mainName=clean.replace(/[\uff08(][^\uff09)]*[\uff09)]/g,"").trim();
  // 括弧内が注記（休憩・給油・仮眠など）なら地名候補にしない
  const NOTES=["\u4f11\u61a9","\u7d66\u6cb9","\u4eee\u7720","\u98df\u4e8b","\u6ce8\u610f","\u78ba\u8a8d","\u51fa\u767a","\u5230\u7740"];
  const parenIsNote=NOTES.some(function(w){return parenContent.indexOf(w)>=0;});
  const targets=[];
  if(mainName.length>=2) targets.push(mainName);
  if(parenContent&&!parenIsNote&&parenContent.length>=2) targets.push(parenContent);
  return targets.length?targets:[clean];
}

/* ══ 1地点フェッチ（geocoding + forecast） ══ */
// 地点オブジェクトが編集/削除されていないかチェック（saveStopが ds[idx]={...} で新オブジェクトに差し替えるため、参照同一性で判定可能）
export function _stopStillValid(stop){
  for(const d of data.days){
    for(const s of d.stops){
      if(s===stop) return true;
    }
  }
  return false;
}
/* ── ジオコーディング（国土地理院GSIのみ使用）──
   公開時にNominatim公開APIの「アプリ全体で合計1req/秒」制限へ抵触するのを避けるため、
   フォールバックのNominatimは外し、住所モード・名前モードともGSIだけを使う。
   GSIは日本の住所・地名（駅名/主要施設名の一部含む）に対応し、CORS対応・APIキー不要で、
   各ユーザーのIPから分散アクセスになるため公開しても上流に優しい。
   ※関数名は呼び出し側の互換のため _geocodeParallel のまま（現在は並列実行しない）。
   ※Nominatimを復活させたい場合（個人利用限定を推奨）は下のコメント参照。 */
export async function _geocodeParallel(q){
  return _geocodeGSI(q);
  // ▼ Nominatimフォールバックを併用する場合（公開時は規約に注意）:
  //   const c=await _geocodeGSI(q);
  //   return c||_geocodeNominatim(q);
}

export async function doFetchStop(stop,date){
  // 既に編集（別オブジェクトに差し替え）/削除された地点はネットワーク取得しない（無駄なジオコーディング・予報フェッチ防止）
  if(!_stopStillValid(stop)) return;
  const addr=(stop.addr||"").trim();
  const name=(stop.name||"").trim();
  const geoPt=hasGeo(stop)?{lat:stop.geo.lat,lon:stop.geo.lon}:null; // 実座標を最優先
  if(!geoPt&&!addr&&!name){if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};return;}
  // 今日の日付（diff計算の基準）
  const todayStr=_isoToday();
  const diff=Math.round((new Date(date+"T12:00:00")-new Date(todayStr+"T12:00:00"))/86400000);
  if(diff<0){if(_stopStillValid(stop))wxStopRes[stop.id]={isPast:true,date,time:Date.now()};return;}     // 過去日付は取得しない
  if(diff>15){if(_stopStillValid(stop))wxStopRes[stop.id]={outOfRange:true,date,time:Date.now()};return;} // 16日先以降は予報期間外
  // 座標解決: 実座標があれば即採用（ジオコーディング不要）。無ければ住所→名前でジオコーディング。
  let lat=null,lon=null;
  if(geoPt){
    lat=geoPt.lat;lon=geoPt.lon;
  }else{
    const geoTargets=addr?buildGeoTargets(addr):buildNameTargets(name);
    for(const q of geoTargets){
      const cached=_geoCacheGet(q);
      if(cached){lat=cached.lat;lon=cached.lon;break;}
      const coords=await _geocodeParallel(q);
      if(coords){lat=coords.lat;lon=coords.lon;_geoCacheSet(q,lat,lon);break;}
    }
  }
  if(lat===null){if(_stopStillValid(stop)){wxStopRes[stop.id]={error:true,date,time:Date.now()};_dbgLog('wx_geocode_failed',{id:stop.id,q:(addr||name||'').slice(0,40)});}return;}
  await _fetchForecast(stop,lat,lon,date);
  // 予報取得が失敗（全プロバイダ不通）した場合は追跡用に記録
  if(wxStopRes[stop.id]&&wxStopRes[stop.id].error) _dbgLog('wx_forecast_failed',{id:stop.id});
}

/* ══ キュー処理（fast:全並列 / slow:1件直列・600msウェイト） ══ */
export async function runWxQueue(){
  if(wxQueueRunning)return;
  wxQueueRunning=true;
  const myGen=wxGen; // このループの世代を記録。refreshAllWeatherで世代が進んだら離脱
  try{
    while(wxQueueFast.length||wxQueue.length){
      if(myGen!==wxGen) return; // 世代が進んだ → このループは破棄（新ループに引き継ぐ）
      // fastキュー：坐標キャッシュ済み→全件並列（Open-Meteoのみのでレート制限なし）
      if(wxQueueFast.length){
        const batch=wxQueueFast.splice(0);
        await Promise.allSettled(batch.map(item=>
          doFetchStop(item.stop,item.date)
            .catch(()=>{wxStopRes[item.stop.id]={error:true,date:item.date,time:Date.now()};})
            .then(()=>{if(myGen===wxGen)onStopWxReady(item.stop.id);})
        ));
        if(myGen!==wxGen) return; // await後も世代を確認
      }
      // slowキュー：ジオコーディング(GSI)必要→1件直列＋間隔。
      //   間隔値と根拠は 00-constants.js の WX_GEOCODE_INTERVAL_MS を参照（調整はそこで一元管理）。
      if(wxQueue.length){
        const item=wxQueue.shift();
        try{await doFetchStop(item.stop,item.date);}
        catch(e){wxStopRes[item.stop.id]={error:true,date:item.date,time:Date.now()};}
        if(myGen!==wxGen) return; // await後も世代を確認（古い結果のDOM反映を防ぐ）
        onStopWxReady(item.stop.id);
        if(wxQueue.length||wxQueueFast.length) await new Promise(r=>setTimeout(r,WX_GEOCODE_INTERVAL_MS));
      }
    }
  }finally{
    wxQueueRunning=false;
    // 世代交代等でキューに未処理が残っていれば新ループを起動（並行実行は起きない：runningで排他）
    if(wxQueueFast.length||wxQueue.length){runWxQueue();return;}
    // finally後もloadingが残っていれば即再投入
    data.days.forEach((day,di)=>{
      const date=day.date||_isoToday(di);
      day.stops.forEach(s=>{if(wxStopRes[s.id]==='loading'){delete wxStopRes[s.id];wxQueueIds.delete(s.id);enqueueStop(s,date);}});
    });
  }
}

export const wxQueueIds=new Set(); // O(1)重複チェック用
export function enqueueStop(stop,date,priority){
  // 住所または実座標がある地点のみ天気取得（どちらも無ければ表示しないため取得もしない）
  if(!(stop.addr||'').trim()&&!hasGeo(stop)) return;
  const r=wxStopRes[stop.id];
  const STALE=2*60*60*1000;
  const ERROR_COOLDOWN=60*1000; // エラー後の自動再試行クールダウン（毎renderでの再取得連打を防ぐ）
  // 有効結果（同日付・エラーなし・期間内・2時間以内）なら再取得しない。
  // ※precip:null（降水確率を提供しないモデル/地点）でも天気・気温は有効なため再取得しない（30分refreshで再試行）
  if(r&&r!=='loading'&&r.date===date&&!r.error&&!r.outOfRange&&!r.isPast&&Date.now()-r.time<STALE) return;
  if(r&&r!=='loading'&&r.outOfRange&&r.date===date) return; // outOfRange は再取得不要
  if(r&&r!=='loading'&&r.isPast&&r.date===date) return; // 過去日付は再取得不要
  // エラー結果はクールダウン中の再キューを抑制（renderのたびにネットワーク再試行を連打しないため）。
  // 手動再取得(retryStopWeather)・30分refreshはwxStopResを消すため、ここに該当せず即時再試行できる。
  // クールダウン経過後は通過してloadingに上書きされ、自動でもう一度試行される。
  if(r&&r!=='loading'&&r.error&&r.date===date&&Date.now()-r.time<ERROR_COOLDOWN) return;
  if(r==='loading') return;
  if(wxQueueIds.has(stop.id)) return;
  wxStopRes[stop.id]='loading';
  _showLoadingDom(stop.id);
  wxQueueIds.add(stop.id);
  // 座標キャッシュ確認。実座標(geo)を持つ地点はジオコーディング不要なので即fast。
  const hasCached=hasGeo(stop)||hasCachedCoords(stop.addr);
  // priority=true（走行画面の現在地/次地点）はキュー先頭へ挿入して最優先処理する
  if(hasCached){priority?wxQueueFast.unshift({stop,date}):wxQueueFast.push({stop,date});}
  else{priority?wxQueue.unshift({stop,date}):wxQueue.push({stop,date});}
  runWxQueue();
}

export function _isoToday(offset=0){
  const d=new Date();d.setDate(d.getDate()+offset);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
export function ensureDayWeather(dayIdx){
  const day=data.days[dayIdx];
  if(!day||!day.stops.length) return;
  const date=day.date||_isoToday(dayIdx); // 日付未設定なら今日+N日
  day.stops.forEach(s=>enqueueStop(s,date));
}

export function ensureAllWeather(){
  data.days.forEach((_,i)=>ensureDayWeather(i));
}

export function refreshAllWeather(){
  wxGen++; // 世代を進めて実行中ループを無効化（強制終了させず自然離脱させる）
  Object.keys(fcastCache).forEach(k=>delete fcastCache[k]);
  try{sessionStorage.removeItem(FCST_SK);}catch(e){}
  Object.keys(wxStopRes).forEach(k=>delete wxStopRes[k]);
  wxQueueIds.clear();wxQueue.length=0;wxQueueFast.length=0;
  // wxQueueRunning は触らない（古いループが世代チェックで離脱し、finallyで新ループを再起動する）
  if(S.isRide) ensureAllWeather(); else ensureDayWeather(S.currentDay);
}

// 30分ごと自動更新（非表示タブでは実行しない＝バックグラウンド通信を避ける）
setInterval(()=>{if(!document.hidden) refreshAllWeather();},30*60*1000);
// タブ復帰時更新（時計も即時に最新へ）
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) return;
  if(typeof updateClock==='function') updateClock();
  S.isRide?ensureAllWeather():ensureDayWeather(S.currentDay);
});
