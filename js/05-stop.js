/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 05-stop.js
   地点管理（saveStop / delStop / cascadeFrom / sort / getStatus）
   依存: 00-constants.js（EC/LIMIT）, 02-utils.js（sanitize/toMin等）
   実行時依存: data, S.currentDay, S.editingId, wxStopRes, wxQueueIds,
              save, render, syncBorderAddr, showAppError, showInfoToast
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { EC, LIMIT } from './00-constants.js';
import { S, _canEditData, _dom, data } from './01-state.js';
import { fromMin, isTimeOrderOk, isValidTime, parseCoord, extractMapCoord, isShareMapUrl, isDmsCoord, sanitize, toMin } from './02-utils.js';
import { save } from './03-storage.js';
import { wxQueueIds, wxStopRes, enqueueStop, _isoToday } from './04-weather.js';
import { _cachedCdiForId, _invalidateCdi, currentDayIdxOf, syncBorderAddr } from './06-day.js';
import { render, renderRide, showAppError, showInfoToast, showValError } from './07-render.js';
import { setFormAdd } from './08-mode.js';
import { _dbgLog, _dbgSnapshot } from './12-debug.js';
import { _gpsNotifyManualSet } from './14-gps.js';


export function cascadeFrom(di,si,oldDep){
  try{const od=toMin(oldDep),nd=toMin(data.days[di].stops[si].dep);if(od===null||nd===null||od===nd)return;const delta=nd-od;for(let i=si+1;i<data.days[di].stops.length;i++){const s=data.days[di].stops[i];if(s.arr)s.arr=fromMin(toMin(s.arr)+delta);if(s.dep)s.dep=fromMin(toMin(s.dep)+delta);}}
  catch(e){showAppError(EC.CASCADE,e);}
}
export function getStatus(s,idx,ds,cdi){
  if(S.manualCurrentId===null) return idx===0?'current':'upcoming';
  if(cdi===-1) return idx===0?'current':'upcoming';
  // 表示中の日(S.currentDay)が現在地のある日(cdi)より前なら通過済み=past、後なら未到達=upcoming
  if(S.currentDay!==cdi) return S.currentDay<cdi?'past':'upcoming';
  if(s.id===S.manualCurrentId) return 'current';
  const ci=ds.findIndex(x=>x.id===S.manualCurrentId);
  if(ci!==-1) return idx<ci?'past':'upcoming';
  return idx===0?'current':'upcoming';
}
// 化け座標の確認UIで「はい、この場所で表示」を押したとき：その地点を承認(geoOk=true)して保存し天気を再取得。
export function confirmGeo(stopId){
  let stop=null,date='';
  for(let di=0;di<data.days.length;di++){
    const s=data.days[di].stops.find(s=>s.id===stopId);
    if(s){stop=s;date=data.days[di].date||_isoToday(di);break;}
  }
  if(!stop) return;
  stop.geoOk=true;
  save();
  delete wxStopRes[stopId];wxQueueIds.delete(stopId);
  enqueueStop(stop,date);
  const el=document.getElementById('wx-'+stopId);
  if(el) el.innerHTML='<div class="stop-wx-loading">🌐 取得中…</div>';
  showInfoToast('🌐 この場所で天気を取得します',2000);
}
export function saveStop(){
  _dbgLog('saveStop:in', _dbgSnapshot);
  if(!_canEditData()) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  const name=sanitize(_dom('inp-name').value,LIMIT.name);
  if(!name){showValError('地点名を入力してください');return;}
  let addr=sanitize(_dom('inp-addr').value,LIMIT.addr);
  const geo=extractMapCoord(addr); // 座標形式/GoogleマップURLなら {lat,lon}、住所なら null
  // DMS（度分秒）形式は十進法に未対応 → 保存をブロックして変換を促す（誤って住所扱いで保存→天気失敗を防ぐ）
  if(!geo&&isDmsCoord(addr)){showValError('度分秒(DMS)形式は未対応です。十進法（例: 35.681236, 139.767125）で入力してください');return;}
  if(geo) addr=`${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`; // URL等を貼った場合は座標文字列に正規化して保存
  const newArr=_dom('inp-arr').value,newDep=_dom('inp-dep').value;
  if(!isTimeOrderOk(newArr,newDep)){showValError('到着時刻は出発時刻より前に設定してください');return;}
  const note=sanitize((_dom('inp-note').value||'').replace(/\r\n?/g,'\n'),LIMIT.note);
  const log=sanitize((_dom('inp-log')?.value||'').replace(/[\r\n]+/g,' '),LIMIT.log);
  const actArr=isValidTime(_dom('inp-act-arr')?.value||'')?(_dom('inp-act-arr')?.value||''):'';
  const actDep=isValidTime(_dom('inp-act-dep')?.value||'')?(_dom('inp-act-dep')?.value||''):'';
  const fuel=_dom('fuel-check-box')?.classList.contains('checked')||false;
  const old=document.getElementById('val-error');if(old)old.remove();// 動的生成要素なので_dom()のキャッシュは使わない（削除済みのゴミを掴むのを防ぐ）
  try{
    const ds=data.days[S.currentDay].stops;
    let updatedId=null; // 更新時のID退避（setFormAdd()でS.editingId=nullになるため事前に保存）
    if(S.editingId!==null){
      updatedId=S.editingId;
      const idx=ds.findIndex(s=>s.id===S.editingId);
      if(idx===-1){showAppError(EC.STOP,new Error('編集中の地点が見つかりません'));setFormAdd();return;}
      const oldDep=ds[idx].dep;
      // 住所が変わったら化け承認(geoOk)を破棄して再判定させる。座標(geo)入力は判定対象外だが、揃えてリセット。
      const addrChanged=(ds[idx].addr||'')!==(addr||'');
      const geoOk=addrChanged?false:ds[idx].geoOk;
      ds[idx]={...ds[idx],name,addr,arr:newArr,dep:newDep,note,log,actArr,actDep,fuel,geo,geoOk};
      // 住所または日付が変わった可能性があるためキャッシュクリア
      delete wxStopRes[S.editingId];wxQueueIds.delete(S.editingId);
      if(newDep&&oldDep!==newDep)cascadeFrom(S.currentDay,idx,oldDep);
      // B案: 編集しても並び順は変えない（順序はユーザーのドラッグ/整列ボタンに委ねる）
      setFormAdd();S.activeEditStopId=null;
    }else{
      if(ds.length>=LIMIT.stopsPerDay){showValError(`地点は1日${LIMIT.stopsPerDay}件までです`);return;}
      const newId=Date.now().toString(36)+Math.random().toString(36).slice(2);
      ds.push({id:newId,name,addr,arr:newArr,dep:newDep,note,log,actArr,actDep,fuel,geo});
      // B案: 追加した地点は末尾に置き、並び順はユーザーのドラッグに委ねる（自動で並べ替えない）
      // フォームを完全リセット（編集分岐と同じ挙動）。給油チェック・詳細パネル・時刻エラー表示・
      // 滞在時間プレビューも初期化し、次の追加に給油ON等が継承されないようにする。
      setFormAdd();
      syncBorderAddr();save();render();
      // キーボードを閉じてから追加地点へスクロール
      requestAnimationFrame(()=>{
        if(document.activeElement) document.activeElement.blur();
        setTimeout(()=>{
          const el=document.querySelector(`.stop-row[data-id="${newId}"]`);
          if(el) el.scrollIntoView({behavior:'smooth',block:'center'});
        },100);
      });
      return;
    }
    syncBorderAddr();save();render();
    // キーボードを閉じてから更新した地点へスクロール（sortで位置が変わる場合もdata-idで確実に特定）
    requestAnimationFrame(()=>{
      if(document.activeElement) document.activeElement.blur();
      setTimeout(()=>{
        const el=document.querySelector(`.stop-row[data-id="${updatedId}"]`);
        if(el) el.scrollIntoView({behavior:'smooth',block:'center'});
      },100);
    });
  }catch(e){showAppError(EC.STOP,e);}
}
/* ══ 📍現在地ボタン: 端末のGPS座標を住所欄へ入れる ══
   手入力の代わりに今いる場所の座標を欄に流し込む。保存時に parseCoord で geo に確定する。
   （計画机上では Googleマップ等から座標をコピペして欄に貼ってもよい＝同じ経路で確定される）*/
