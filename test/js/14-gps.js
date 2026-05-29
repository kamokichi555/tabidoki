/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 14-gps.js
   GPS自動追跡（走行モードで現在地に近い地点へ自動切替）
   依存: 00-constants.js, 02-utils.js（buildGeoTargets/_geoCacheGet）,
        04-weather.js（_geocodeParallel/_geoCacheSet）,
        05-stop.js（setCurrentStop）, 06-day.js（currentDayFlat/_getCdi）
   実行時依存: data, S.isRide, S.manualCurrentId, S.rideViewIdx, S.currentDay,
              renderRide, showInfoToast, _dbgLog
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { S, data } from './01-state.js';
import { buildGeoTargets } from './02-utils.js';
import { _geoCacheGet, _isoToday, enqueueStop } from './04-weather.js';
import { setCurrentStop } from './05-stop.js';
import { currentDayFlat } from './06-day.js';
import { showInfoToast } from './07-render.js';
import { _dbgLog } from './12-debug.js';
/* ══ GPS状態変数 ══ */
export let _gpsEnabled=false;          // GPS自動追跡 ON/OFF（ユーザー設定）
export let _gpsPollTimer=null;         // ポーリング用タイマー
export let _gpsManualOverride=false;   // 手動で現在地設定後の自動切替抑制フラグ
export let _gpsManualOverrideTimer=null;
export let _gpsViewLock=false;         // 手動スワイプ後の表示位置固定フラグ
export let _gpsViewLockTimer=null;
export let _gpsLastPos=null;           // 直近のGPS座標 {lat,lon,acc,ts}

/* ══ 調整パラメータ ══ */
export const GPS_POLL_MS=30000;        // 位置取得間隔（ms）
export const GPS_ARRIVE_M=300;         // 到着とみなす距離（m）
export const GPS_ACC_MAX=100;          // この精度(m)より悪いGPSは自動切替に使わない
export const GPS_MANUAL_LOCK_MS=60000; // 手動現在地設定後の抑制時間（ms）
export const GPS_VIEW_LOCK_MS=30000;   // 手動スワイプ後の表示固定時間（ms）

/* ══ Haversine: 2点間の距離(m) ══ */
export function _gpsDistance(lat1,lon1,lat2,lon2){
  const R=6371000;
  const toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(a)));
}

/* ══ 地点の座標をキャッシュから取得（なければnull） ══ */
export function _gpsStopCoords(stop){
  const addr=(stop.addr||'').trim();
  if(!addr) return null;
  for(const q of buildGeoTargets(addr)){
    const c=_geoCacheGet(q);
    if(c) return {lat:c.lat,lon:c.lon};
  }
  return null;
}

/* ══ 現在日の全地点座標を事前取得 ══
   独自にジオコーディングせず、天気側のレート制限付きキュー(enqueueStop)に委譲する。
   enqueueStop は wxQueueIds で重複を弾くため、ensureDayWeather と二重に投げても安全。
   座標は共有 geoCache に入るので、GPSはそれを参照するだけでよい（Nominatim二重叩き回避）。*/
export function _gpsPrefetchCoords(){
  try{
    const day=data.days[S.currentDay];
    if(!day) return;
    const date=day.date||(typeof _isoToday==='function'?_isoToday(S.currentDay):'');
    (day.stops||[]).forEach(s=>{
      if(!(s.addr||'').trim()) return;       // 住所なしは座標取得できない
      if(_gpsStopCoords(s)) return;          // 既にキャッシュ済み
      if(typeof enqueueStop==='function') enqueueStop(s,date); // 共有キューへ（重複は内部で排除）
    });
  }catch(e){
    _dbgLog('gps_prefetch_failed',{err:String(e&&e.message||e).slice(0,200)});
  }
}

