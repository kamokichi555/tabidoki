/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 08-mode.js
   モード管理（テーマ / toggleRide / toggleEdit / 編集フォーム操作）
   依存: 00-constants.js（EC）
   実行時依存: data, isEdit, isRide, editingId, render, renderRide,
              save, showAppError, _dbgLog, _closeAllOverlays
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ テーマ管理 ══ */
let _themeManual=false;
function _isDayTime(){const h=new Date().getHours();return h>=6&&h<18;}
function _applyTheme(day){
  document.body.classList.toggle('day-mode',day);
  const btn=document.getElementById('theme-btn');
  if(btn) btn.textContent=day?'🌙':'☀️';
  _lastClockTs=''; // テーマ切替時はキャッシュリセットして色を即時更新
  updateClock();
}
function _initTheme(){
  let saved=null;
  try{saved=localStorage.getItem('touring_theme');}catch(e){}
  if(saved){_themeManual=true;_applyTheme(saved==='day');}
  else{_applyTheme(_isDayTime());}
}
function _toggleTheme(){
  const isDay=document.body.classList.contains('day-mode');
  _themeManual=true;
  _applyTheme(!isDay);
  try{localStorage.setItem('touring_theme',!isDay?'day':'night');}catch(e){}
}
setInterval(()=>{if(!_themeManual)_applyTheme(_isDayTime());},60000);
function toggleRide(){
  _closeAllOverlays();
  // 編集中にライドモードへ切り替える場合は確認（新設計では常にisEdit=trueのため毎回出る）
  if(!isRide&&isEdit){const msg=_formHasData()?'入力中のデータが保存されていません。\n走行モードに切り替えますか？':'走行モードに切り替えます。よろしいですか？';if(!confirm(msg))return;}
  _flushRouteSave(); // 入力中のrouteUrlを取りこぼさない（currentDay変更前に保存）
  _dbgLog('toggleRide:in', _dbgSnapshot);
  isRide=!isRide;
  _lastClockTs=''; // 走行モード切替時に時計サイズを即時更新
  updateClock();   // キャッシュリセット後すぐに再描画
  document.body.classList.toggle('ride-mode',isRide);
  if(isRide&&isEdit){isEdit=false;_dom('edit-area').style.display='none';}
  _dom('normal-view').style.display=isRide?'none':'block';
  _dom('ride-view').classList.toggle('active',isRide);
  _dom('ride-btn').classList.toggle('on',isRide);
  _dom('ride-btn').textContent=isRide?'📋':'🏍️';
  _dom('edit-btn').style.display='';
  _dom('edit-btn').textContent='✏️'; // ✅ボタン廃止につき常に✏️
  _dom('day-tabs').style.display=isRide?'none':'';
  _dom('day-manage').style.display=isRide?'none':isEdit?'flex':'none'; // 走行終了時はisEditの状態に従う
  if(isRide){
    // 現在地が別の日程にある場合、その日程に自動切り替え
    const cdi=_getCdi();
    if(cdi!==-1&&cdi!==currentDay){currentDay=cdi;renderTabs();}
    const fi=currentDayIdxOf(manualCurrentId);rideViewIdx=fi!==-1?fi:0;
    rideActionVisible=false;
    _updateStickyTops();
    ensureDayWeather(currentDay);
    renderRide();
  }else{
    _updateStickyTops();
    render(); // 走行中にsetCurrentStop等で変わった地点状態をnormal-viewに反映
  }
  _dbgLog('toggleRide:out', _dbgSnapshot);
}

function onEditBtnClick(){
  if(isRide){
    // rideViewIdxはcurrentDayFlat基準なのでcurrentDayFlatを使用
    const flat=currentDayFlat();
    const vs=flat[Math.max(0,Math.min(flat.length-1,rideViewIdx))];
    toggleRide();
    if(vs) currentDay=vs.dayIdx;
    renderTabs(); // render()は直後のtoggleEdit()が正しいisEdit状態で呼ぶため不要
  }
  if(!isEdit) toggleEdit();
}
function cancelToRide(){
  if(!_confirmLeaveEdit()) return;
  if(isEdit){cancelEdit();isEdit=false;_dom('edit-area').style.display='none';}
  _dom('cancel-ride-btn').style.display='none';_dom('ride-btn').style.display='';
  if(isRide) toggleRide(); // isRide=trueのときだけtoggleRide（内部でisRide=falseにする）
}
function toggleEdit(){
  _closeAllOverlays();
  _dbgLog('toggleEdit:in', _dbgSnapshot);
  if(isEdit) return; // 既に編集中なら何もしない（✅ボタン削除により不要な呼び出しを防ぐ）
  isEdit=true;
  _dom('edit-area').style.display='block';
  setFormAdd();
  _dom('normal-view')?.scrollTo({top:0,behavior:'instant'});
  _dom('day-manage').style.display='flex';
  _updateStickyTops();
  render();
  _dbgLog('toggleEdit:out', _dbgSnapshot);
}
function updateDragHint(){const h=_dom('drag-hint');if(!h)return;if(editingId!==null){h.innerHTML='✏️ 地点を保存またはキャンセル後に並び替えできます';h.style.color='var(--amber)';}else{h.innerHTML='地点をドラッグして行程を並び替え（PCはマウスドラッグ）';h.style.color='';}}
function setFormAdd(){
  editingId=null;
  _dom('form-title').textContent='地点を追加';
  _dom('save-btn').textContent='＋ 追加';
  ['inp-name','inp-addr','inp-note','inp-log'].forEach(id=>_dom(id).value='');
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
function openEditStop(id){
  _dbgLog('openEditStop',()=>({id,snap:_dbgSnapshot()}));
  try{
    const ds=stops(),s=ds.find(s=>s.id===id);if(!s)return;
    editingId=id;_dom('form-title').textContent='✏️ '+s.name;_dom('save-btn').textContent='✅ 更新';
    _dom('inp-name').value=s.name;_dom('inp-addr').value=s.addr||'';_dom('inp-arr').value=s.arr||'';_dom('inp-dep').value=s.dep||'';_dom('inp-note').value=s.note||'';_dom('inp-log').value=s.log||'';
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
function tapStopInEdit(id){
  activeEditStopId=(activeEditStopId===id?null:id);
  render();
}
function cancelEdit(noRender){setFormAdd();activeEditStopId=null;if(!noRender)render();}

// 行程データ（地点）が1件以上存在するか判定
function _hasAnyStops(){
  return data&&data.days&&data.days.some(d=>d.stops&&d.stops.length>0);
}

// フォームに未保存の入力データがあるか判定
function _formHasData(){
  if(editingId!==null) return true; // 既存地点の編集中は常に確認
  return ['inp-name','inp-addr','inp-arr','inp-dep','inp-note','inp-log','inp-act-arr','inp-act-dep'].some(id=>{
    const el=_dom(id); return el&&el.value.trim()!=='';
  });
}

// 編集画面から離れる前にデータ保存確認。離れてよければ true を返す
function _confirmLeaveEdit(){
  if(!isEdit||!_formHasData()) return true;
  const msg=editingId!==null
    ?'地点の編集内容が保存されていません。\n保存せずに移動しますか？'
    :'入力中のデータが保存されていません。\n移動すると入力内容が失われます。\n移動しますか？';
  return confirm(msg);
}
