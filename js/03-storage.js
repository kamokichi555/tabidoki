/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 03-storage.js
   データ管理（save / share / saveJSON / saveRecord / load / migration）
   依存: 00-constants.js（SK/DEFAULT/LIMIT）, 02-utils.js（sanitize等）
   実行時依存: data, S.currentDay, render, showInfoToast, showAppError
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
// @ts-check

/* --- 自動生成: モジュール依存のインポート --- */
import { APP_VERSION, BACKUP_INTERVAL_MS, BACKUP_MAX, DEFAULT, EC, LIMIT, LSK, SK } from './00-constants.js';
import { S, _canEditData, _dom, data, setData } from './01-state.js';
import { IS_IOS, WEEK, _migrateData, _resolveCurrentStopId, _sanitizeImportedData, actDiff, esc, fmtHM, mdw, parseISODate, stayDur, ymdw } from './02-utils.js';
import { _bumpWxGen, _lsSetItem, wxGen, wxQueue, wxQueueFast, wxQueueIds, wxStopRes } from './04-weather.js';
import { _cachedCdiForId, _flushTitle, _invalidateCdi, _scrollNormalViewToFirstStop, _syncTitleInput, renderTabs } from './06-day.js';
import { _lastClockTs, _resetClockTs, hideInfoToast, render, showAppError, showInfoToast, updateClock } from './07-render.js';
import { _hasAnyStops, setFormAdd, _releaseWakeLock, _syncModeToggle } from './08-mode.js';
import { _closeAllOverlays, _closeOverlay, _lowerHeaderForOverlay } from './11-overlays.js';
import { _dbgLog, _dbgSnapshot } from './12-debug.js';
import { _gpsOnRideEnd } from './14-gps.js';


/* ══ データ管理（localStorage） ══ */

/* ── 全日の登録地点数の合計（空データ判定で共用） ── */
function _totalStops(){return (data.days||[]).reduce((sum,d)=>sum+(d.stops?.length||0),0);}

export function save(){
  // 起動時の復元確認が保留中（S._pendingRestore）は、まだ「新規開始/復元」が未確定。
  // この間に空のdataをlocalStorageへ書き込むと前回データを破壊してしまうため保存しない。
  // 確認に応答すると 13-init.js が S._pendingRestore=null にしてからsave/restoreを行う。
  if(!_canEditData()) return;
  // ここに到達するsave()は能動的な保存（編集・読込等）。背面化保存(_persistPendingEdits)は
  // _freshStartPreserve中はsave()前にreturnするため到達しない。よって到達時点で温存状態を解除し、
  // 以降は通常どおりlocalStorageへ反映する（新規開始を確定）。
  S._freshStartPreserve=false;
  try{
    data.currentStopId=S.manualCurrentId;
    data.version=DEFAULT.version;
    _lsSetItem(SK,JSON.stringify(data));
    _maybeBackup(); // 編集中の世代退避（5分間隔で間引き。本保存の後＝確定済み内容を退避）
  }catch(e){showAppError(EC.SAVE,e);}
}

/* ══ 簡易自動バックアップ ══
   編集のたび(save)・上書き直前・起動時に、現在のdataをLSK.backupへ世代退避する。
   失敗してもアプリ本体は止めない（try/catchで黙殺）。詳細は 00-constants.js の BACKUP_* を参照。 */