export function captureCurrentLocation(){
  const inp=document.getElementById('inp-addr');
  const btn=document.getElementById('geo-capture-btn');
  if(!('geolocation' in navigator)){showInfoToast('⚠️ この端末は位置情報に非対応です',4000);return;}
  if(btn){btn.disabled=true;btn.textContent='取得中…';}
  const reset=()=>{ if(btn){btn.disabled=false;btn.textContent='📍 現在地';} };
  navigator.geolocation.getCurrentPosition(pos=>{
    reset();
    const {latitude,longitude,accuracy}=pos.coords;
    if(inp) inp.value=`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    _updateGeoHint();
    _dbgLog('geo_capture',{acc:Math.round(accuracy||0)});
    showInfoToast(`📍 現在地を入力しました（精度±${Math.round(accuracy||0)}m）。保存で確定します`,3500);
  },err=>{
    reset();
    _dbgLog('geo_capture_err',{code:err.code,msg:String(err.message||'').slice(0,80)});
    // code 1(許可拒否)は「ブラウザの許可」の話なので本体GPSと混ぜない。
    // code 2/3(取得不能/タイムアウト)は本体の位置情報サービスがオフの可能性があるため確認を促す
    // （「オフです」と断定せず「オンかご確認ください」に留める：トンネル等の一時失敗とも区別不能なため）。
    const msg=err.code===1
      ? '⚠️ 位置情報の許可が必要です'
      : '⚠️ 現在地を取得できませんでした。端末の位置情報（GPS）がオンかご確認ください';
    showInfoToast(msg,4500);
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
/* ══ 住所欄が「住所」か「座標」かを判定してヒント表示 ══ */
export function _updateGeoHint(){
  const inp=document.getElementById('inp-addr');
  const hint=document.getElementById('geo-hint');
  if(!inp||!hint) return;
  // ①共有URL警告／②座標確定チップ用の要素（無くても本処理は成立するよう存在チェックする）
  const warn=document.getElementById('geo-warn');
  const okchip=document.getElementById('geo-okchip');
  const okcoord=document.getElementById('geo-okcoord');
  const hideWarn=()=>{ if(warn) warn.classList.remove('show'); };
  const hideOk  =()=>{ if(okchip) okchip.classList.remove('show'); };
  let v=(inp.value||'').trim();
  if(!v){hint.textContent='';hint.className='geo-hint';hideWarn();hideOk();return;}
  // GoogleマップURL等を貼ったら座標を抽出して「緯度, 経度」に正規化
  if(!parseCoord(v)){
    const c=extractMapCoord(v);
    if(c){ v=`${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`; inp.value=v; }
  }
  const pc=parseCoord(v);
  if(pc){
    hint.textContent='📍 座標として認識（天気・GPS自動切替ともこの座標を使用）';
    hint.className='geo-hint ok';
    hideWarn();
    // ②座標確定チップ：表示は6桁に正規化（欄の値は入力中の書き換えを避けるため触らない。最終正規化は保存時のsaveStop）
    if(okchip){ if(okcoord) okcoord.textContent=`${pc.lat.toFixed(6)}, ${pc.lon.toFixed(6)}`; okchip.classList.add('show'); }
  }else if(isShareMapUrl(v)){
    // ①共有短縮URLは座標を含まない → 失敗を明示して貼り直しを案内
    hint.textContent='⚠️ この共有リンクは座標を含みません（下の案内を参照）';
    hint.className='geo-hint warn';
    hideOk();
    if(warn) warn.classList.add('show');
  }else if(isDmsCoord(v)){
    // 度分秒(DMS)形式は parseCoord（十進法のみ）で取り込めない → 十進法への変換を案内
    hint.textContent='⚠️ 度分秒(DMS)形式は未対応です。十進法（例: 35.681236, 139.767125）で入力してください';
    hint.className='geo-hint warn';
    hideOk();
    hideWarn();
  }else{
    hint.textContent='🏠 住所として認識。「🗺 Googleで開く」で探して座標/URLを貼ると正確です';
    hint.className='geo-hint';
    hideWarn();
    hideOk();
  }
}

/* ══ 住所欄への貼り付けハンドラ（GoogleマップURL対策） ══
   #inp-addr は maxlength=100 のため、長いGoogleマップURLを貼ると座標部分が切り捨てられ
   抽出に失敗する。そこで貼り付け時にクリップボード全文（maxlength非適用）から座標を取り出し、
   取れたら短い「緯度, 経度」に置き換えてから欄へ入れる（＝長いURLでも確実に取り込める）。
   座標が取れない（住所・短縮URL等）の場合はデフォルトの貼り付けに任せる。*/
export function _onAddrPaste(e){
  try{
    const dt=e.clipboardData||window.clipboardData;
    const txt=dt?dt.getData('text'):'';
    if(!txt) return;
    const c=extractMapCoord(txt);
    if(c){
      e.preventDefault();
      const inp=document.getElementById('inp-addr');
      if(inp) inp.value=`${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`;
      _updateGeoHint();
      _dbgLog('addr_paste_coord',{});
    }
  }catch(_){ /* 失敗時は通常の貼り付けに委ねる */ }
}

/* ══ 📋 クリップボードから住所欄へ貼り付け ══
   Google等でコピーした座標/URL/住所を1タップで欄に入れる（欄の長押し操作が不要に）。
   長いGoogleマップURLでもクリップボード全文（maxlength非適用）から座標を抽出し、
   取れたら短い「緯度, 経度」に正規化してから入れる。非対応・不許可の端末では手動貼り付けを案内。*/
export async function pasteFromClipboard(){
  const inp=document.getElementById('inp-addr');
  if(!inp) return;
  if(!(navigator.clipboard && navigator.clipboard.readText)){
    showInfoToast('⚠️ この端末はボタン貼り付けに非対応です。欄を長押しして貼り付けてください',4000);
    return;
  }
  let txt='';
  try{
    txt=((await navigator.clipboard.readText())||'').trim();
  }catch(err){
    _dbgLog('addr_clip_err',{msg:String(err&&err.message||'').slice(0,80)});
    showInfoToast('⚠️ クリップボードを読み取れませんでした。許可するか、欄を長押しして貼り付けてください',4500);
    return;
  }
  if(!txt){ showInfoToast('クリップボードが空です',3000); return; }
  const c=extractMapCoord(txt);
  inp.value = c ? `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}` : sanitize(txt, LIMIT.addr);
  _updateGeoHint();
  inp.focus();
  _dbgLog('addr_clip_paste',{coord:!!c});
}

/* ══ 🗺 Googleで開くボタン: 地点名＋住所でGoogleマップ検索を開く ══
   施設名検索はGoogleが最も強いので、場所探しはGoogleに任せる。
   出てきた地点を長押し→座標コピー、またはブラウザ版のURLをコピーして住所欄に貼ると、
   _updateGeoHint / saveStop の extractMapCoord が座標を取り込んで geo に確定する。*/
export function openInGoogleMaps(){
  const name=(document.getElementById('inp-name')?.value||'').trim();
  const addr=(document.getElementById('inp-addr')?.value||'').trim();
  const c=extractMapCoord(addr); // 座標・座標入りURLならその一点を開く
  let url;
  if(c){
    url=`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;
  }else{
    const q=[name,addr].filter(Boolean).join(' ');
    if(!q){ showInfoToast('地点名か住所を入力してください',3000); return; }
    url=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  window.open(url,'_blank','noopener');
  _dbgLog('open_gmaps',{hasCoord:!!c});
}
export function delStop(id){
  _dbgLog('delStop',()=>({id,snap:_dbgSnapshot()}));
  if(!_canEditData()) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  try{
    delete wxStopRes[id];wxQueueIds.delete(id);
    data.days[S.currentDay].stops=data.days[S.currentDay].stops.filter(s=>s.id!==id);
    if(id===S.manualCurrentId){S.manualCurrentId=null;_invalidateCdi();}
    if(S.editingId===id)setFormAdd();syncBorderAddr();save();render();
    showInfoToast('🗑️ 地点を削除しました',2000);
  }catch(e){showAppError(EC.STOP,e);}
}
export function setCurrentStop(id,fromGps,keepView){
  _dbgLog('setCurrentStop',{id,fromGps:!!fromGps,keepView:!!keepView});
  try{
    S.manualCurrentId=id;_invalidateCdi(); // cdiキャッシュ無効化
    // keepView=true のときは表示中ページ(S.rideViewIdx)を動かさない（手動スワイプ後の表示固定を尊重）
    if(!keepView){const fi=currentDayIdxOf(id);if(fi!==-1)S.rideViewIdx=fi;}
    // GPS由来でない（=ユーザーの手動操作）ときだけGPS自動切替を一時抑制する
    if(!fromGps&&typeof _gpsNotifyManualSet==='function') _gpsNotifyManualSet();
    save();if(S.isRide)renderRide();else render();
  }catch(e){showAppError(EC.CURRENT,e);}
}
