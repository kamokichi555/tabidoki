/* ══════════════════════════════════════════════════════
   旅刻 mk17 — 09-drag.js
   タッチ / マウス ドラッグ並び替え
   実行時依存: data, S.currentDay, S.editingId, save, render, updateDragHint
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { EC } from './00-constants.js';
import { S, _canEditData, data } from './01-state.js';
import { save } from './03-storage.js';
import { render, showAppError } from './07-render.js';
import { updateDragHint } from './08-mode.js';
import { _dbgLog } from './12-debug.js';
/* ══ タッチドラッグ ══
   仕組み: ドラッグ開始で対象行(.stop-row)の複製(tGhost)を position:fixed で重ね、指の移動に
   合わせて動かす。指の真下の要素は elementFromPoint で取得し、ドロップ候補行に .drag-over を
   付けてハイライト。指を離したら _commitReorder で配列を並び替え→保存→再描画。元の行には
   .dragging（半透明）を付与。touch版・mouse版は同じ流れで、確定処理だけ _commitReorder に共通化。 */

/* ── 共通: 並び替え確定（touch/mouse 両用）。try/catchで保護しブレッドクラムを記録 ── */
export function _commitReorder(fromId,toId){
  if(!toId||fromId===toId) return;
  try{
    const ds=data.days[S.currentDay].stops;
    const si=ds.findIndex(s=>s.id===fromId),ti=ds.findIndex(s=>s.id===toId);
    if(si>=0&&ti>=0){
      const[m]=ds.splice(si,1);
      ds.splice(ti,0,m);
      _dbgLog('reorder',{from:si,to:ti,id:fromId});
      save();render();
    }
  }catch(e){showAppError(EC.SORT,e);}
}

// 状態: tDragId=掴んでいる行id / tDragEl=元のDOM行 / tGhost=追従する複製 / tStartY=開始Y / tStopRows=開始時の全行
export let tDragId=null,tDragEl=null,tGhost=null,tStartY=0,tStartX=0,tStopRows=null;
// 長押し判定用: タイマーID・長押し確定フラグ
let _tLongPressTimer=null,_tLongPressed=false;
const LONG_PRESS_MS=180;   // 長押し判定時間(ms)
const LONG_PRESS_SLOP=8;   // この距離(px)以上動いたらスクロールとみなしキャンセル

/** 長押しタイマー＆予備状態をクリア（ゴースト生成前の中断用） */
function _clearLongPressTimer(){
  if(_tLongPressTimer!==null){clearTimeout(_tLongPressTimer);_tLongPressTimer=null;}
  _tLongPressed=false;
}

