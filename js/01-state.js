/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 01-state.js
   グローバル状態変数・DOMキャッシュ
   ※ 他のすべてのファイルより先に読み込むこと
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

let isEdit=false,isRide=false,editingId=null,currentDay=0;
let manualCurrentId=null,rideViewIdx=0,activeEditStopId=null;
let rideActionVisible=false;
/* ── DOM参照キャッシュ（初回アクセス時に解決） ── */
let _domCache={};
function _dom(id){return _domCache[id]||(_domCache[id]=document.getElementById(id));}
