/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 06-day.js
   日程・タブ管理 + データアクセサ
   （stops / dayTabLabel / currentDayFlat / addDay / switchDay 等）
   依存: 00-constants.js（EC）, 02-utils.js（toMin/fromMin/debounce）
   実行時依存: data, currentDay, isEdit, save, render, showAppError
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

function stops(){return data.days[currentDay].stops;}

function dayTabLabel(day,idx){
  const n=idx+1;
  if(!day.stops||!day.stops.length) return `${n}日目\n未設定`;
  if(day.date){try{const d=new Date(day.date+'T12:00:00');if(isNaN(d.getTime()))return `${n}日目\n未設定`;const m=d.getMonth()+1,dd=d.getDate();const w=['日','月','火','水','木','金','土'][d.getDay()];return `${n}日目\n${m}/${dd}(${w})`;}catch(e){}}
  return `${n}日目\n未設定`;
}

function allStopsFlat(){return data.days.flatMap((day,di)=>day.stops.map(s=>({...s,dayIdx:di,dayLabel:dayTabLabel(day,di)})));}
// 走行モード用：現在タブの地点のみ
function currentDayFlat(){
  const day=data.days[currentDay];
  if(!day) return [];
  const dayLabel=dayTabLabel(day,currentDay); // 全stopで同一のラベルを1回だけ計算
  return (day.stops||[]).map(s=>({...s,dayIdx:currentDay,dayLabel}));
}
function currentDayIdxOf(id){return currentDayFlat().findIndex(s=>s.id===id);}
function _updateRecordBtn(){
  const btn=document.getElementById('record-save-btn');
  if(!btn) return;
  try{
    const has=data&&(data.days||[]).some(d=>(d.stops||[]).some(s=>s.actArr||s.actDep||s.log));
    btn.classList.toggle('has-record',!!has);
  }catch(e){/* ボタン状態更新失敗は無視 */}
}

let _cachedCdi=-1,_cachedCdiForId=null;
function _getCdi(){
  if(manualCurrentId===null) return -1; // null時はキャッシュ歩哨曖昧性を避けるため即-1返却
  if(manualCurrentId===_cachedCdiForId) return _cachedCdi;
  _cachedCdiForId=manualCurrentId;
  _cachedCdi=-1;
  if(manualCurrentId!==null){
    for(let di=0;di<data.days.length;di++){
      if(data.days[di].stops.some(x=>x.id===manualCurrentId)){_cachedCdi=di;break;}
    }
  }
  return _cachedCdi;
}
function _updateStickyTops(){
  const hh=document.querySelector('header')?.offsetHeight||62;
  const vv=window.visualViewport;
  const vh=vv?vv.height:window.innerHeight;
  const h=Math.max(200,vh-hh);
  // CSS変数とstyle両方を更新（タイミングずれに対する二重保険）
  document.documentElement.style.setProperty('--nv-h', vh+'px');
  document.documentElement.style.setProperty('--hh', hh+'px');
  const nv=document.getElementById('normal-view');
  if(nv) nv.style.height=h+'px';
  const rv=document.getElementById('ride-view');
  if(rv) rv.style.height=h+'px';
}
function renderTabs(){
  const c=document.getElementById('day-tabs');
  c.innerHTML=data.days.map((d,i)=>`<button class="day-tab${i===currentDay?' on':''}" onclick="switchDay(${i})">${dayTabLabel(d,i)}</button>`).join('');
  document.getElementById('day-manage').style.display=isEdit?'flex':'none';
  const ri=document.getElementById('inp-route-url');if(ri) ri.value=data.days[currentDay].routeUrl||'';
  const di=document.getElementById('inp-day-date');if(di) di.value=data.days[currentDay].date||'';
  _updateStickyTops();
}

