/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 04-weather.js
   天気取得・ジオコーディング・キュー管理
   依存: 00-constants.js（WMO）, 02-utils.js（esc/pClass/buildGeoTargets等）
   実行時依存: data, currentDay, isRide, render, renderRide, showInfoToast
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ 天気キャッシュ ══
   geoCache   : クエリ文字列 → {lat,lon}  ※localStorageに永続化
   fcastCache : "lat2,lon2_date" → {wcode,tmax,tmin,precip,time}
   wxStopRes  : stopId → result | 'loading' | null
*/
/* ══ localStorage ユーティリティ（容量管理） ══ */
function _lsSetItem(key,val){
  try{
    localStorage.setItem(key,val);
  }catch(e){
    if(e.name==='QuotaExceededError'||e.code===22){
      // 容量超過 → キャッシュ系を優先削除して再試行
      console.warn('[旅刻] localStorage容量超過。キャッシュを削減します');
      try{localStorage.removeItem(GEO_SK);}catch(_){}
      try{localStorage.removeItem('highway_online_v1');}catch(_){}
      try{localStorage.removeItem('michi_online_v2');}catch(_){}
      try{localStorage.setItem(key,val);}catch(e2){
        console.error('[旅刻] localStorage保存失敗（容量不足）:',key);
        if(key===SK) showInfoToast('⚠️ ストレージ容量不足のため自動保存できません',4000);
      }
    }else if(e instanceof DOMException){
      // プライベートモード等でアクセス不可の場合
      console.warn('[旅刻] localStorage利用不可:',e.name,key);
      if(key===SK) showInfoToast('⚠️ このブラウザではデータを自動保存できません（JSONで手動保存してください）',5000);
    }
  }
}

const GEO_SK='touring_geo';
const GEO_MAX=80; // LRU上限
const geoCache=(()=>{try{return JSON.parse(localStorage.getItem(GEO_SK))||{};}catch(e){return{};}})();
function _geoCacheGet(q){const e=geoCache[q];if(!e)return null;e.ts=Date.now();return e;}
function _geoCacheSet(q,lat,lon){geoCache[q]={lat,lon,ts:Date.now()};_saveGeoCache();}
function _saveGeoCache(){try{
  const keys=Object.keys(geoCache);
  if(keys.length>GEO_MAX){
    // LRU: tsが古い順に削除
    keys.sort((a,b)=>(geoCache[a].ts||0)-(geoCache[b].ts||0))
      .slice(0,keys.length-GEO_MAX).forEach(k=>delete geoCache[k]);
  }
  _lsSetItem(GEO_SK,JSON.stringify(geoCache));
}catch(e){}}
const FCST_SK='touring_fcast';
const fcastCache=(()=>{try{return JSON.parse(sessionStorage.getItem(FCST_SK))||{};}catch(e){return{};}})();
function _saveFcastCache(){try{sessionStorage.setItem(FCST_SK,JSON.stringify(fcastCache));}catch(e){}}
const wxStopRes={};
let wxQueueRunning=false;
const wxQueue=[];
const wxQueueFast=[];
// キューが刺さった場合の自動リセット（30秒ごとに監視）
setInterval(()=>{
  if(wxQueueRunning&&!wxQueue.length&&!wxQueueFast.length) wxQueueRunning=false;
  // loading のまま放置された地点を強制リセットして再投入
  data.days.forEach((day,di)=>{
    const date=day.date||_isoToday(di);
    day.stops.forEach(s=>{
      if(wxStopRes[s.id]==='loading'){delete wxStopRes[s.id];wxQueueIds.delete(s.id);enqueueStop(s,date);}
    });
  });
},30000);




