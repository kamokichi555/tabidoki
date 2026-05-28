/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 05-stop.js
   地点管理（saveStop / delStop / cascadeFrom / sort / getStatus）
   依存: 00-constants.js（EC/LIMIT）, 02-utils.js（sanitize/toMin等）
   実行時依存: data, currentDay, editingId, wxStopRes, wxQueueIds,
              save, render, syncBorderAddr, showAppError, showInfoToast
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

function cascadeFrom(di,si,oldDep){
  try{const od=toMin(oldDep),nd=toMin(data.days[di].stops[si].dep);if(od===null||nd===null||od===nd)return;const delta=nd-od;for(let i=si+1;i<data.days[di].stops.length;i++){const s=data.days[di].stops[i];if(s.arr)s.arr=fromMin(toMin(s.arr)+delta);if(s.dep)s.dep=fromMin(toMin(s.dep)+delta);}}
  catch(e){showAppError(EC.CASCADE,e);}
}
function getStatus(s,idx,ds,cdi){
  if(manualCurrentId===null) return idx===0?'current':'upcoming';
  if(cdi===-1) return idx===0?'current':'upcoming';
  // 表示中の日(currentDay)が現在地のある日(cdi)より前なら通過済み=past、後なら未到達=upcoming
  if(currentDay!==cdi) return currentDay<cdi?'past':'upcoming';
  if(s.id===manualCurrentId) return 'current';
  const ci=ds.findIndex(x=>x.id===manualCurrentId);
  if(ci!==-1) return idx<ci?'past':'upcoming';
  return idx===0?'current':'upcoming';
}
function saveStop(){
  _dbgLog('saveStop:in', _dbgSnapshot);
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  const name=sanitize(_dom('inp-name').value,LIMIT.name);
  if(!name){showValError('地点名を入力してください');return;}
  const addr=sanitize(_dom('inp-addr').value,LIMIT.addr);
  const newArr=_dom('inp-arr').value,newDep=_dom('inp-dep').value;
  if(!isTimeOrderOk(newArr,newDep)){showValError('到着時刻は出発時刻より前に設定してください');return;}
  const note=sanitize(_dom('inp-note').value,LIMIT.note);
  const log=sanitize(_dom('inp-log')?.value||'',LIMIT.log);
  const actArr=isValidTime(_dom('inp-act-arr')?.value||'')?(_dom('inp-act-arr')?.value||''):'';
  const actDep=isValidTime(_dom('inp-act-dep')?.value||'')?(_dom('inp-act-dep')?.value||''):'';
  const fuel=_dom('fuel-check-box')?.classList.contains('checked')||false;
  const old=_dom('val-error');if(old)old.remove();
  try{
    const ds=data.days[currentDay].stops;
    let updatedId=null; // 更新時のID退避（setFormAdd()でeditingId=nullになるため事前に保存）
    if(editingId!==null){
      updatedId=editingId;
      const idx=ds.findIndex(s=>s.id===editingId);
      if(idx===-1){showAppError(EC.STOP,new Error('編集中の地点が見つかりません'));setFormAdd();return;}
      const oldDep=ds[idx].dep;
      ds[idx]={...ds[idx],name,addr,arr:newArr,dep:newDep,note,log,actArr,actDep,fuel};
      // 住所または日付が変わった可能性があるためキャッシュクリア
      delete wxStopRes[editingId];wxQueueIds.delete(editingId);
      if(newDep&&oldDep!==newDep)cascadeFrom(currentDay,idx,oldDep);
      // B案: 編集しても並び順は変えない（順序はユーザーのドラッグ/整列ボタンに委ねる）
      setFormAdd();activeEditStopId=null;
    }else{
      if(ds.length>=LIMIT.stopsPerDay){showValError(`地点は1日${LIMIT.stopsPerDay}件までです`);return;}
      const newId=Date.now().toString(36)+Math.random().toString(36).slice(2);
      ds.push({id:newId,name,addr,arr:newArr,dep:newDep,note,log,actArr,actDep,fuel});
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
function delStop(id){
  _dbgLog('delStop',()=>({id,snap:_dbgSnapshot()}));
  if(_pendingRestore) return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  try{
    delete wxStopRes[id];wxQueueIds.delete(id);
    data.days[currentDay].stops=data.days[currentDay].stops.filter(s=>s.id!==id);
    if(id===manualCurrentId){manualCurrentId=null;_cachedCdiForId=null;}
    if(editingId===id)setFormAdd();syncBorderAddr();save();render();
    showInfoToast('🗑️ 地点を削除しました',2000);
  }catch(e){showAppError(EC.STOP,e);}
}
function setCurrentStop(id){
  _dbgLog('setCurrentStop',{id});
  manualCurrentId=id;_cachedCdiForId=null; // cdiキャッシュ無効化
  const fi=currentDayIdxOf(id);if(fi!==-1)rideViewIdx=fi;
  save();if(isRide)renderRide();else render();
}
