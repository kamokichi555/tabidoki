/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 14-gps.js
   GPS自動追跡（走行モードで現在地に近い地点へ自動切替）
   依存: 00-constants.js, 02-utils.js（buildGeoTargets/_geoCacheGet）,
        04-weather.js（_geocodeParallel/_geoCacheSet）,
        05-stop.js（setCurrentStop）, 06-day.js（currentDayFlat/_getCdi）
   実行時依存: data, S.isRide, S.manualCurrentId, S.rideViewIdx, S.currentDay,
              renderRide, showInfoToast, _dbgLog
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { LSK } from './00-constants.js';
import { S, data } from './01-state.js';
import { buildGeoTargets, hasGeo } from './02-utils.js';
import { _geoCacheGet, _isoToday, enqueueStop } from './04-weather.js';
import { setCurrentStop } from './05-stop.js';
import { currentDayFlat } from './06-day.js';
import { showInfoToast } from './07-render.js';
import { _dbgLog } from './12-debug.js';
/* ══ GPS状態変数 ══ */
export let _gpsEnabled=false;          // GPS自動追跡 ON/OFF（ユーザー設定）
export let _gpsWatchId=null;           // watchPositionの監視ID
export let _gpsManualOverride=false;   // 手動で現在地設定後の自動切替抑制フラグ
export let _gpsManualOverrideTimer=null;
export let _gpsViewLock=false;         // 手動スワイプ後の表示位置固定フラグ
export let _gpsViewLockTimer=null;
export let _gpsLastPos=null;           // 直近のGPS座標 {lat,lon,acc,ts}
export let _gpsStale=false;            // 一定時間 新しい位置が来ていない（トンネル等）
let _gpsStaleTimer=null;               // 鮮度タイマー
let _gpsLastProcessTs=0;               // 重い処理を最後に実行した時刻（間引き用）
let _gpsLastFixTs=0;                   // 直近の測位が届いた時刻（配信間隔ログ用。間引きとは無関係）

/* ══ 調整パラメータ ══ */
export const GPS_MIN_PROCESS_MS=3000;  // 位置処理（距離計算・再描画）の最短間隔（ms）。watchPositionの高頻度発火を間引く
export const GPS_STALE_MS=15000;       // この時間 新しい位置が来なければ「再取得中」表示にする（ms）
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
  if(hasGeo(stop)) return {lat:stop.geo.lat,lon:stop.geo.lon}; // 実座標を最優先（住所のジオコーディングより正確）
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

/* ══ 現在地→次の地点 の残り直線距離を #ride-seg に反映 ══
   「現在地」を表示中(S.rideViewIdx===rci)のときだけ表示する。
   ・残り距離 = GPS現在地→次地点（実測）。GPSが無ければ 現在地点→次地点 の直線にフォールバック。
   ・次地点の座標が無ければ非表示（誤情報を出さない）。
   進捗バー(🏍️)は廃止。区間長・始点に依存せず、常に「今いる場所→次地点」の距離だけを出す。
   renderRide で骨組みを毎回作り直すため、この関数は中身の更新だけを担う（軽い）。*/
export function _gpsUpdateNextDist(){
  const seg=document.getElementById('ride-seg');
  if(!seg) return; // 現在地を表示していない／次地点が無い等で骨組みが無い
  const hide=()=>{seg.style.display='none';};
  if(!S.isRide){hide();return;}
  const flat=currentDayFlat();
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId);
  if(rci===-1||S.rideViewIdx!==rci){hide();return;}           // 現在地を見ているときだけ
  const ns=flat[rci+1];
  if(!ns){hide();return;}                                     // 次の地点がない（最終地点）
  const nc=_gpsStopCoords(ns);
  const cc=_gpsStopCoords(flat[rci]);
  const live=!!(_gpsEnabled&&_gpsLastPos);                    // GPS実測が使えるか

  // 残り距離: GPS実測（現在地→次地点）を優先。無ければ区間直線（現在地点→次地点）にフォールバックし常時表示。
  let remain=null;
  if(live&&nc) remain=_gpsDistance(_gpsLastPos.lat,_gpsLastPos.lon,nc.lat,nc.lon);
  else if(cc&&nc) remain=_gpsDistance(cc.lat,cc.lon,nc.lat,nc.lon);
  if(remain===null){hide();return;}                           // 両地点とも座標が無い→出せない

  // 残り距離テキスト（数値部と単位を分けて流し込む）
  const kmEl=document.getElementById('ride-seg-km');
  const unitEl=document.getElementById('ride-seg-unit');
  let numTxt,unitTxt;
  if(remain<1000){numTxt=String(Math.round(remain/10)*10);unitTxt=' m 先（直線）';}
  else if(remain<10000){numTxt=(remain/1000).toFixed(1);unitTxt=' km 先（直線）';}
  else{numTxt=String(Math.round(remain/1000));unitTxt=' km 先（直線）';}
  if(kmEl) kmEl.textContent=numTxt;
  if(unitEl) unitEl.textContent=unitTxt;

  // 進捗バーは廃止。距離の数字だけを表示する（始点をどう決めるかの問題を回避）。
  seg.classList.toggle('stale',live&&_gpsStale);             // 位置が古い（トンネル等）ときは数字を薄く（実測時のみ）
  seg.style.display='';
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