/* ── 地点天気HTML（行程ビュー内バッジ） ── */
/* ── 天気タップ再取得 ── */
function retryStopWeather(stopId){
  const r=wxStopRes[stopId];
  if(r==='loading'||wxQueueIds.has(stopId)){showInfoToast('🌐 取得中です',1500);return;}
  // 対象地点とその日付を取得
  let stop=null,date='';
  for(let di=0;di<data.days.length;di++){
    const s=data.days[di].stops.find(s=>s.id===stopId);
    if(s){stop=s;date=data.days[di].date||_isoToday(di);break;}
  }
  if(!stop){return;}
  if(!(stop.addr||'').trim()&&!(stop.name||'').trim()){showInfoToast('⚠️ 住所がないため取得できません',2000);return;}
  delete wxStopRes[stopId];
  wxQueueIds.delete(stopId);
  enqueueStop(stop,date);
  // 即時 loading 表示
  const el=document.getElementById('wx-'+stopId);
  if(el) el.innerHTML='<div class="stop-wx-loading">🌐 取得中…</div>';
  showInfoToast('🌐 天気を再取得します',2000);
}

function stopWxInner(stopId,hasAddr){
  const r=wxStopRes[stopId];
  if(!r) return hasAddr?'<div class="stop-wx-loading">🌐 取得中…</div>':'';
  if(r==='loading') return hasAddr?'<div class="stop-wx-loading">🌐 取得中…</div>':'';
  if(r.outOfRange) return hasAddr?'<div class="stop-wx-loading" title="予報は16日先まで取得できます">📅 予報期間外</div>':'';
  if(r.error) return hasAddr?`<div class="stop-wx-loading" onclick="retryStopWeather('${stopId}')" style="cursor:pointer" title="タップして再取得">⚠️ 再取得</div>`:'';
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
function rideWxCompact(stopId,hasAddr){
  const r=wxStopRes[stopId];
  if(!hasAddr) return '';
  const _state=(icon,msg)=>`<div class="ride-wx-compact"><div class="cw-row1"><span class="cw-icon">${icon}</span><span class="cw-cond" style="opacity:.5">${msg}</span></div></div>`;
  if(!r||r==='loading') return _state('🌐','取得中…');
  if(r.outOfRange) return _state('📅','予報期間外');
  if(r.error) return `<div class="ride-wx-compact" onclick="retryStopWeather('${stopId}')" style="cursor:pointer"><div class="cw-row1"><span class="cw-icon">⚠️</span><span class="cw-cond" style="opacity:.5">再取得</span></div></div>`;
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

/* ── 取得完了後 DOM部分更新 ── */
function onStopWxReady(stopId){
  wxQueueIds.delete(stopId);
  const el=document.getElementById('wx-'+stopId);
  if(el){
    let hasAddr=false;
    outer:for(const day of data.days){for(const s of day.stops){if(s.id===stopId){hasAddr=!!(s.addr);break outer;}}}
    el.innerHTML=stopWxInner(stopId,hasAddr);
  }
  if(isRide){
    const flat=currentDayFlat();
    const vs=flat[rideViewIdx],ns=flat[rideViewIdx+1];
    // 案B: rideWxCompactはIDラッパーなし → 現在地・次地点どちらの天気更新もrenderRideで再描画
    if((vs&&vs.id===stopId)||(ns&&ns.id===stopId)) renderRide();
  }
}
/* ── 取得開始時に即座にDOM更新（loading表示） ── */
function _showLoadingDom(stopId){
  const el=document.getElementById('wx-'+stopId);
  if(!el) return;
  // addrがある地点のみloading表示（住所なしは取得しても表示しない）
  let hasAddr=false;
  outer:for(const day of data.days){for(const s of day.stops){if(s.id===stopId){hasAddr=!!(s.addr);break outer;}}}
  if(hasAddr) el.innerHTML='<div class="stop-wx-loading">🌐 取得中…</div>';
}

/* ── wttr.in コード → WMO近似変換 ── */
function _wttrToWmo(c){
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
async function _fetchWttr(lat,lon,date,arrHour){
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
async function _fetchForecast(stop,lat,lon,date){
  // 到着時刻がある場合はhourlyで時間帯の天気を取得（なければ出発時刻で代替）
  const arrTime=stop.arr||stop.dep||null; // "HH:MM" or null
  const arrHour=arrTime?parseInt(arrTime.split(':')[0]):null;
  const useHourly=arrHour!==null;
  const fk=`${lat.toFixed(2)},${lon.toFixed(2)}_${date}${useHourly?'_h'+arrHour:''}`;
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
        res={
          wcode:h.weather_code[i],
          temp:Math.round(h.temperature_2m[i]),          // 到着時刻の気温
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
      if(d?.time?.length){
        let precip=d.precipitation_probability_max[0];
        if((precip===null||precip===undefined)&&rBm.status==='fulfilled'){
          precip=rBm.value?.daily?.precipitation_probability_max?.[0]??precip;
        }
        res={wcode:d.weather_code[0],tmax:d.temperature_2m_max[0],tmin:d.temperature_2m_min[0],precip,time:Date.now()};
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

/* ── ジオコーディング（国土地理院→Nominatim フォールバック） ── */
async function _geocodeGSI(q){
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
async function _geocodeNominatim(q){
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
function buildNameTargets(name){
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
function _stopStillValid(stop){
  for(const d of data.days){
    for(const s of d.stops){
      if(s===stop) return true;
    }
  }
  return false;
}
/* ── 並列ジオコーディング（GSI + Nominatim を同時実行・先勝ち） ── */
async function _geocodeParallel(q,useAddrMode){
  if(useAddrMode){
    // 住所モード: GSI優先（日本住所に強い）
    // GSIを先に投げ、500ms経過してもまだ返らなければNominatimも並列実行
    // nominatimStarted フラグでNominatimの二重呼び出しを防ぐ
    return new Promise(resolve=>{
      let done=false,nominatimStarted=false;
      const finish=(c)=>{if(!done){done=true;resolve(c);}};
      const startNominatim=()=>{
        if(nominatimStarted||done)return;
        nominatimStarted=true;
        _geocodeNominatim(q).then(finish).catch(()=>finish(null));
      };
      const gsiP=_geocodeGSI(q);
      gsiP.then(c=>{if(c)finish(c);else startNominatim();}).catch(()=>startNominatim());
      // 500ms経ってもGSIが返らなければNominatimも並列起動
      setTimeout(startNominatim,500);
    });
  }else{
    // 名前モード: Nominatim優先（POI・施設名に強い）→ 失敗時GSI
    const c=await _geocodeNominatim(q);
    return c||_geocodeGSI(q);
  }
}

async function doFetchStop(stop,date){
  const addr=(stop.addr||"").trim();
  const name=(stop.name||"").trim();
  if(!addr&&!name){if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};return;}
  const todayStr=(d=>{return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})(new Date());
  const diff=Math.round((new Date(date+"T12:00:00")-new Date(todayStr+"T12:00:00"))/86400000);
  if(diff>15){if(_stopStillValid(stop))wxStopRes[stop.id]={outOfRange:true,date,time:Date.now()};return;}
  // 過去日付は今日の天気を代わりに取得
  const forecastDate=diff<0?todayStr:date;
  // addrあり→住所クリーニング(GSI優先)、なし→名前クリーニング(Nominatim優先)
  const geoTargets=addr?buildGeoTargets(addr):buildNameTargets(name);
  const useAddrMode=!!addr;
  let lat=null,lon=null;
  for(const q of geoTargets){
    const cached=_geoCacheGet(q);
    if(cached){lat=cached.lat;lon=cached.lon;break;}
    const coords=await _geocodeParallel(q,useAddrMode);
    if(coords){lat=coords.lat;lon=coords.lon;_geoCacheSet(q,lat,lon);break;}
  }
  if(!lat){if(_stopStillValid(stop))wxStopRes[stop.id]={error:true,date,time:Date.now()};return;}
  await _fetchForecast(stop,lat,lon,forecastDate);
}

/* ══ キュー処理（fast:全並列 / slow:1件直列・600msウェイト） ══ */
async function runWxQueue(){
  if(wxQueueRunning)return;
  wxQueueRunning=true;
  try{
    while(wxQueueFast.length||wxQueue.length){
      // fastキュー：坐標キャッシュ済み→全件並列（Open-Meteoのみのでレート制限なし）
      if(wxQueueFast.length){
        const batch=wxQueueFast.splice(0);
        await Promise.allSettled(batch.map(item=>
          doFetchStop(item.stop,item.date)
            .catch(()=>{wxStopRes[item.stop.id]={error:true,date:item.date,time:Date.now()};})
            .then(()=>onStopWxReady(item.stop.id))
        ));
      }
      // slowキュー：ジオコーディング必要→1件直列（Nominatim 1リクエスト/秒制限を守る）
      if(wxQueue.length){
        const item=wxQueue.shift();
        try{await doFetchStop(item.stop,item.date);}
        catch(e){wxStopRes[item.stop.id]={error:true,date:item.date,time:Date.now()};}
        onStopWxReady(item.stop.id);
        if(wxQueue.length||wxQueueFast.length) await new Promise(r=>setTimeout(r,600));
      }
    }
  }finally{
    wxQueueRunning=false;
    // finally後もloadingが残っていれば即再投入
    data.days.forEach((day,di)=>{
      const date=day.date||_isoToday(di);
      day.stops.forEach(s=>{if(wxStopRes[s.id]==='loading'){delete wxStopRes[s.id];wxQueueIds.delete(s.id);enqueueStop(s,date);}});
    });
  }
}

const wxQueueIds=new Set(); // O(1)重複チェック用
function enqueueStop(stop,date){
  // addrがなくてもnameでジオコーディングできるので両方空の場合だけスキップ
  if(!(stop.addr||'').trim()&&!(stop.name||'').trim()) return;
  const r=wxStopRes[stop.id];
  const STALE=2*60*60*1000;
  if(r&&r!=='loading'&&r.date===date&&!r.error&&!r.outOfRange&&r.precip!=null&&Date.now()-r.time<STALE) return;
  if(r&&r!=='loading'&&r.outOfRange&&r.date===date) return; // outOfRange は再取得不要
  if(r==='loading') return;
  if(wxQueueIds.has(stop.id)) return;
  wxStopRes[stop.id]='loading';
  _showLoadingDom(stop.id);
  wxQueueIds.add(stop.id);
  // キャッシュ確認: addrがあればaddr基準、なければname基準（doFetchStopと同じbuildNameTargetsで揃える）
  const hasCached=stop.addr?hasCachedCoords(stop.addr):buildNameTargets(stop.name||'').some(q=>!!_geoCacheGet(q));
  if(hasCached){wxQueueFast.push({stop,date});}
  else{wxQueue.push({stop,date});}
  runWxQueue();
}

function _isoToday(offset=0){
  const d=new Date();d.setDate(d.getDate()+offset);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function ensureDayWeather(dayIdx){
  const day=data.days[dayIdx];
  if(!day||!day.stops.length) return;
  const date=day.date||_isoToday(dayIdx); // 日付未設定なら今日+N日
  day.stops.forEach(s=>enqueueStop(s,date));
}

function ensureAllWeather(){
  data.days.forEach((_,i)=>ensureDayWeather(i));
}

function refreshAllWeather(){
  Object.keys(fcastCache).forEach(k=>delete fcastCache[k]);
  try{sessionStorage.removeItem(FCST_SK);}catch(e){}
  Object.keys(wxStopRes).forEach(k=>delete wxStopRes[k]);
  wxQueueIds.clear();wxQueue.length=0;wxQueueFast.length=0;wxQueueRunning=false;
  if(isRide) ensureAllWeather(); else ensureDayWeather(currentDay);
}

// 30分ごと自動更新
setInterval(refreshAllWeather,30*60*1000);
// タブ復帰時更新
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden) isRide?ensureAllWeather():ensureDayWeather(currentDay);
});