let _lastBackupTs=0;
/* 保存済み世代を新しい順の配列で返す（壊れていれば空配列）。各要素: {ts,title,stops,json} */
export function _readBackups(){
  try{const r=localStorage.getItem(LSK.backup);if(r){const a=JSON.parse(r);if(Array.isArray(a))return a;}}catch(e){}
  return [];
}
/* 現在のdataを1世代退避する。空データ(地点0)と「直前世代と同一内容」は取らない。 */
export function _pushBackup(){
  try{
    if(_totalStops()===0) return;                 // 空データは退避しない
    const json=JSON.stringify(data);
    const list=_readBackups();
    if(list[0]&&list[0].json===json) return;      // 直前世代と同一 → 重複排除
    list.unshift({ts:Date.now(),title:data.title||'（タイトルなし）',stops:_totalStops(),json});
    if(list.length>BACKUP_MAX) list.length=BACKUP_MAX; // 新しい3件だけ残す
    _lsSetItem(LSK.backup,JSON.stringify(list));   // 容量超過時は天気/施設キャッシュを先に捨てて再試行（_lsSetItem）
    _lastBackupTs=Date.now();
  }catch(e){/* バックアップ失敗は本体動作を止めない */}
}
/* save()から呼ぶ間引き版（編集中の連続saveで毎回取らない）。 */
export function _maybeBackup(){
  if(Date.now()-_lastBackupTs<BACKUP_INTERVAL_MS) return;
  _pushBackup();
}
/* 「バックアップから復元」モーダル。世代一覧から選ぶと既存の上書き確認付きで読み込む。 */
export function openRestoreBackupModal(){
  const list=_readBackups();
  if(!list.length){showInfoToast('⚠️ バックアップがまだありません',3000);return;}
  const fmt=ts=>{const d=new Date(ts);return `${d.getMonth()+1}/${d.getDate()}(${WEEK[d.getDay()]}) ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  _openChoiceModal({
    id:'restore-backup-overlay',
    closeId:'restore-backup-close',
    title:'🕐 バックアップから復元',
    hint:'⚠️ 復元すると現在の行程は上書きされます',
    items:list.map((b,i)=>({
      id:'restore-backup-'+i,icon:'🕐',
      label:esc(b.title||'（タイトルなし）'),       // タイトルは取り込み時にサニタイズ済みだが念のためエスケープ
      sub:`${fmt(b.ts)} ・${b.stops}地点`,arrow:'↺',
      onClick:()=>_restoreBackup(i),
    })),
  });
}
function _restoreBackup(i){
  const b=_readBackups()[i];
  if(!b){showInfoToast('⚠️ バックアップが見つかりませんでした',3000);return;}
  try{ _applyImportedData(JSON.parse(b.json),b.title); } // skipConfirmなし＝既存の上書き確認・サニタイズ・移行を再利用
  catch(e){ showAppError(EC.LOAD,e); }
}

export function shareItinerary(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから共有文を生成
  const fmtDate=iso=>{
    if(!iso) return '日付未設定';
    const d=parseISODate(iso);
    return d?ymdw(d):iso; // パース不能なら原文を返す（従来挙動）
  };
  const lines=[];
  const title=data.title||'ツーリング行程';
  lines.push('═══════════════════════');
  lines.push(`  ${title}`);
  lines.push('═══════════════════════');
  data.days.forEach((day,di)=>{
    lines.push('');
    lines.push(`【${di+1}日目】${fmtDate(day.date)}`);
    if(!day.stops.length){lines.push('　（地点未登録）');return;}
    day.stops.forEach(s=>{
      lines.push('');
      lines.push(`${s.fuel?'⛽ ':'▶ '}${s.name}`);
      const times=[];
      if(s.arr) times.push(`到着 ${s.arr}`);
      if(s.dep) times.push(`出発 ${s.dep}`);
      if(times.length) lines.push(`  ${times.join('｜')}`);
      if(s.note) lines.push(`  📝 ${s.note}`);
    });
  });
  lines.push('');
  lines.push('───────────────────────');
  lines.push(`  旅刻 / Powered by 鴨吉`);
  const text=lines.join('\n');
  // Web Share APIは使わず常に自前モーダルで全文表示（共有・書き出しと同じ _openTextModal を使用）
  _openTextModal({id:'share-overlay',title:'📋 行程テキスト',text,
    hint:'💡 LINEやメモに貼り付けてバックアップにも',allowShare:false});
}

/* ── 共通: テキスト全文表示モーダル（行程共有・走行記録書き出しで共用） ──
   全文を <pre>.textContent で表示（innerHTML不使用＝XSS安全）。
   📋コピー: navigator.clipboard、失敗時は選択範囲フォールバック。
   opt.allowShare && navigator.share 対応時のみ 📤共有ボタンを出し、
   ファイル共有可ならファイルで、不可・失敗時は本文テキストで共有シートへ。
   opt: {id, title, text, hint?, allowShare?, filename?, mime?} */
export function _openTextModal(opt){
  _closeAllOverlays();
  const ov=document.createElement('div');
  ov.id=opt.id;
  Object.assign(ov.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
  const canShare=!!opt.allowShare&&typeof navigator!=='undefined'&&typeof navigator.share==='function';
  ov.innerHTML=`<div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:440px;max-height:92dvh;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <span style="font-weight:700;font-size:16px">${opt.title}</span>
      <button id="${opt.id}-close" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch">
      <pre id="${opt.id}-text" style="margin:0;white-space:pre-wrap;word-break:break-word;background:var(--bg3);border:1.5px solid var(--border2);border-radius:10px;color:var(--text2);font-size:14px;line-height:1.8;padding:12px;font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"></pre>
    </div>
    <button id="${opt.id}-copy" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0">📋 クリップボードにコピー</button>
    ${canShare?`<button id="${opt.id}-share" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0;background:var(--bg3)">📤 共有 / ファイルに保存</button>`:''}
    <div style="font-size:12px;color:var(--text3);text-align:center;flex-shrink:0">${opt.hint||''}</div>
  </div>`;
  ov.addEventListener('click',e=>{if(e.target===ov) _closeOverlay(opt.id);}); // 背景タップで閉じる
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  const pre=document.getElementById(opt.id+'-text');
  pre.textContent=opt.text;
  const closeBtn=document.getElementById(opt.id+'-close');
  if(closeBtn) closeBtn.onclick=()=>_closeOverlay(opt.id);

  // 📋コピー（clipboard→失敗時は選択範囲フォールバック）
  const copyBtn=document.getElementById(opt.id+'-copy');
  if(copyBtn) copyBtn.onclick=async()=>{
    try{
      await navigator.clipboard.writeText(pre.textContent);
      copyBtn.textContent='✅ コピーしました';
      copyBtn.style.background='var(--green)';copyBtn.style.color='#000';
      setTimeout(()=>_closeOverlay(opt.id),1200);
    }catch(e){
      const r=document.createRange();r.selectNode(pre);
      window.getSelection().removeAllRanges();window.getSelection().addRange(r);
    }
  };

  // 📤共有（allowShare かつ対応端末のみ）。ファイル共有可ならファイルで、不可・失敗時は本文テキストへ。
  const shareBtn=canShare?document.getElementById(opt.id+'-share'):null;
  if(shareBtn) shareBtn.onclick=async()=>{
    // MIMEは呼び出し元(blobType)を使い拡張子と不一致にしない（例: .json を text/plain で渡すとiOSが無言でrejectする）
    const tryFileShare=async()=>{
      const type=opt.mime||'text/plain';
      let file;
      try{ file=new File([opt.text],opt.filename||'旅刻_記録.txt',{type}); }catch(e){ return false; }
      if(!(navigator.canShare&&navigator.canShare({files:[file]}))) return false;
      await navigator.share({files:[file],title:opt.filename||'旅刻'});
      return true;
    };
    try{
      const ok=await tryFileShare();
      if(!ok) await navigator.share({title:opt.filename||'旅刻',text:opt.text});
    }catch(e){
      // ユーザーが共有シートを閉じた(AbortError)なら何もしない。それ以外は本文テキスト共有でリトライ。
      if(e&&e.name==='AbortError') return;
      try{ await navigator.share({title:opt.filename||'旅刻',text:opt.text}); }
      catch(e2){ if(!(e2&&e2.name==='AbortError')) showInfoToast('⚠️ 共有できませんでした。コピーをお使いください',3000); }
    }
  };
}

/* ── 共通: テキストをファイルとして保存 ──
   PC: Blob+aタグでダウンロード。
   iOS: タブを開く方式(data:/blob: URL)はSafari/PWAでブロックや空白タブになるため、
        shareItineraryと同じ画面内オーバーレイで全文表示し、コピー/共有(ネイティブ共有シート)で取り出す。
   opt: {text, filename, blobType, btnId, desktopToast} */
export function downloadTextFile(opt){
  const btn=opt.btnId?document.getElementById(opt.btnId):null;
  const flash=(t,bg,ms)=>{if(!btn)return;const orig=btn.textContent;btn.textContent=t;btn.style.background=bg;btn.style.color='#000';setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},ms);};
  if(IS_IOS){
    _openExportOverlay(opt.text,opt.filename,opt.blobType);
  }else{
    const blob=new Blob([opt.text],{type:opt.blobType});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=opt.filename;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    flash('✅','var(--green)',2000);
    if(opt.desktopToast) showInfoToast(opt.desktopToast,3000);
  }
}

/* ── iOS向け: テキスト書き出し（共有モーダルと同じ _openTextModal を使用） ──
   タブを開かないのでSafari通常タブ/ホーム画面PWA/オフラインのいずれでも安定動作する。
   共有ボタン付き（ファイル共有可ならファイルで、不可ならテキスト本文で共有シートを開く）。*/
export function _openExportOverlay(text,filename,mime){
  _openTextModal({id:'export-overlay',title:'📝 走行記録',text,filename,mime,allowShare:true,
    hint:'💡 コピーしてLINEやメモに貼り付け／共有から「ファイルに保存」もできます'});
}

/* ── 共通: 2択モーダル（保存／読込で共用） ──
   保存と読込はタイトル・2項目（アイコン/見出し/説明/矢印/動作）・フッター注記が違うだけで
   枠組みは完全に同じなので1関数に集約する。
   cfg: {id, title, hint, items:[{icon,label,sub,arrow,onClick}]} */
function _openChoiceModal(cfg){
  _closeAllOverlays();
  const ov=document.createElement('div');
  ov.id=cfg.id;
  Object.assign(ov.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
  const itemsHtml=cfg.items.map(it=>`
      <button id="${it.id}" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);text-align:left;width:100%">
        <span style="font-size:22px">${it.icon}</span>
        <span style="flex:1"><span style="display:block;font-size:14px;font-weight:700">${it.label}</span><span style="display:block;font-size:12px;color:var(--text3);margin-top:2px">${it.sub}</span></span>
        <span style="font-size:18px;color:var(--text3)">${it.arrow}</span>
      </button>`).join('');
  ov.innerHTML=`
  <div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;font-size:16px">${cfg.title}</span>
      <button id="${cfg.closeId}" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="border-top:1px solid var(--border2);padding-top:12px;display:flex;flex-direction:column;gap:8px">${itemsHtml}
    </div>
    <div style="font-size:11px;color:var(--text3);text-align:center">${cfg.hint}</div>
  </div>`;
  ov.addEventListener('click',e=>{if(e.target===ov)_closeOverlay(cfg.id);});
  _lowerHeaderForOverlay();
  document.body.appendChild(ov);
  document.getElementById(cfg.closeId).onclick=()=>_closeOverlay(cfg.id);
  cfg.items.forEach(it=>{
    document.getElementById(it.id).onclick=()=>{_closeOverlay(cfg.id);it.onClick();};
  });
}

/* ══ 保存モーダル ══ */
export function openSaveModal(){
  _openChoiceModal({
    id:'save-modal-overlay',
    closeId:'save-modal-close',
    title:'💾 行程を保存',
    hint:'💡 「共有して保存」からGoogleドライブやLINEにも送れます',
    items:[
      {id:'save-modal-local',icon:'📄',label:'端末に保存',sub:'ダウンロードフォルダへJSON保存',arrow:'↓',onClick:saveJSON},
      {id:'save-modal-share',icon:'📤',label:'共有して保存',sub:'ドライブ・LINE・Keep等に送る',arrow:'›',onClick:_saveViaShare},
    ],
  });
}

/* ══ 読み込みモーダル ══ */
export function openLoadModal(){
  _openChoiceModal({
    id:'load-modal-overlay',
    closeId:'load-modal-close',
    title:'📂 行程を読み込む',
    hint:'⚠️ 読み込むと現在の行程は上書きされます',
    items:[
      {id:'load-modal-local',icon:'📄',label:'端末から読み込む',sub:'JSONファイルを選択',arrow:'↑',onClick:loadJSON},
      {id:'load-modal-restore',icon:'🕐',label:'前回の行程を復元',sub:'端末に自動保存されたデータを読込',arrow:'↺',onClick:restoreFromStorage},
    ],
  });
}

/* ── 共有シート用にJSONテキストを生成（地点ゼロならnull） ── */
function _getShareJson(){
  _flushTitle();
  const totalStops=_totalStops();
  if(totalStops===0){showInfoToast('⚠️ 地点が登録されていません',3500);return null;}
  data.currentStopId=S.manualCurrentId;
  data.version=DEFAULT.version;
  return {json:JSON.stringify(data,null,2),title:(data.title||'ツーリング行程').replace(/[\\/:*?"<>|]/g,'_')};
}

/* ── 共有シート経由でJSONを保存（Android等。Driveアプリ/LINE/Keep等を選べる） ── */
async function _saveViaShare(){
  const r=_getShareJson(); if(!r) return;
  const file=new File([r.json],`${r.title}.json`,{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file],title:r.title});
    }catch(e){
      if(e?.name!=='AbortError') showInfoToast('⚠️ 共有できませんでした',3000);
    }
  }else{
    showInfoToast('⚠️ このブラウザではファイル共有に対応していません（端末に保存をお使いください）',3800);
  }
}

export function saveJSON(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してからファイル名生成
  _dbgLog('saveJSON', _dbgSnapshot);
  try{
    // 空データチェック: 全日で地点が1件もない場合は保存させない
    const totalStops=_totalStops();
    if(totalStops===0){
      showInfoToast('⚠️ 地点が登録されていません。1件以上追加してから保存してください',3500);
      return;
    }
    data.currentStopId=S.manualCurrentId;
    data.version=DEFAULT.version;
    const json=JSON.stringify(data,null,2);
    const title=(data.title||'ツーリング行程').replace(/[\\/:*?"<>|]/g,'_');
    downloadTextFile({
      text:json, filename:`${title}.json`,
      blobType:'application/json',
      btnId:null
    });
  }catch(e){alert('保存に失敗しました: '+e.message);}
}
export function saveRecord(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから記録を生成
  _dbgLog('saveRecord', _dbgSnapshot);
  try{
    const totalStops=_totalStops();
    if(totalStops===0){showInfoToast('⚠️ 地点が登録されていません',3000);return;}
    if(!confirm('ツーリングお疲れ様でした。\n走行記録をテキストファイルに保存しますか？')) return;
    const now=new Date();
    const fmtDate=iso=>{if(!iso)return'';const d=parseISODate(iso);return d?mdw(d):iso;};
    const fmtDiff=d=>{if(d===null)return'';if(d===0)return'定刻';const str=fmtHM(Math.abs(d));return d>0?`+${str}`:`-${str}`;};
    const HR='─'.repeat(30);
    const lines=[];
    lines.push('旅刻 走行記録');
    lines.push(HR);
    if(data.title) lines.push(`タイトル：${data.title}`);
    lines.push(`記録日：${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()}（${WEEK[now.getDay()]}）`);
    lines.push('');
    data.days.forEach((day,di)=>{
      if(!day.stops||!day.stops.length) return;
      lines.push(`【${di+1}日目${day.date?' '+fmtDate(day.date):''}】`);
      lines.push('');
      day.stops.forEach((s,si)=>{
        lines.push(`${si+1}. ${s.name}`);
        const planParts=[];
        if(s.arr) planParts.push(`着 ${s.arr}`);
        if(s.dep) planParts.push(`発 ${s.dep}`);
        const sd=stayDur(s.arr,s.dep);
        if(planParts.length) lines.push(`   計画  ${planParts.join('　')}${sd?' '+sd:''}`);
        const actParts=[];
        if(s.actArr){const d=actDiff(s.arr,s.actArr);actParts.push(`実着 ${s.actArr}${d!==null?' ('+fmtDiff(d)+')':''}`);}
        if(s.actDep){const d=actDiff(s.dep,s.actDep);actParts.push(`実発 ${s.actDep}${d!==null?' ('+fmtDiff(d)+')':''}`);}
        if(actParts.length) lines.push(`   実績  ${actParts.join('　')}`);
        if(s.note) lines.push(`   メモ  ${s.note}`);
        if(s.log)  lines.push(`   📝   ${s.log}`);
        if(s.fuel) lines.push(`   ⛽   給油ポイント`);
        lines.push('');
      });
    });
    lines.push(HR);
    lines.push('旅刻'+APP_VERSION+' / Powered by 鴨吉');
    const text=lines.join('\n');
    const dateStr=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const title=(data.title||'ツーリング').replace(/[\\/:*?"<>|]/g,'_');
    const filename=`旅刻_記録_${title}_${dateStr}.txt`;
    downloadTextFile({
      text, filename,
      blobType:'text/plain;charset=utf-8',
      btnId:'record-save-btn',
      desktopToast:`📝 記録を保存しました：${filename}`
    });
  }catch(e){alert('記録の保存に失敗しました: '+e.message);}
}
export function loadJSON(){
  if(_hasAnyStops()&&!confirm('現在の行程は上書きされます。続けますか？')) return;
  document.getElementById('load-file-input').value='';
  document.getElementById('load-file-input').click();
}

/* ── localStorageの保存データを再読み込みする（起動時に「読み込まない」を選んだ後の復旧用） ── */
export function restoreFromStorage(silent){
  try{
    const _raw=localStorage.getItem(SK);
    if(!_raw){showInfoToast('⚠️ 保存データが見つかりませんでした',3000);return;}
    const _p=JSON.parse(_raw);
    // saveは編集のたびに即実行されるため、localStorageは常に現在の作業内容と一致する。
    // よってここでの再読込は現状の再適用（最悪でもno-op）であり、確認は不要。
    // silent===true（走行モード自動復帰など）は「読み込みました」トーストを出さない。
    _applyImportedData(_p,_p.title,true,silent===true);
  }catch(e){showAppError(EC.LOAD,e);}
}

/* ── 読み込んだJSONを適用する共通処理 ── */
/** @param {any} p 外部由来の未検証データ @param {string} [titleFallback] @param {boolean} [skipConfirm] @param {boolean} [silent] silent=true は完了トーストを出さない */
export function _applyImportedData(p,titleFallback,skipConfirm,silent){
  if(!p||typeof p!=='object'||!Array.isArray(p.days)) throw new Error('フォーマットが正しくありません');
  if(!p.days.length) p.days=[{date:'',routeUrl:'',stops:[]}];
  _migrateData(p); // 旧バージョン移行（02-utils）
  const _truncated=_sanitizeImportedData(p);
  const title=p.title||titleFallback||'（タイトルなし）';
  if(!skipConfirm&&!confirm(`「${title}」を読み込みます。\n現在の行程は上書きされます。よろしいですか？`)){hideInfoToast();return;}
  _pushBackup(); // 上書き直前に「消える側（現在のdata）」を退避（誤読み込みから戻せるように）
  setData(p);
  // ユーザーが明示的にデータを読み込んだ時点で、起動時の復元確認は不要になる。
  // 保留を解除して以後のsave()を有効化し、未確定状態を残さない。
  S._pendingRestore=null;
  S.manualCurrentId=_resolveCurrentStopId(data); // currentStopId 解決＋実在チェック（02-utils）
  S.currentDay=0;S.editingId=null;S.activeEditStopId=null;
  Object.keys(wxStopRes).forEach(k=>delete wxStopRes[k]);
  _bumpWxGen(); // 実行中の天気取得ループを世代変化で無効化（強制終了させない＝並行実行を防ぐ）
  wxQueueIds.clear();wxQueue.length=0;wxQueueFast.length=0;
  _invalidateCdi();
  save(); // 読み込んだデータを即座にlocalStorageへ反映（読み込み直後にタブを閉じても残るように）
  requestAnimationFrame(()=>{
    if(S.isRide){S.isRide=false;if(typeof _gpsOnRideEnd==='function')_gpsOnRideEnd();if(typeof _releaseWakeLock==='function')_releaseWakeLock();document.body.classList.remove('ride-mode');_dom('normal-view').style.display='block';_dom('ride-view').classList.remove('active');_dom('day-tabs').style.display='';_dom('day-manage').style.display='none';_dom('cancel-ride-btn').style.display='none';}
    if(!S.isEdit){S.isEdit=true;_dom('edit-area').style.display='block';}
    _syncTitleInput(); // 読み込んだタイトルをツーリング名欄に反映
    setFormAdd(); // S.isEdit状態に関わらず常にフォームをリセット（既存編集中のロード時に古い入力値が残るのを防ぐ）
    S.editingId=null;S.activeEditStopId=null;
    _syncModeToggle(); // インポート後は編集モードなのでトグルを同期
    renderTabs();render();hideInfoToast();
    if(!silent){
      if(_truncated)showInfoToast(`⚠️ 1日${LIMIT.stopsPerDay}件を超える地点は読み込みませんでした`,4000);
      else showInfoToast(`🗺️ 「${title}」を読み込みました`,3000);
    }
    _resetClockTs();updateClock(); // 走行モードから戻った場合に時計サイズを即時更新
    requestAnimationFrame(_scrollNormalViewToFirstStop);
  });
}

/* ── サンプルデータ（インライン埋め込み） ── */
export const _SAMPLE_DATA={
  "version":"mk8-v1","title":"神奈川〜山梨 日帰りツーリング","currentStopId":null,
  "days":[
    {
      "label":"1日目\n神奈川→山梨","date":"","routeUrl":"",
      "stops":[
        {"id":"s001","name":"横浜 出発","addr":"神奈川県横浜市西区","arr":"","dep":"08:00","note":"早めに出発。首都高・保土ヶ谷バイパスを避けて下道で","fuel":false},
        {"id":"s002","name":"宮ヶ瀬湖","addr":"35.5298, 139.2297","arr":"09:30","dep":"10:00","note":"湖畔で休憩。紅葉シーズンは特に絶景","fuel":false},
        {"id":"s003","name":"道志みち（国道413号）","addr":"35.5035, 139.1120","arr":"10:30","dep":"10:35","note":"ワインディングを満喫。スピードに注意","fuel":false},
        {"id":"s004","name":"道の駅 どうし","addr":"35.5035, 138.9899","arr":"11:15","dep":"12:15","note":"名物の道志産鹿カレーや地元野菜を堪能。バイクも多い","fuel":false},
        {"id":"s005","name":"山中湖","addr":"35.4186, 138.8775","arr":"12:50","dep":"13:30","note":"富士山の眺望ポイント。花の都公園近くが撮影スポット","fuel":false},
        {"id":"s006","name":"富士山パノラマロープウェイ","addr":"35.5038, 138.7744","arr":"14:00","dep":"14:30","note":"河口湖周辺。湖畔ぐるりもおすすめ","fuel":false},
        {"id":"s007","name":"道の駅 なるさわ","addr":"35.4779, 138.6922","arr":"15:00","dep":"15:30","note":"富士山の溶岩を展示。ここで給油チェックを","fuel":true},
        {"id":"s008","name":"横浜 帰着","addr":"35.4660, 139.6221","arr":"18:00","dep":"","note":"中央道・相模原IC経由が渋滞少なめ","fuel":false}
      ]
    }
  ]
};

/* ── サンプルデータを読み込む（インライン版・fetch不要） ── */
export function loadSampleData(){
  _closeAllOverlays();
  if(_hasAnyStops()&&!confirm('現在の行程データがサンプルデータで上書きされます。\n続けますか？')) return;
  try{
    _applyImportedData(JSON.parse(JSON.stringify(_SAMPLE_DATA)),'サンプル行程',true);
  }catch(err){
    showAppError(EC.LOAD,err);
  }
}

export function onFileSelected(ev){
  const file=ev.target.files[0];
  if(!file) return;
  // ① 拡張子 / MIMEチェック
  const okExt=file.name.toLowerCase().endsWith('.json');
  const okMime=!file.type||file.type==='application/json'||file.type==='text/plain';
  if(!okExt||!okMime){
    showAppError(EC.LOAD,new Error('JSONファイルを選択してください'));
    return;
  }
  // ② サイズチェック（上限512KB）
  const MAX_BYTES=512*1024;
  if(file.size>MAX_BYTES){
    showAppError(EC.LOAD,new Error(`ファイルサイズが上限（512KB）を超えています（${(file.size/1024).toFixed(0)}KB）`));
    return;
  }
  showInfoToast('');
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const p=JSON.parse(/** @type {string} */(e.target?.result)); // readAsTextのため常にstring
      // タイトルはJSON内の値を優先し、無い場合のみファイル名をフォールバックに使う。
      // ここで p.title へ入れておくことで、後続の _sanitizeImportedData でサニタイズされ、
      // data.title が undefined のまま残らない（無題JSONでもファイル名が確定タイトルになる）。
      if(!p.title) p.title=file.name.replace(/\.json$/i,'');
      _applyImportedData(p,file.name.replace(/\.json$/i,''),true); // loadJSON側で確認済みのためskip
    }catch(err){
      hideInfoToast();
      showAppError(EC.LOAD,err);
    }
  };
  reader.onerror=()=>{hideInfoToast();showAppError(EC.LOAD,new Error('ファイルの読み込みに失敗しました'));};
  reader.readAsText(file,'UTF-8');
}
