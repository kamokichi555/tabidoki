/* ══════════════════════════════════════════════════════
   旅刻 mk17 — 08-mode.js
   モード管理（テーマ / toggleRide / toggleEdit / 編集フォーム操作）
   依存: 00-constants.js（EC）
   実行時依存: data, S.isEdit, S.isRide, S.editingId, render, renderRide,
              save, showAppError, _dbgLog, _closeAllOverlays
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { EC } from './00-constants.js';
import { S, _dom, data } from './01-state.js';
import { stayDur } from './02-utils.js';
import { ensureDayWeather } from './04-weather.js';
import { _flushRouteSave, _syncTitleInput, _updateStickyTops, currentDayFlat, currentDayIdxOf, renderTabs, stops } from './06-day.js';
import { _lastClockTs, _resetClockTs, render, renderRide, showAppError, updateClock } from './07-render.js';
import { _closeAllOverlays, _setDetailsOpen, _setFuelCheck } from './11-overlays.js';
import { _dbgLog, _dbgSnapshot } from './12-debug.js';
import { _gpsOnRideEnd, _gpsOnRideStart } from './14-gps.js';


/* ══ テーマ管理 ══ */
export let _themeManual=false;
export function _isDayTime(){const h=new Date().getHours();return h>=6&&h<18;}
export function _applyTheme(day){
  document.body.classList.toggle('day-mode',day);
  const btn=document.getElementById('theme-btn');
  if(btn) btn.textContent=day?'🌙':'☀️';
  _resetClockTs(); // テーマ切替時はキャッシュリセットして色を即時更新
  updateClock();
}
export function _initTheme(){
  let saved=null;
  try{saved=localStorage.getItem('touring_theme');}catch(e){}
  if(saved){_themeManual=true;_applyTheme(saved==='day');}
  else{_applyTheme(_isDayTime());}
}
export function _toggleTheme(){
  const isDay=document.body.classList.contains('day-mode');
  _themeManual=true;
  _applyTheme(!isDay);
  try{localStorage.setItem('touring_theme',!isDay?'day':'night');}catch(e){}
}
setInterval(()=>{if(!_themeManual)_applyTheme(_isDayTime());},60000);
export function toggleRide(){
  _closeAllOverlays();
  // 編集中にライドモードへ切り替える場合は確認（新設計では常にS.isEdit=trueのため毎回出る）
  if(!S.isRide&&S.isEdit){const msg=_formHasData()?'入力中のデータが保存されていません。\n走行モードに切り替えますか？':'走行モードに切り替えます。よろしいですか？';if(!confirm(msg))return;}
  _flushRouteSave(); // 入力中のrouteUrlを取りこぼさない（S.currentDay変更前に保存）
  _dbgLog('toggleRide:in', _dbgSnapshot);
  S.isRide=!S.isRide;
  _resetClockTs(); // 走行モード切替時に時計サイズを即時更新
  updateClock();   // キャッシュリセット後すぐに再描画
  document.body.classList.toggle('ride-mode',S.isRide);
  if(S.isRide&&S.isEdit){S.isEdit=false;_dom('edit-area').style.display='none';}
  _dom('normal-view').style.display=S.isRide?'none':'block';
  _dom('ride-view').classList.toggle('active',S.isRide);
  _dom('ride-btn').classList.toggle('on',S.isRide);
  _dom('ride-btn').textContent=S.isRide?'📋':'🏍️';
  _dom('edit-btn').style.display='';
  _dom('edit-btn').textContent='✏️'; // ✅ボタン廃止につき常に✏️
  _dom('day-tabs').style.display=S.isRide?'none':'';
  _dom('day-manage').style.display=S.isRide?'none':S.isEdit?'flex':'none'; // 走行終了時はS.isEditの状態に従う
  if(S.isRide){
    // 走行モードは編集/通常画面で選択中の日(S.currentDay)をそのまま表示する（自動的な日の切り替えはしない）
    const fi=currentDayIdxOf(S.manualCurrentId);S.rideViewIdx=fi!==-1?fi:0;
    S.rideActionVisible=false;
    _updateStickyTops();
    ensureDayWeather(S.currentDay);
    renderRide();
    if(typeof _gpsOnRideStart==='function') _gpsOnRideStart(); // GPS自動追跡開始
  }else{
    if(typeof _gpsOnRideEnd==='function') _gpsOnRideEnd(); // GPS自動追跡停止
    _updateStickyTops();
    render(); // 走行中にsetCurrentStop等で変わった地点状態をnormal-viewに反映
  }
  _dbgLog('toggleRide:out', _dbgSnapshot);
}