/* ══ 残り距離フォーマット ══ */
export function _gpsFmtDist(m){
  if(m<1000) return Math.round(m/10)*10+' m';      // 1km未満は10m刻み
  if(m<10000) return (m/1000).toFixed(1)+' km';     // 10km未満は0.1km刻み
  return Math.round(m/1000)+' km';                  // それ以上は1km刻み
}

/* ══ 現在地→次の地点 の残り直線距離をカードに反映 ══
   「現在地」を表示中(S.rideViewIdx===rci)のときだけ、その次の地点までの距離を出す。
   GPS位置・座標キャッシュのどちらかが欠ければ空表示（誤情報を出さない）。*/
export function _gpsUpdateNextDist(){
  const el=document.getElementById('ride-next-dist');
  if(!el) return;
  if(!S.isRide||!_gpsEnabled||!_gpsLastPos){el.textContent='';return;}
  const flat=currentDayFlat();
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId);
  if(rci===-1||S.rideViewIdx!==rci){el.textContent='';return;} // 現在地を見ているときだけ
  const ns=flat[rci+1];
  if(!ns){el.textContent='';return;}                          // 次の地点がない（最終地点）
  const c=_gpsStopCoords(ns);
  if(!c){el.textContent='';return;}                           // 次地点の座標が未取得
  const m=_gpsDistance(_gpsLastPos.lat,_gpsLastPos.lon,c.lat,c.lon);
  el.textContent=`あと ${_gpsFmtDist(m)}（直線）`;
}


export function _gpsNotifyManualSet(){
  if(!_gpsEnabled) return;
  _gpsManualOverride=true;
  if(_gpsManualOverrideTimer) clearTimeout(_gpsManualOverrideTimer);
  _gpsManualOverrideTimer=setTimeout(()=>{
    _gpsManualOverride=false;_gpsManualOverrideTimer=null;
  },GPS_MANUAL_LOCK_MS);
}

/* ══ 手動スワイプが呼ばれたとき（07-render.jsから通知） ══ */
export function _gpsNotifySwipe(){
  if(!_gpsEnabled) return;
  _gpsViewLock=true;
  if(_gpsViewLockTimer) clearTimeout(_gpsViewLockTimer);
  _gpsViewLockTimer=setTimeout(()=>{
    _gpsViewLock=false;_gpsViewLockTimer=null;
  },GPS_VIEW_LOCK_MS);
}

/* ══ GPS位置更新ハンドラ ══ */
export function _gpsOnPosition(pos){
  if(!S.isRide||!_gpsEnabled) return;
  const lat=pos.coords.latitude,lon=pos.coords.longitude,acc=pos.coords.accuracy;
  _gpsLastPos={lat,lon,acc,ts:Date.now()};
  _gpsUpdateStatus();
  _gpsUpdateNextDist(); // 残り距離を更新（毎ポーリング）
  // 精度が悪すぎる場合は自動切替しない
  if(acc>GPS_ACC_MAX) return;
  // 手動操作直後は抑制
  if(_gpsManualOverride) return;
  const flat=currentDayFlat();
  if(!flat.length) return;
  // 最も近い地点を探す（座標が取れる地点のみ）
  let nearestIdx=-1,nearestDist=Infinity;
  for(let i=0;i<flat.length;i++){
    const c=_gpsStopCoords(flat[i]);
    if(!c) continue;
    const d=_gpsDistance(lat,lon,c.lat,c.lon);
    if(d<nearestDist){nearestDist=d;nearestIdx=i;}
  }
  if(nearestIdx===-1) return; // 座標を持つ地点がない
  if(nearestDist>GPS_ARRIVE_M) return; // どの地点にも近づいていない
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId);
  // 「前」の地点には戻らない（既に通過した地点へ自動で戻さない）
  if(rci!==-1&&nearestIdx<rci) return;
  if(nearestIdx===rci) return; // 既に現在地
  // 現在地を自動更新（表示ロック中はページを動かさず現在地ピンのみ更新）
  const target=flat[nearestIdx];
  setCurrentStop(target.id,true,_gpsViewLock); // 内部で1回だけrenderRideされる
  showInfoToast(`📍 「${target.name}」に到着（自動）`,3000);
  _dbgLog('gps_auto_switch',{id:target.id,name:target.name,dist:Math.round(nearestDist)});
}

