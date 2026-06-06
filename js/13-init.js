/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 13-init.js
   起動シーケンス（最後に読み込む）
   依存: すべてのJSファイル
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { DEFAULT, SK, LSK } from './00-constants.js';
import { S, _canEditData, data, setData, _dom } from './01-state.js';
import { _migrateData, _resolveCurrentStopId, _sanitizeImportedData } from './02-utils.js';
import { restoreFromStorage, save, _pushBackup } from './03-storage.js';
import { ensureAllWeather } from './04-weather.js';
import { _flushRouteSave, _flushTitle, _syncTitleInput, _updateStickyTops, currentDayFlat, renderTabs, syncBorderAddr } from './06-day.js';
import { _depCountdownHtml, _seg7svg, initNormalSwipe, initRideSwipe, render, showInfoToast, updateClock } from './07-render.js';
import { _initTheme, _initFontSize, _updateNoteCount, syncNotePreview, toggleEdit, toggleRide } from './08-mode.js';
import { _renderSplash } from './11-overlays.js';
import { _dbgLog } from './12-debug.js';
import { _gpsInit } from './14-gps.js';
import './_expose.js'; // インラインハンドラを window 公開＋09-drag/10-pickersを読み込む（副作用import）


/* ── localStorageからの自動復元 ── */
// S._pendingRestore は 01-state.js で宣言済み（保存系から参照するためグローバル共有）
S._pendingRestore=null;
try{
  const _raw=localStorage.getItem(SK);
  if(_raw){
    const _p=JSON.parse(_raw);
    if(_p&&typeof _p==='object'&&Array.isArray(_p.days)){
      _migrateData(_p); // 旧バージョン移行（02-utils、_applyImportedDataと共用）
      _sanitizeImportedData(_p);
      if(!_p.days.length) _p.days=[{date:'',routeUrl:'',stops:[]}];
      // 地点データがある場合は読み込むか確認する
      const _hasStops=(_p.days||[]).some(d=>d.stops&&d.stops.length>0);
      if(!_hasStops){
        // 地点なし（空データ）はそのまま読み込む
        setData(_p);
      }else{
        // 地点あり: 同期confirmは初回描画前（白画面）に出てしまうため、
        // ここでは適用せず保留にし、スプラッシュ描画後にアプリ上で確認する
        S._pendingRestore=_p;
      }
    }
  }
}catch(e){console.warn('[旅刻] 自動復元に失敗:',e);_dbgLog('autorestore_failed',{err:String(e&&e.message||e).slice(0,200)});}
if(!data) setData(JSON.parse(JSON.stringify(DEFAULT)));

{
  S.manualCurrentId=_resolveCurrentStopId(data); // currentStopId 解決＋実在チェック（02-utils、_applyImportedDataと共用）
}
// 起動時に現状(=今日いじり始める前の状態)を1世代退避。
// 復元確認が保留中(_pendingRestore)はdataが空のため_pushBackup側で自動スキップされる。
_pushBackup();
// スプラッシュ表示中に天気取得を先行開始（DOM構築より先に通信を走らせる）
setTimeout(()=>ensureAllWeather(),0);
/* ══ 初期化 ══ */

_initTheme();
_initFontSize();
if(typeof _gpsInit==='function') _gpsInit();


