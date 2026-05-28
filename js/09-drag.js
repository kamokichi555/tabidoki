/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 09-drag.js
   タッチ / マウス ドラッグ並び替え
   実行時依存: data, currentDay, editingId, save, render, updateDragHint
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ タッチドラッグ ══ */
let tDragId=null,tDragEl=null,tGhost=null,tStartY=0,tStopRows=null;
function _cancelTouchDrag(){
  if(!tGhost)return;
  if(tStopRows)tStopRows.forEach(row=>row.classList.remove('drag-over'));
  if(tDragEl)tDragEl.classList.remove('dragging');
  tGhost.remove();tGhost=null;
  tDragId=null;tDragEl=null;tStopRows=null;
  updateDragHint();
}
function onTouchDragStart(e,id){if(_pendingRestore)return;if(editingId!==null)return;e.stopPropagation();tDragId=id;tDragEl=document.querySelector(`.stop-row[data-id="${id}"]`);if(!tDragEl){tDragId=null;return;}tStartY=e.touches[0].clientY;tStopRows=document.querySelectorAll('.stop-row');tGhost=tDragEl.cloneNode(true);const r=tDragEl.getBoundingClientRect();Object.assign(tGhost.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',opacity:'.7',pointerEvents:'none',zIndex:'9999',transform:'scale(1.02)',background:'var(--bg2)',borderRadius:'10px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',transition:'none'});document.body.appendChild(tGhost);tDragEl.classList.add('dragging');updateDragHint();}
function onTouchDragMove(e){if(!tGhost)return;e.preventDefault();e.stopPropagation();const t=e.touches[0];const dy=t.clientY-tStartY;const r=tDragEl.getBoundingClientRect();tGhost.style.top=(r.top+dy)+'px';tStopRows.forEach(row=>row.classList.remove('drag-over'));const el=document.elementFromPoint(t.clientX,t.clientY);if(!el)return;const row=el.closest('.stop-row');if(row&&row!==tDragEl)row.classList.add('drag-over');}
function onTouchDragEnd(e){if(!tGhost)return;e.stopPropagation();const t=e.changedTouches[0];tStopRows.forEach(row=>row.classList.remove('drag-over'));tDragEl.classList.remove('dragging');tGhost.remove();tGhost=null;const el=document.elementFromPoint(t.clientX,t.clientY);if(el){const tr=el.closest('.stop-row[data-id]');if(tr){const tId=tr.dataset.id;if(tId!==tDragId){const ds=data.days[currentDay].stops;const si=ds.findIndex(s=>s.id===tDragId),ti=ds.findIndex(s=>s.id===tId);if(si>=0&&ti>=0){const[m]=ds.splice(si,1);ds.splice(ti,0,m);save();render();}}}}tDragId=null;tDragEl=null;tStopRows=null;updateDragHint();}

/* ── PC マウスドラッグ ── */
let mDragId=null,mDragEl=null,mStopRows=null,mGhost=null,mStartY=0,mOffsetY=0;
function onMouseDragStart(e,id){
  if(_pendingRestore)return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  if(editingId!==null)return;
  if(mGhost)return; // 既にドラッグ中 → mousemove/mouseup リスナーの重複登録を防ぐ
  e.preventDefault();
  mDragId=id;
  mDragEl=document.querySelector(`.stop-row[data-id="${id}"]`);
  if(!mDragEl){mDragId=null;return;}
  mStartY=e.clientY;
  const r=mDragEl.getBoundingClientRect();
  mOffsetY=e.clientY-r.top;
  mStopRows=document.querySelectorAll('.stop-row');
  mGhost=mDragEl.cloneNode(true);
  Object.assign(mGhost.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',opacity:'.7',pointerEvents:'none',zIndex:'9999',transform:'scale(1.02)',background:'var(--bg2)',borderRadius:'10px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',transition:'none'});
  document.body.appendChild(mGhost);
  mDragEl.classList.add('dragging');
  document.addEventListener('mousemove',onMouseDragMove);
  document.addEventListener('mouseup',onMouseDragEnd);
}
function onMouseDragMove(e){
  if(!mGhost)return;
  mGhost.style.top=(e.clientY-mOffsetY)+'px';
  mStopRows.forEach(r=>r.classList.remove('drag-over'));
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(!el)return;
  const row=el.closest('.stop-row');
  if(row&&row!==mDragEl)row.classList.add('drag-over');
}
function onMouseDragEnd(e){
  document.removeEventListener('mousemove',onMouseDragMove);
  document.removeEventListener('mouseup',onMouseDragEnd);
  if(!mGhost){mDragId=null;mDragEl=null;mStopRows=null;return;}
  mStopRows.forEach(r=>r.classList.remove('drag-over'));
  mDragEl.classList.remove('dragging');
  mGhost.remove();mGhost=null;
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(el){
    const tr=el.closest('.stop-row[data-id]');
    if(tr){
      const tId=tr.dataset.id;
      if(tId!==mDragId){
        const ds=data.days[currentDay].stops;
        const si=ds.findIndex(s=>s.id===mDragId),ti=ds.findIndex(s=>s.id===tId);
        if(si>=0&&ti>=0){const[m]=ds.splice(si,1);ds.splice(ti,0,m);save();render();}
      }
    }
  }
  mDragId=null;mDragEl=null;mStopRows=null;
}