export function onEditBtnClick(){
  if(S.isRide){
    // S.rideViewIdxはcurrentDayFlat基準なのでcurrentDayFlatを使用
    const flat=currentDayFlat();
    const vs=flat[Math.max(0,Math.min(flat.length-1,S.rideViewIdx))];
    toggleRide();
    if(vs) S.currentDay=vs.dayIdx;
    renderTabs(); // render()は直後のtoggleEdit()が正しいS.isEdit状態で呼ぶため不要
  }
  if(!S.isEdit) toggleEdit();
}
export function cancelToRide(){
  if(!_confirmLeaveEdit()) return;
  if(S.isEdit){cancelEdit();S.isEdit=false;_dom('edit-area').style.display='none';}
  _dom('cancel-ride-btn').style.display='none';_dom('ride-btn').style.display='';
  if(S.isRide) toggleRide(); // S.isRide=trueのときだけtoggleRide（内部でS.isRide=falseにする）
}
export function toggleEdit(){
  _closeAllOverlays();
  _dbgLog('toggleEdit:in', _dbgSnapshot);
  if(S.isEdit) return; // 既に編集中なら何もしない（✅ボタン削除により不要な呼び出しを防ぐ）
  S.isEdit=true;
  _dom('edit-area').style.display='block';
  _syncTitleInput(); // ツーリング名欄に現在のタイトルを反映
  setFormAdd();
  _dom('normal-view')?.scrollTo({top:0,behavior:'instant'});
  _dom('day-manage').style.display='flex';
  _updateStickyTops();
  render();
  _dbgLog('toggleEdit:out', _dbgSnapshot);
}
export function updateDragHint(){const h=_dom('drag-hint');if(!h)return;if(S.editingId!==null){h.innerHTML='✏️ 地点を保存またはキャンセル後に並び替えできます';h.style.color='var(--amber)';}else{h.innerHTML='地点をドラッグして行程を並び替え（PCはマウスドラッグ）';h.style.color='';}}
export function setFormAdd(){
  S.editingId=null;
  _dom('form-title').textContent='地点を追加';
  _dom('save-btn').textContent='＋ 追加';
  ['inp-name','inp-addr','inp-note','inp-log'].forEach(id=>_dom(id).value='');
  autoGrowNote(_dom('inp-note'));
  ['inp-arr','inp-dep','inp-act-arr','inp-act-dep'].forEach(id=>{
    const el=_dom(id);
    if(el){el.value='';if(id==='inp-dep') el.style.borderColor='';}
  });
  _dom('cascade-hint').style.display='none';
  const toe=_dom('time-order-error');
  if(toe) toe.style.display='none';
  const _prev=document.getElementById('stay-dur-preview');if(_prev){_prev.textContent='';_prev.style.display='none';}
  _setFuelCheck(false);_setDetailsOpen(false);updateDragHint();
}
export function openEditStop(id){
  _dbgLog('openEditStop',()=>({id,snap:_dbgSnapshot()}));
  try{
    const ds=stops(),s=ds.find(s=>s.id===id);if(!s)return;
    S.editingId=id;_dom('form-title').textContent='✏️ '+s.name;_dom('save-btn').textContent='✅ 更新';
    _dom('inp-name').value=s.name;_dom('inp-addr').value=s.addr||'';_dom('inp-arr').value=s.arr||'';_dom('inp-dep').value=s.dep||'';_dom('inp-note').value=s.note||'';_dom('inp-log').value=s.log||'';
    autoGrowNote(_dom('inp-note'));
    const _actArr=_dom('inp-act-arr'),_actDep=_dom('inp-act-dep');
    if(_actArr)_actArr.value=s.actArr||'';if(_actDep)_actDep.value=s.actDep||'';
    _setFuelCheck(!!s.fuel);
    _setDetailsOpen(!!(s.addr||s.fuel||s.actArr||s.actDep));
    const idx=ds.findIndex(s=>s.id===id);_dom('cascade-hint').style.display=(s.dep&&idx<ds.length-1)?'block':'none';
    const _prev=document.getElementById('stay-dur-preview');if(_prev){const _sd=stayDur(s.arr,s.dep);_prev.textContent=_sd?'⏱ 滞在 '+_sd:'';_prev.style.display=_sd?'block':'none';}
    updateDragHint();
    _dom('normal-view')?.scrollTo({top:0,behavior:'smooth'});
  }catch(e){showAppError(EC.EDIT_OPEN,e);}
}
export function tapStopInEdit(id){
  S.activeEditStopId=(S.activeEditStopId===id?null:id);
  render();
}
export function cancelEdit(noRender){setFormAdd();S.activeEditStopId=null;if(!noRender)render();}

