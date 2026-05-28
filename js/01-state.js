/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 01-state.js
   グローバル状態変数・DOMキャッシュ
   ※ 他のすべてのファイルより先に読み込むこと
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

let isEdit=false,isRide=false,editingId=null,currentDay=0;
let manualCurrentId=null,rideViewIdx=0,activeEditStopId=null;
let rideActionVisible=false;
// 起動時の復元確認が保留中かどうか。trueの間は保存系をガードし、
// localStorageの保存データを空データで上書き破壊しないようにする。
let _pendingRestore=null;
/* ── DOM参照キャッシュ（初回アクセス時に解決） ── */
let _domCache={};
function _dom(id){return _domCache[id]||(_domCache[id]=document.getElementById(id));}