/* ══ 到着とみなす半径(m) ══
   実座標(geo)を持つ地点はGPS精度＝精密なので固定(GPS_ARRIVE_M)。
   住所のみの地点は町中心に丸められ粗いため、隣接地点までの距離の半分まで広げて
   取りこぼしを防ぎつつ（上限1km）、隣との食い合いを避ける（下限250m）。*/
export function _gpsArriveRadius(flat,idx){
  const stop=flat[idx];
  if(hasGeo(stop)) return GPS_ARRIVE_M;            // 実座標は精密 → 固定300m
  const c=_gpsStopCoords(stop);
  if(!c) return GPS_ARRIVE_M;
  let nb=Infinity;
  for(const j of [idx-1,idx+1]){
    if(j<0||j>=flat.length) continue;
    const cj=_gpsStopCoords(flat[j]);
    if(!cj) continue;
    const d=_gpsDistance(c.lat,c.lon,cj.lat,cj.lon);
    if(d<nb) nb=d;
  }
  if(!Number.isFinite(nb)) return 800;             // 隣に座標がない → 無難な800m
  return Math.max(250,Math.min(1000,nb/2));
}

/* ══ GPS位置更新ハンドラ ══ */
export function _gpsOnPosition(pos){
  if(!S.isRide||!_gpsEnabled) return;
  const lat=pos.coords.latitude,lon=pos.coords.longitude,acc=pos.coords.accuracy;
  _gpsLastPos={lat,lon,acc,ts:Date.now()};
  // 【計測用】測位が届くたびに、前回からの経過ms(dt)と精度(acc)を記録する。
  // watchPositionの実配信間隔を可視化するためのログ。間引き(_gpsLastProcessTs)には影響しない。
  _dbgLog('gps_fix',{dt:_gpsLastFixTs?(_gpsLastPos.ts-_gpsLastFixTs):0,acc:Math.round(acc)});
  _gpsLastFixTs=_gpsLastPos.ts;
  // 新しい位置が来たので「再取得中」を解除し、鮮度タイマーを張り直す
  _gpsStale=false;
  if(_gpsStaleTimer) clearTimeout(_gpsStaleTimer);
  _gpsStaleTimer=setTimeout(()=>{ _gpsStale=true; _gpsStaleTimer=null; _gpsUpdateStatus(); },GPS_STALE_MS);
  _gpsUpdateStatus(); // ステータスは毎回更新（軽い）
  _gpsUpdateNextDist(); // 残り距離を更新（毎回・軽い）
  // 精度が悪すぎる場合は自動切替しない
  if(acc>GPS_ACC_MAX) return;
  // 手動操作直後は抑制
  if(_gpsManualOverride) return;
  // ここから先（全地点との距離計算）が重い。watchPositionの高頻度発火を最短間隔で間引く。
  // 精度不良や手動抑制で上で抜けた場合はスロットを消費しない＝復帰後すぐ判定できる。
  const now=Date.now();
  if(now-_gpsLastProcessTs<GPS_MIN_PROCESS_MS) return;
  _gpsLastProcessTs=now;
  const flat=currentDayFlat();
  if(!flat.length) return;
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId);
  // 現在地より前（通過済み）は候補から除外する。
  // 往復(自宅→…→自宅 等)で出発地点が同座標のとき、出発の自宅を先に拾って
  // 戻りの自宅へ切り替わらない問題を防ぐ。現在地未設定(-1)なら全件から探す。
  const startI=rci===-1?0:rci;
  let nearestIdx=-1,nearestDist=Infinity;
  for(let i=startI;i<flat.length;i++){
    const c=_gpsStopCoords(flat[i]);
    if(!c) continue;
    const d=_gpsDistance(lat,lon,c.lat,c.lon);
    if(d<nearestDist){nearestDist=d;nearestIdx=i;}
  }
  if(nearestIdx===-1) return;        // 座標を持つ地点がない
  if(nearestIdx===rci) return;       // まだ現在地が最寄り＝次へ移動していない
  if(nearestDist>_gpsArriveRadius(flat,nearestIdx)) return; // 到着半径の外
  // 現在地を自動更新（表示ロック中はページを動かさず現在地ピンのみ更新）
  const target=flat[nearestIdx];
  setCurrentStop(target.id,true,_gpsViewLock); // 内部で1回だけrenderRideされる
  showInfoToast(`📍 「${target.name}」に到着（自動）`,3000);
  _dbgLog('gps_auto_switch',{id:target.id,name:target.name,dist:Math.round(nearestDist)});
}