// 行程データ（地点）が1件以上存在するか判定
export function _hasAnyStops(){
  return data&&data.days&&data.days.some(d=>d.stops&&d.stops.length>0);
}

// フォームに未保存の入力データがあるか判定
export function _formHasData(){
  if(S.editingId!==null) return true; // 既存地点の編集中は常に確認
  return ['inp-name','inp-addr','inp-arr','inp-dep','inp-note','inp-log','inp-act-arr','inp-act-dep'].some(id=>{
    const el=_dom(id); return el&&el.value.trim()!=='';
  });
}

// 編集画面から離れる前にデータ保存確認。離れてよければ true を返す
export function _confirmLeaveEdit(){
  if(!S.isEdit||!_formHasData()) return true;
  const msg=S.editingId!==null
    ?'地点の編集内容が保存されていません。\n保存せずに移動しますか？'
    :'入力中のデータが保存されていません。\n移動すると入力内容が失われます。\n移動しますか？';
  return confirm(msg);
}

/* メモ欄プレビュー更新（隠しtextarea #inp-note の内容を #note-preview に反映） */
export function syncNotePreview(){
  const ta=_dom('inp-note');
  const pv=document.getElementById('note-preview');
  if(!ta||!pv) return;
  const v=ta.value||'';
  if(v.trim()===''){
    pv.textContent='メモ（食事・注意点など）';
    pv.classList.add('is-empty');
    pv.classList.remove('is-clamped');
  }else{
    pv.textContent=v;
    pv.classList.remove('is-empty');
    // 内容がプレビュー高さを超えるならフェードマスク表示
    requestAnimationFrame(()=>{pv.classList.toggle('is-clamped',pv.scrollHeight>pv.clientHeight+2);});
  }
}
// 互換: 旧 autoGrowNote 呼び出し箇所はプレビュー更新に読み替え
export function autoGrowNote(el){ syncNotePreview(); }

/* メモ全画面モーダル */
export function openNoteModal(){
  const ta=_dom('inp-note');
  const mt=document.getElementById('note-modal-text');
  const md=document.getElementById('note-modal');
  if(!ta||!mt||!md) return;
  mt.value=ta.value||'';
  _updateNoteCount();
  md.style.display='flex';
  // ヘッダーがモーダル前面に来ないよう退避（オーバーレイと同様の措置）
  const h=document.querySelector('header'); if(h) md._prevHz=h.style.zIndex, h.style.zIndex='1';
  requestAnimationFrame(()=>{mt.focus();const n=mt.value.length;try{mt.setSelectionRange(n,n);}catch(e){}});
}
export function closeNoteModal(commit){
  const ta=_dom('inp-note');
  const mt=document.getElementById('note-modal-text');
  const md=document.getElementById('note-modal');
  if(!md) return;
  if(commit&&ta&&mt){ ta.value=mt.value; syncNotePreview(); }
  if(document.activeElement) document.activeElement.blur();
  md.style.display='none';
  const h=document.querySelector('header'); if(h) h.style.zIndex=md._prevHz||'';
}
export function _updateNoteCount(){
  const mt=document.getElementById('note-modal-text');
  const c=document.getElementById('note-modal-count');
  if(mt&&c) c.textContent=(mt.value.length)+' / 1000';
}