syncBorderAddr();
// 復元の確認が保留中は保存データを上書きしないよう初期saveをスキップ
if(!S._pendingRestore) save();
initRideSwipe();
initNormalSwipe();
// メモ欄(textarea)の自動高さ調整：入力のたびに高さを再計算
(()=>{const _mt=document.getElementById('note-modal-text');if(_mt)_mt.addEventListener('input',_updateNoteCount);syncNotePreview();})();
renderTabs();
updateClock();
render();
// レイアウト確定後にheight計算
requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));
// スプラッシュ画面のエピソード・タイトルを描画
_renderSplash();
// ── キーボード表示対応 ──────────────────────────────
// 入力欄の最も近いスクロール可能な祖先要素を返す（なければ null）
// キーボードを出さない入力＝スクロール不要。チェックボックス等に加え、
// 日付/時刻系はネイティブのピッカー（ダイアログ）が重なって開きキーボードを出さないため対象外。
// （type=number は数値キーボードが出るので対象に含める＝ここには入れない）
export const _NO_KB_TYPES=new Set(['checkbox','radio','range','file','button','submit','reset','color','image','hidden','date','time','datetime-local','month','week']);
export function _scrollableAncestor(el){
  let n=el&&el.parentElement;
  while(n&&n!==document.body&&n!==document.documentElement){
    const oy=getComputedStyle(n).overflowY;
    if(oy==='auto'||oy==='scroll') return n;
    n=n.parentElement;
  }
  return null;
}
// フォーカス中の入力欄を、そのスクロール領域の上端付近まで送ってキーボードに隠れないようにする。
// normal-view・設定オーバーレイなど「スクロール領域内の入力」に共通で適用。
// ヘッダーの日付/ルートURLやピッカーの検索欄はスクロール領域を持たない＝常に可視なので何もしない。
export function _scrollFocusedInputIntoView(){
  const el=document.activeElement;
  if(!el||(el.tagName!=='INPUT'&&el.tagName!=='TEXTAREA')) return;
  // キーボードを出さない入力（チェックボックス等）は対象外
  if(el.tagName==='INPUT'&&_NO_KB_TYPES.has((el.type||'').toLowerCase())) return;
  const sc=_scrollableAncestor(el);
  if(!sc) return;
  // 可視帯（visualViewport）をレイアウト座標で把握する。
  // resizes-visual では visualViewport.offsetTop の分ずれるため考慮する。
  const vv=window.visualViewport;
  const vTop=vv?vv.offsetTop:0;
  const vBottom=vTop+(vv?vv.height:window.innerHeight); // ＝キーボード（IME）上端
  const r=el.getBoundingClientRect();
  const scTop=sc.getBoundingClientRect().top;           // スクロール領域上端＝ヘッダー/見出し直下
  const visTop=Math.max(scTop,vTop);                    // 入力が見えてよい上端
  const gap=24; // 入力欄の下端をキーボードの少し上に置くための余白
  // 入力欄がキーボード上の可視高さより背が高い場合（高さのあるtextarea等）は、
  // 下端を合わせると内容末尾まで送られて大きな余白が見えてしまう。
  // その場合は上端をヘッダー直下に合わせ、書き出しが見える状態にする。
  const visH=(vBottom-gap)-visTop;
  if(r.height>visH){
    const topTarget=sc.scrollTop+(r.top-(visTop+8));
    const nt=Math.max(0,topTarget);
    if(Math.abs(nt-sc.scrollTop)>1) sc.scrollTop=nt;
    return;
  }
  // 既に「下端がキーボードより上」かつ「上端がヘッダーより下」に収まっていれば何もしない
  if(r.bottom<=vBottom-gap && r.top>=visTop+4) return;
  // 目標: 入力欄の下端を (キーボード上端 − gap) に合わせる（scrollTopを増やすと内容が上へ動く）
  let newTop = sc.scrollTop + (r.bottom - (vBottom-gap));
  // 上に行き過ぎて入力欄の上端がヘッダー直下より上へ潜らないようクランプ
  const maxForTop = sc.scrollTop + (r.top - (visTop+8));
  if(newTop>maxForTop) newTop=maxForTop;
  newTop=Math.max(0,newTop);
  // smoothはビューポート変化やブラウザ既定スクロールと競合して中断されやすいので即時で確実に動かす
  if(Math.abs(newTop - sc.scrollTop)>1) sc.scrollTop=newTop;
}
// キーボード/ビューポートが落ち着くタイミングが端末ごとにまちまちなので、
// 即時スクロールを複数回リトライして確実に可視化する（可視になれば上のガードで以降は無動作）。
export let _kbScrollTimers=[];
export function _scheduleKbScroll(){
  _kbScrollTimers.forEach(clearTimeout); _kbScrollTimers=[];
  requestAnimationFrame(_scrollFocusedInputIntoView);
  [80,200,380,600].forEach(d=>_kbScrollTimers.push(setTimeout(_scrollFocusedInputIntoView,d)));
}
// visualViewport resize: sticky高さ再計算 + フォーカス中の入力欄を可視位置へ
(window.visualViewport||window).addEventListener('resize',()=>{
  _updateStickyTops();
  const el=document.activeElement;
  if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')) _scheduleKbScroll();
});
// focusin: キーボード表示時に、フォーカス中の入力欄を可視位置へ送る。
// （旧実装にあった「時計を非表示にしてヘッダー高さを削減」は廃止した。時計とヘッダー右ボタンの
//   高さがほぼ等しく行高はボタン側で決まるため高さ削減効果がほぼ無く、入力のたびに時計が消える
//   挙動だけが残っていた。表示領域の確保は _scrollFocusedInputIntoView が担う。）
document.addEventListener('focusin',e=>{
  const el=e.target;
  if(el.tagName!=='INPUT'&&el.tagName!=='TEXTAREA') return;
  // キーボードが既に開いた状態で別の入力欄へ移ったとき（resizeが発火しない）にも追従させる
  _scheduleKbScroll();
},true);
// 時刻は15秒ごと更新（renderRide全再描画しない）
setInterval(()=>{
  updateClock();
  if(!S.isRide) return;
  // 発車カウントダウンのみ差し替え（全再描画なし）
  const flat=currentDayFlat();
  if(!flat.length) return;
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId); // currentDayIdxOf→flatから直接検索
  const vs=flat[S.rideViewIdx];
  if(S.rideViewIdx!==rci||!vs?.dep) return;
  const html=_depCountdownHtml(vs.dep);
  if(!html) return;
  const cd=document.querySelector('.ride-dep-cd');
  if(cd) cd.outerHTML=html;
},15000);
// 走行モード自動復帰: 前回バックグラウンド化時に走行中だったかをlocalStorageから読む。
// 走行中に画面消灯→OSがページ破棄→再読込されても、走行画面とGPS追跡へ自動で戻すため。
const _wasRiding=(()=>{try{return localStorage.getItem(LSK.ride)==='1';}catch(e){return false;}})();