function _sortDays(){
  const saved=data.days[currentDay];
  data.days.sort((a,b)=>{
    if(!a.date&&!b.date) return 0;
    if(!a.date) return 1;
    if(!b.date) return -1;
    return a.date<b.date?-1:a.date>b.date?1:0;
  });
  currentDay=data.days.indexOf(saved);
  if(currentDay<0) currentDay=0;
  _cachedCdiForId=null; // 並び替え後はdayIndexが変わるためcdiキャッシュを無効化
}
function saveDayDate(){
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（破壊・汚染防止）
  const v=document.getElementById('inp-day-date').value;
  const old=data.days[currentDay].date;
  if(v&&v!==old&&data.days.some((d,i)=>i!==currentDay&&d.date===v)){
    const el=document.getElementById('inp-day-date');
    el.value=old;
    el.style.borderColor='var(--red)';
    el.style.borderWidth='2px';
    setTimeout(()=>{el.style.borderColor='';el.style.borderWidth='';},2500);
    showInfoToast('⚠️ その日付はすでに登録されています',2500);
    return;
  }
  _flushRouteSave(); // 入力中のrouteUrlを取りこぼさない（後続のrenderTabsで上書きされる前に保存）
  data.days[currentDay].date=v;
  if(old!==v){
    for(const s of data.days[currentDay].stops){delete wxStopRes[s.id];wxQueueIds.delete(s.id);}
    if(v) _sortDays();
  }
  save();renderTabs();render();
}

const _saveRouteDebounced=debounce(()=>{
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（破壊・汚染防止）
  const v=document.getElementById('inp-route-url').value.trim().slice(0,LIMIT.url);
  if(!isSafeUrl(v)){showUrlError('URLはhttpまたはhttpsで始まるものを入力してください');return;}
  try{data.days[currentDay].routeUrl=v;save();}catch(e){showAppError(EC.ROUTE,e);}
},400);

/* ── ツーリング名（行程全体のタイトル）── */
// 入力をdata.titleへ保存（保存ファイル名・共有テキスト・走行記録に反映される）
const _saveTitleDebounced=debounce(()=>{
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（破壊・汚染防止）
  const el=document.getElementById('inp-title');
  if(!el) return;
  const v=sanitize(el.value,LIMIT.title);
  try{if(data.title!==v){data.title=v;save();}}catch(e){showAppError(EC.SAVE,e);}
},400);
// 入力欄に現在のdata.titleを反映（編集開始時・読込時などに呼ぶ）
function _syncTitleInput(){
  const el=document.getElementById('inp-title');
  if(el) el.value=data.title||'';
}
// debounce未確定のツーリング名入力を即時data.titleへ反映（保存/共有/記録の前に呼ぶ）
function _flushTitle(){
  if(_pendingRestore) return; // 復元確認が保留中はdataを変更しない（save()非経由のため個別ガード）
  const el=document.getElementById('inp-title');
  if(!el) return;
  const v=sanitize(el.value,LIMIT.title);
  if(data.title!==v) data.title=v;
}
// フォーカスを外した時点で確定保存（debounce待ちの取りこぼし・離脱直前の未保存を防ぐ）
function _commitTitle(){
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（破壊・汚染防止）
  const el=document.getElementById('inp-title');
  if(!el) return;
  const v=sanitize(el.value,LIMIT.title);
  try{if(data.title!==v){data.title=v;save();}}catch(e){showAppError(EC.SAVE,e);}
}

// debounce未確定のルートURL入力を即時データに反映（currentDay変更前に呼ぶ）
function _flushRouteSave(){
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（破壊・汚染防止）
  const ri=document.getElementById('inp-route-url');
  if(!ri || !data.days[currentDay]) return;
  const v=ri.value.trim().slice(0,LIMIT.url);
  if(!isSafeUrl(v)) return;
  if(data.days[currentDay].routeUrl!==v) data.days[currentDay].routeUrl=v;
}

function addDay(){
  _dbgLog('addDay', _dbgSnapshot);
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  try{
    if(data.days.length>=7){alert('最大7日間までです');return;}
    if(!_confirmLeaveEdit()) return; // 編集中の入力を保護
    if(isEdit) cancelEdit(true); // 編集状態をクリアして新日に切替時の dangling editingId を防ぐ
    _flushRouteSave(); // 入力中のrouteUrlを取りこぼさない
    const prev=data.days[data.days.length-1];
    let nextDate='';
    if(prev?.date){const _d=new Date(prev.date+'T12:00:00');if(!isNaN(_d.getTime())){_d.setDate(_d.getDate()+1);nextDate=_d.toISOString().slice(0,10);}}
    // 日付重複なら空にする
    if(nextDate&&data.days.some(d=>d.date===nextDate)) nextDate='';
    // 前日の最終地点を新タブの先頭にコピー（名前・住所のみ、時刻・メモ・実績はリセット）
    const prevLast=prev?.stops?.length ? prev.stops[prev.stops.length-1] : null;
    const inheritStop=prevLast ? [{
      id: Date.now().toString(36)+Math.random().toString(36).slice(2),
      name: prevLast.name,
      addr: prevLast.addr,
      arr:'', dep:'', note:'', log:'', actArr:'', actDep:'', fuel:false,
    }] : [];
    data.days.push({label:`${data.days.length+1}日目\n未設定`,date:nextDate,routeUrl:'',stops:inheritStop});
    currentDay=data.days.length-1;
    if(nextDate) _sortDays();
    syncBorderAddr();save();renderTabs();render();
  }catch(e){showAppError(EC.DAY_ADD,e);}
}