export function _gpsOnError(err){
  _dbgLog('gps_error',{code:err.code,msg:err.message});
  if(err.code===1){ // PERMISSION_DENIED
    _gpsEnabled=false;
    try{localStorage.setItem('touring_gps','0');}catch(e){} // 次回起動で誤ONにしない
    _gpsStop();
    _gpsUpdateBtn();
    showInfoToast('⚠️ 位置情報の許可が必要です',4000);
  }
  _gpsUpdateStatus();
}

/* ══ GPS監視 開始 / 停止 ══ */
export function _gpsStart(){
  if(!('geolocation' in navigator)){
    showInfoToast('⚠️ この端末はGPS非対応です',4000);
    _gpsEnabled=false;_gpsUpdateBtn();
    return;
  }
  _gpsStop(); // 二重起動防止: 既存の監視/タイマーを必ず止めてから開始する
  _gpsPrefetchCoords();
  // 30秒ごとのポーリング（バッテリー節約）
  const opts={enableHighAccuracy:true,maximumAge:15000,timeout:20000};
  const poll=()=>{
    navigator.geolocation.getCurrentPosition(_gpsOnPosition,_gpsOnError,opts);
  };
  poll(); // 即時1回
  _gpsPollTimer=setInterval(poll,GPS_POLL_MS);
  _gpsUpdateStatus();
}
export function _gpsStop(){
  if(_gpsPollTimer){clearInterval(_gpsPollTimer);_gpsPollTimer=null;}
  if(_gpsManualOverrideTimer){clearTimeout(_gpsManualOverrideTimer);_gpsManualOverrideTimer=null;}
  if(_gpsViewLockTimer){clearTimeout(_gpsViewLockTimer);_gpsViewLockTimer=null;}
  _gpsManualOverride=false;_gpsViewLock=false;_gpsLastPos=null;
  _gpsUpdateStatus();
}

/* ══ ユーザーがGPSボタンを押したとき ══ */
export function toggleGps(){
  _gpsEnabled=!_gpsEnabled;
  try{localStorage.setItem('touring_gps',_gpsEnabled?'1':'0');}catch(e){}
  if(_gpsEnabled){
    if(S.isRide) _gpsStart();
    showInfoToast('📍 GPS自動追跡をオンにしました',2500);
  }else{
    _gpsStop();
    showInfoToast('📍 GPS自動追跡をオフにしました',2500);
  }
  _gpsUpdateBtn();
  _gpsUpdateStatus();
}

/* ══ 走行モード開始/終了から呼ばれる ══ */
export function _gpsOnRideStart(){
  if(_gpsEnabled) _gpsStart();
}
export function _gpsOnRideEnd(){
  _gpsStop();
}

/* ══ UI更新 ══ */
export function _gpsUpdateBtn(){
  const btn=document.getElementById('gps-btn');
  if(btn) btn.classList.toggle('on',_gpsEnabled);
}
export function _gpsUpdateStatus(){
  const el=document.getElementById('gps-status');
  if(!el) return;
  if(!S.isRide||!_gpsEnabled){el.style.display='none';return;}
  el.style.display='';
  if(!_gpsLastPos){el.textContent='📡 GPS取得中';el.className='gps-status';return;}
  if(_gpsLastPos.acc>GPS_ACC_MAX){el.textContent='⚠️ GPS精度低';el.className='gps-status warn';return;}
  el.textContent='📍 GPS追跡中';el.className='gps-status ok';
}

/* ══ 初期化（localStorageから設定復元） ══ */
export function _gpsInit(){
  try{_gpsEnabled=localStorage.getItem('touring_gps')==='1';}catch(e){_gpsEnabled=false;}
  _gpsUpdateBtn();
}