if(!S.isEdit&&!S.isRide&&_wasRiding&&S._pendingRestore){
  // 走行中の再読込からの復帰。確認ダイアログを挟まず前回データを復元して走行モードへ戻す。
  // （同一セッションの行程であることが明らかなため、ここでは確認しない）
  S._pendingRestore=null;     // 保存ガード解除（復元確認「はい」枝と同じ扱い）
  restoreFromStorage(true);   // silent: 行程と現在地マーカーを再適用（「読み込みました」トーストは出さない）
  // 重要: restoreFromStorage(=_applyImportedData) は描画・isEdit設定・「isRideならライド解除」を
  // requestAnimationFrame 内で後追い実行する。よって同期で先に toggleRide すると、直後の
  // そのrAFが入ったばかりの走行モードを解除してしまう（GPSも止まる）。
  // rAFコールバックは登録順に同フレームで走るため、ここで登録するコールバックは
  // restoreFromStorage が登録したものの後に実行される。そこで走行モードへ入る。
  requestAnimationFrame(()=>{
    // この時点でrestoreFromStorage側のrAFが S.isEdit=true にしているため戻す。
    // 戻さないと toggleRide が「走行モードに切り替えますか？」の確認を出す。
    S.isEdit=false; _dom('edit-area').style.display='none';
    toggleRide();             // S.isEdit=false のため確認は出ない。内部でGPS/WakeLockも再開
    _dbgLog('ride_autoresume',{});
  });
}else if(!S.isEdit&&!S.isRide){
  toggleEdit();
  // ブラウザのフォーム値復元（bfcache/オートフィル）がdata.titleと食い違うのを防ぐため、
  // 描画が落ち着いた後にもう一度data.titleで入力欄を上書き同期する
  requestAnimationFrame(()=>requestAnimationFrame(()=>_syncTitleInput()));
  if(!_canEditData()){
    // 初回描画（スプラッシュ表示）が済んでから確認する。
    // 少し遅延させることで白画面ではなくスプラッシュ上にダイアログが出る。
    setTimeout(()=>{
      // 待機中にファイル/サンプル読込などで保留が解除された場合は確認不要（null参照も防ぐ）
      if(!S._pendingRestore) return;
      const _total=S._pendingRestore.days.reduce((s,d)=>s+(d.stops?.length||0),0);
      const _ok=confirm(`前回の行程データが保存されています（${_total}地点）。\n読み込みますか？`);
      S._pendingRestore=null; // 確認に応答したので保留解除（以降の保存系ガードを外す）
      if(_ok){
        restoreFromStorage(); // localStorageは保持済みなので再読込で適用
      }else{
        // 新規開始: data は空のままなので、ブラウザが復元した入力欄の値を明示的にクリアする。
        // _syncTitleInput=ツーリング名、renderTabs=ルートURL/日付欄をdataから再同期。
        // 前回データはlocalStorageに温存するため、能動編集まで背面化保存で空dataを書き込ませない。
        S._freshStartPreserve=true;
        _syncTitleInput();
        renderTabs();
        // localStorageの前回データはあえて上書きせず保持する（restoreFromStorageで復旧できるように）。
        // 復旧用ボタン付きトーストを表示。
        showInfoToast('📂 前回データは読み込んでいません',10000,{label:'読み込む',fn:restoreFromStorage});
      }
    },800);
  }else{
    // 保存データなし（または空データを即適用）の場合のみ案内トーストを表示
    // （復元成功時のフィードバックは restoreFromStorage→_applyImportedData 側で表示される）
    setTimeout(()=>{
      showInfoToast('📂 データの読み込みをしてください',4000);
    },5600);
  }
}
// bfcache復帰やブラウザのフォーム値復元の後でも、ツーリング名欄をdata.titleに再同期する
// （Chromeはautocomplete=offを無視して入力値を復元することがあるため、JS側で確実に上書き）
window.addEventListener('pageshow',()=>{
  // ブラウザのフォーム値復元はpageshow後に非同期で行われることがあるため、
  // 少し遅延させて確実にその後でdata.titleへ上書き同期する
  if(S.isEdit){ _syncTitleInput(); setTimeout(()=>{ if(S.isEdit) _syncTitleInput(); },120); }
});