function deleteCurrentDay(){
  _dbgLog('deleteCurrentDay', _dbgSnapshot);
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  try{
    if(data.days.length<=1){
      const day=data.days[0];
      if(!day.stops.length){alert("地点がありません");return;}
      if(!confirm("登録されている地点をすべて削除しますか?"))return;
      if(day.stops.some(s=>s.id===manualCurrentId)){manualCurrentId=null;_cachedCdiForId=null;}
      day.stops.forEach(s=>{delete wxStopRes[s.id];wxQueueIds.delete(s.id);});
      day.stops=[];day.date="";day.routeUrl="";
      setFormAdd();save();syncBorderAddr();renderTabs();render();
      return;
    }
    if(!confirm(`「${dayTabLabel(data.days[currentDay],currentDay)}」を削除しますか？`))return;
    if(editingId!==null) setFormAdd(); // 編集中の地点が削除対象日に含まれる場合のdangling editingId防止
    if(data.days[currentDay].stops.some(s=>s.id===manualCurrentId)){manualCurrentId=null;_cachedCdiForId=null;}
    for(const s of data.days[currentDay].stops){delete wxStopRes[s.id];wxQueueIds.delete(s.id);}
    data.days.splice(currentDay,1);currentDay=Math.max(0,currentDay-1);
    _cachedCdiForId=null; // splice後は後続dayのインデックスがズレるためcdiキャッシュを必ず無効化
    save();renderTabs();render();
  }catch(e){showAppError(EC.DAY_DEL,e);}
}

function switchDay(i){
  try{
    if(!_confirmLeaveEdit()) return;
    _flushRouteSave(); // 入力中のrouteUrlを取りこぼさない
    currentDay=Math.max(0,Math.min(data.days.length-1,i));
    const fi=currentDayIdxOf(manualCurrentId);rideViewIdx=fi!==-1?fi:0;
    if(isEdit)cancelEdit(true);
    syncBorderAddr();save();renderTabs();render();
    // 日程切替後は先頭地点が見えるようにスクロール（edit-area表示中でもtop:0を避ける）
    requestAnimationFrame(()=>{
      _updateStickyTops();
      const nv=_dom('normal-view');
      if(!nv) return;
      const firstStop=nv.querySelector('#timeline .stop-row');
      if(firstStop){
        const nvRect=nv.getBoundingClientRect();
        const stopRect=firstStop.getBoundingClientRect();
        nv.scrollTo({top:nv.scrollTop+(stopRect.top-nvRect.top)-8,behavior:'instant'});
      }else{
        nv.scrollTo({top:0,behavior:'instant'});
      }
    });
  }catch(e){showAppError(EC.DAY_SW,e);}
}

// タブ境界の地点名が一致する場合、前タブの住所を次タブにコピー
function syncBorderAddr(){
  for(let i=0;i<data.days.length-1;i++){
    const cur=data.days[i].stops,nxt=data.days[i+1].stops;
    if(!cur.length||!nxt.length)continue;
    // 前タブで住所を持つ地点名 → 住所 のマップを作成
    const addrMap={};
    cur.forEach(s=>{if(s.name&&s.addr)addrMap[s.name.trim()]=s.addr;});
    // 次タブの地点で、名前一致かつ住所が未設定のものにコピー
    nxt.forEach(s=>{
      if(s.name&&!s.addr&&addrMap[s.name.trim()]){
        s.addr=addrMap[s.name.trim()];
        delete wxStopRes[s.id];wxQueueIds.delete(s.id);
      }
    });
  }
}