/** ゴーストを生成してドラッグ本開始 */
function _startDragGhost(){
  if(!tDragEl)return;
  tStopRows=document.querySelectorAll('.stop-row');
  tGhost=tDragEl.cloneNode(true);
  const r=tDragEl.getBoundingClientRect();
  Object.assign(tGhost.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',opacity:'.7',pointerEvents:'none',zIndex:'9999',transform:'scale(1.02)',background:'var(--bg2)',borderRadius:'10px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',transition:'none'});
  document.body.appendChild(tGhost);
  tDragEl.classList.add('dragging');
  if(navigator.vibrate)navigator.vibrate(30); // 長押し確定を触覚でフィードバック
  updateDragHint();
}

// ドラッグ中断(touchcancel等): ゴースト除去・ハイライト解除して状態リセット
export function _cancelTouchDrag(){
  _clearLongPressTimer();
  if(tGhost){
    if(tStopRows)tStopRows.forEach(row=>row.classList.remove('drag-over'));
    if(tDragEl)tDragEl.classList.remove('dragging');
    tGhost.remove();tGhost=null;
  }
  tDragId=null;tDragEl=null;tStopRows=null;
  updateDragHint();
}

// 開始: 長押しタイマーをセットし、確定後にゴーストを生成する（即時ドラッグ開始しない）
export function onTouchDragStart(e,id){
  if(!_canEditData())return;
  if(S.editingId!==null)return;
  e.stopPropagation();
  // 予備状態をセット（ゴースト未生成）
  tDragId=id;
  tDragEl=document.querySelector(`.stop-row[data-id="${id}"]`);
  if(!tDragEl){tDragId=null;return;}
  tStartY=e.touches[0].clientY;
  tStartX=e.touches[0].clientX;
  _tLongPressed=false;
  // LONG_PRESS_MS後に長押し確定 → ゴースト生成
  _tLongPressTimer=setTimeout(()=>{
    _tLongPressTimer=null;
    _tLongPressed=true;
    _startDragGhost();
  },LONG_PRESS_MS);
}

// 移動: 長押し確定済みならゴーストを追従・ハイライト。未確定なら距離チェックしてキャンセル判定
export function onTouchDragMove(e){
  if(!_tLongPressed){
    // まだ長押し確定前: 指が動きすぎたらスクロールとみなしてタイマーキャンセル
    if(tDragId!==null&&_tLongPressTimer!==null){
      const t=e.touches[0];
      const dx=t.clientX-tStartX,dy=t.clientY-tStartY;
      if(Math.abs(dx)>LONG_PRESS_SLOP||Math.abs(dy)>LONG_PRESS_SLOP){
        _clearLongPressTimer();
        tDragId=null;tDragEl=null;
      }
    }
    return; // ゴースト未生成なら以降の処理はスキップ
  }
  if(!tGhost)return;
  e.preventDefault();e.stopPropagation();
  const t=e.touches[0];
  const dy=t.clientY-tStartY;
  const r=tDragEl.getBoundingClientRect();
  tGhost.style.top=(r.top+dy)+'px';
  tStopRows.forEach(row=>row.classList.remove('drag-over'));
  const el=document.elementFromPoint(t.clientX,t.clientY);
  if(!el)return;
  const row=el.closest('.stop-row');
  if(row&&row!==tDragEl)row.classList.add('drag-over');
}

// 終了: 長押し確定済みなら並び替え確定。未確定ならタイマーだけクリアして何もしない
export function onTouchDragEnd(e){
  _clearLongPressTimer();
  if(!_tLongPressed||!tGhost){
    // 長押し未確定のまま指を離した(= 短タップ or スクロール) → ドラッグなし
    tDragId=null;tDragEl=null;tStopRows=null;
    return;
  }
  e.stopPropagation();
  const t=e.changedTouches[0];
  tStopRows.forEach(row=>row.classList.remove('drag-over'));
  tDragEl.classList.remove('dragging');
  tGhost.remove();tGhost=null;
  const el=document.elementFromPoint(t.clientX,t.clientY);
  if(el){const tr=el.closest('.stop-row[data-id]');if(tr){_commitReorder(tDragId,tr.dataset.id);}}
  tDragId=null;tDragEl=null;tStopRows=null;
  updateDragHint();
}

/* ── PC マウスドラッグ（タッチ版と同じ仕組み。mousemove/mouseupはdocumentに登録し終了時に解除） ── */
export let mDragId=null,mDragEl=null,mStopRows=null,mGhost=null,mStartY=0,mOffsetY=0;
export function onMouseDragStart(e,id){
  if(!_canEditData())return; // 起動時の復元確認が保留中はdataを変更しない（汚染防止）
  if(S.editingId!==null)return;
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
// 移動: ゴーストを追従させ、カーソルの下の行に .drag-over を付与
export function onMouseDragMove(e){
  if(!mGhost)return;
  mGhost.style.top=(e.clientY-mOffsetY)+'px';
  mStopRows.forEach(r=>r.classList.remove('drag-over'));
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(!el)return;
  const row=el.closest('.stop-row');
  if(row&&row!==mDragEl)row.classList.add('drag-over');
}
// 終了: リスナー解除→カーソルの下の行を確定先として _commitReorder
export function onMouseDragEnd(e){
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
      _commitReorder(mDragId,tr.dataset.id);
    }
  }
  mDragId=null;mDragEl=null;mStopRows=null;
}

/* ── 復帰時の安全リセット ──
   画面消灯・バックグラウンド・bfcache復帰で touchend/touchcancel/mouseup が
   失われると、ゴースト(tGhost/mGhost)が残り対象行に .dragging が付いたままになる
   （走行スワイプのフリーズと同じ系統の不具合）。可視化／pageshow で進行中ドラッグを
   強制終了し、残骸・documentリスナーを確実に除去する。 */
export function _resetDragState(){
  _cancelTouchDrag(); // touch: タイマー・ゴーストをまとめてクリア
  document.removeEventListener('mousemove',onMouseDragMove);
  document.removeEventListener('mouseup',onMouseDragEnd);
  if(mStopRows)mStopRows.forEach(r=>r.classList.remove('drag-over'));
  if(mDragEl)mDragEl.classList.remove('dragging');
  if(mGhost){mGhost.remove();mGhost=null;}
  mDragId=null;mDragEl=null;mStopRows=null;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')_resetDragState();});
window.addEventListener('pageshow',()=>{_resetDragState();});