// アプリが背面化／終了する瞬間に、デバウンス（400ms）未確定のツーリング名・ルートURLを確定保存する。
// これが無いと「入力直後400ms以内に、フォーカスを外さないままホームに戻る／OSがPWAを強制終了」した場合に
// 直近の入力が失われる。pagehide（離脱・bfcache入り）と visibilitychange→hidden（画面消灯・背面化）の
// 両方で発火させ、バックグラウンドでデバウンスタイマーが間引かれるケースも塞ぐ。
// localStorageは同期書き込みなので、フリーズ前に確実に永続化される。_flush系・saveは _canEditData ガード済み。
function _persistPendingEdits(){
  // 走行モード自動復帰用: バックグラウンド化（=破棄されうる瞬間）の走行状態を記録する。
  // _freshStartPreserveガードより前に置き、走行状態は常に正しく残す。
  try{localStorage.setItem(LSK.ride,S.isRide?'1':'0');}catch(e){}
  // 復元確認で「いいえ」を選んだ直後など、前回データをlocalStorageに温存中（_freshStartPreserve）は
  // 背面化のたびに空dataでsave()して前回データを破壊し、[読み込む]復旧を不能にしないよう保存しない。
  // ユーザーが能動編集すればsave()側でフラグが解除され、以降は通常どおり背面化保存が効く。
  if(S._freshStartPreserve) return;
  _flushTitle();      // 未確定タイトル → data.title（save非経由・メモリ反映のみ）
  _flushRouteSave();  // 未確定ルートURL → data.days[].routeUrl
  save();             // localStorageへ確定
}
window.addEventListener('pagehide',_persistPendingEdits);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) _persistPendingEdits(); });

// 縦向き固定（Android Chrome対応・iOS Safari/一部デスクトップはlock未実装のため無視）
// ※ lock() の呼び出しも optional-chain する。screen.orientation はあるが lock が
//   関数でない環境（iOS Safari等）で同期TypeErrorが投げられ、起動時にエラートースト
//   が出るのを防ぐ。戻り値がPromiseでない場合に備え catch も optional-chain。
try{ screen.orientation?.lock?.('portrait')?.catch?.(()=>{}); }catch(e){}

// ── 走行用時計のラスタ・プリウォーム ───────────────────────────────
// 初回だけ「走行画面に入ると時計表示がワンテンポ遅れる」現象への対処。
// 原因はJS処理（toggleRideは実測27ms）ではなく、走行用の大サイズ(clamp 36〜72px)＋
// ダークモードのグロー(feGaussianBlur)時計SVGを、その大きさ・フィルタ込みで初めて
// ラスタライズするブラウザ側コスト。toggleRideのJSログには現れず、初回ペイントだけ遅れる。
// → 起動後の空き時間に、同じ大サイズ＋グローのSVGを一度オフスクリーンで実際に描画させ、
//   ラスタキャッシュを温めておく。2回目以降が速いのと同じ状態を初回前に作る。
// 表示はさせない（画面外＋aria-hidden）。S.isRideの一時切替は同期ブロック内で必ず元へ戻す。
function _prewarmRideClock(){
  if(!document.body) return;
  const prevRide=S.isRide;
  let svg='';
  try{
    S.isRide=true;                // _seg7svgを走行用の大サイズ分岐で生成させる
    svg=_seg7svg('88:88');        // 全セグ点灯＝グロー適用面積を最大化して確実に温める
  }catch(e){ svg=''; }
  finally{ S.isRide=prevRide; }   // 例外の有無に関わらず必ず復元（走行状態の汚染を防ぐ）
  if(!svg) return;
  try{
    const box=document.createElement('div');
    box.setAttribute('aria-hidden','true');
    // 画面外へ。display:noneだとラスタされないため、可視扱いのまま視界外へ追い出す。
    Object.assign(box.style,{position:'fixed',left:'-99999px',top:'0',pointerEvents:'none',zIndex:'-1'});
    box.innerHTML=svg;
    document.body.appendChild(box);
    void box.offsetHeight;          // 同期レイアウトを強制
    // 2フレーム回してペイント＝ラスタライズを発生させてから撤去
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ try{box.remove();}catch(e){} }));
  }catch(e){}
}
// スプラッシュ表示中の空き時間に実行（起動直後の重い処理とは競合させない）
if('requestIdleCallback' in window){ requestIdleCallback(_prewarmRideClock,{timeout:2000}); }
else{ setTimeout(_prewarmRideClock,800); }
