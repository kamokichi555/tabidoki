/* ══════════════════════════════════════════════════════
   旅刻 mk17 — 01-state.js
   グローバル状態を1オブジェクト(S)に集約
   ※ 他のすべてのファイルより先に読み込むこと
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
// @ts-check



/* アプリの可変状態は全て S.* に集約する。
   「どの関数がどの状態を変えるか」を S.xxx で grep 一発で追えるようにするのが目的。
   新しい状態を足すときは必ずここへ追加すること。
   型は types.d.ts の AppState を参照（null初期化フィールドに実値を代入できるよう明示）。 */
/** @type {AppState} */
export const S={
  isEdit:false,            // 編集モードを表示中か
  isRide:false,            // 走行（ライド）モードを表示中か
  editingId:null,          // 編集中の地点ID（新規追加フォームのときは null）
  currentDay:0,            // 表示中の日（0始まり）
  manualCurrentId:null,    // 手動で「現在地」に設定された地点ID
  rideViewIdx:0,           // 走行画面で表示中の地点インデックス
  activeEditStopId:null,   // 編集フォームで開いている地点ID
  rideActionVisible:false, // 走行画面の操作ボタンを表示中か
  // 起動時の復元確認が保留中のデータ。null以外の間は保存系をガードし、
  // localStorageの保存データを空データで上書き破壊しないようにする。
  _pendingRestore:null,
};

/* データ変更の可否を1箇所で判定する。
   起動時復元の確認待ち（S._pendingRestore != null）の間は false を返し、
   各データ変更関数の先頭ガード `if(!_canEditData()) return;` をここに集約する。 */
export function _canEditData(){ return S._pendingRestore===null; }

/* 行程データ本体。モジュール間で共有するためここで保持する。
   import した data は読み取り専用バインディング（再代入不可）なので、
   差し替えは必ず setData() 経由で行うこと（読み取りは import した data をそのまま使う）。 */
/** @type {TouringData} */
export let data;
/** @param {TouringData} v */
export function setData(v){ data=v; }

/* ── DOM参照キャッシュ（初回アクセス時に解決） ── */
export let _domCache={};
export function _dom(id){return _domCache[id]||(_domCache[id]=document.getElementById(id));}