export function _gpsOnError(err){
  _dbgLog('gps_error',{code:err.code,msg:err.message});
  if(err.code===1){ // PERMISSION_DENIED: 許可がないと追跡不能なので止める
    _gpsEnabled=false;
    try{localStorage.setItem(LSK.gps,'0');}catch(e){} // 次回起動で誤ONにしない
    _gpsStop();
    _gpsUpdateBtn();
    showInfoToast('⚠️ 位置情報の許可が必要です',4000);
  }
  // code 2(POSITION_UNAVAILABLE)/3(TIMEOUT) はトンネル等の一時的な失敗。
  // watchPositionが自動でリトライを続けるので追跡は止めない。
  // 鮮度タイマーが時間切れになれば _gpsUpdateStatus が「再取得中」を表示する。
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
  // watchPositionで位置の変化をOS側からイベントで受け取る（高速走行でも取りこぼさない）。
  // maximumAge:0 でキャッシュを使わず常に最新を要求。高頻度発火は _gpsOnPosition 側で間引く。
  const opts={enableHighAccuracy:true,maximumAge:0,timeout:20000};
  _gpsLastProcessTs=0; // 開始直後の最初の位置は即処理させる
  _gpsLastFixTs=0;     // 配信間隔の基準もリセット（前セッションの巨大なdtを出さない）
  _gpsWatchId=navigator.geolocation.watchPosition(_gpsOnPosition,_gpsOnError,opts);
  _gpsUpdateStatus();
}
export function _gpsStop(){
  if(_gpsWatchId!==null){navigator.geolocation.clearWatch(_gpsWatchId);_gpsWatchId=null;}
  if(_gpsStaleTimer){clearTimeout(_gpsStaleTimer);_gpsStaleTimer=null;}
  if(_gpsManualOverrideTimer){clearTimeout(_gpsManualOverrideTimer);_gpsManualOverrideTimer=null;}
  if(_gpsViewLockTimer){clearTimeout(_gpsViewLockTimer);_gpsViewLockTimer=null;}
  _gpsManualOverride=false;_gpsViewLock=false;_gpsLastPos=null;_gpsStale=false;_gpsLastProcessTs=0;_gpsLastFixTs=0;
  _gpsUpdateStatus();
}

/* ══ ユーザーがGPSボタンを押したとき ══ */
export function toggleGps(){
  _gpsEnabled=!_gpsEnabled;
  try{localStorage.setItem(LSK.gps,_gpsEnabled?'1':'0');}catch(e){}
  if(_gpsEnabled){
    if(S.isRide) _gpsStart();
    showInfoToast('📍 GPS自動追跡をオンにしました',2500);
  }else{
    _gpsStop();
    showInfoToast('📍 GPS自動追跡をオフにしました',2500);
  }
  _gpsUpdateBtn();
  _gpsUpdateStatus();
  _gpsUpdateNextDist(); // オン/オフ直後に区間バーを描き直す（オフにしたとき古いバーを残さない）
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
  el.style.display='';
  // アイコン(上)＋文字(下)の縦並びで表示する。icon/label を別spanに分けてCSSで縦積み。
  // 文字列はすべて固定リテラルなのでinnerHTMLでも安全（外部入力なし）。
  const set=(icon,label,cls,title)=>{
    el.className='gps-status'+(cls?' '+cls:'');
    el.title=title;
    el.innerHTML='<span class="gps-ico">'+icon+'</span><span class="gps-txt">'+label+'</span>';
  };
  // オフ時も常時表示（タップでオンにできる）
  if(!_gpsEnabled){set('📡','GPS OFF','off','GPS自動追跡：オフ（タップでオン）');return;}
  // オン・走行前：待機中（走行モードに入ると追跡開始）
  if(!S.isRide){set('📍','GPS ON','ok','GPS自動追跡：オン（走行中に追跡。タップでオフ）');return;}
  // オン・走行中：実測状態
  if(!_gpsLastPos){set('📡','取得中','','GPS取得中（タップでオフ）');return;}
  if(_gpsStale){set('📡','再取得','warn','GPS再取得中（位置が一定時間更新されていません／タップでオフ）');return;} // 一定時間 新位置なし（トンネル等）。直近の現在地は保持
  if(_gpsLastPos.acc>GPS_ACC_MAX){set('⚠️','精度低','warn','GPS精度が低い状態です（タップでオフ）');return;}
  set('📍','追跡中','ok','GPS追跡中（タップでオフ）');
}

/* ══ 初期化（localStorageから設定復元） ══ */
export function _gpsInit(){
  try{_gpsEnabled=localStorage.getItem(LSK.gps)==='1';}catch(e){_gpsEnabled=false;}
  _gpsUpdateBtn();
  _gpsUpdateStatus();
}
