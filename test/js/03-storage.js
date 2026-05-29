/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 03-storage.js
   データ管理（save / share / saveJSON / saveRecord / load / migration）
   依存: 00-constants.js（SK/DEFAULT/LIMIT）, 02-utils.js（sanitize等）
   実行時依存: data, S.currentDay, render, showInfoToast, showAppError
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
// @ts-check

/* --- 自動生成: モジュール依存のインポート --- */
import { DEFAULT, EC, LIMIT, SK } from './00-constants.js';
import { S, _canEditData, _dom, data, setData } from './01-state.js';
import { IS_IOS, _migrateData, _resolveCurrentStopId, _sanitizeImportedData, actDiff, stayDur } from './02-utils.js';
import { _bumpWxGen, _lsSetItem, wxGen, wxQueue, wxQueueFast, wxQueueIds, wxStopRes } from './04-weather.js';
import { _cachedCdiForId, _flushTitle, _invalidateCdi, _scrollNormalViewToFirstStop, _syncTitleInput, renderTabs } from './06-day.js';
import { _lastClockTs, _resetClockTs, hideInfoToast, render, showAppError, showInfoToast, updateClock } from './07-render.js';
import { _hasAnyStops, setFormAdd } from './08-mode.js';
import { _closeAllOverlays, _closeOverlay, _lowerHeaderForOverlay } from './11-overlays.js';
import { _dbgLog, _dbgSnapshot } from './12-debug.js';
import { _gpsOnRideEnd } from './14-gps.js';


/* ══ データ管理（localStorage） ══ */

export function save(){
  // 起動時の復元確認が保留中（S._pendingRestore）は、まだ「新規開始/復元」が未確定。
  // この間に空のdataをlocalStorageへ書き込むと前回データを破壊してしまうため保存しない。
  // 確認に応答すると 13-init.js が S._pendingRestore=null にしてからsave/restoreを行う。
  if(!_canEditData()) return;
  try{
    data.currentStopId=S.manualCurrentId;
    data.version=DEFAULT.version;
    _lsSetItem(SK,JSON.stringify(data));
  }catch(e){showAppError(EC.SAVE,e);}
}

export function shareItinerary(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから共有文を生成
  const WEEK=['日','月','火','水','木','金','土'];
  const fmtDate=iso=>{
    if(!iso) return '日付未設定';
    try{const d=new Date(iso+'T12:00:00');if(isNaN(d.getTime()))return iso;return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;}
    catch(e){return iso;}
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
  // Web Share APIは使わず常に自前モーダルで全文表示
  const ov=document.createElement('div');
  ov.id='share-overlay';
  Object.assign(ov.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
  ov.innerHTML=`<div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:440px;max-height:92dvh;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <span style="font-weight:700;font-size:16px">📋 行程テキスト</span>
      <button onclick="_closeOverlay('share-overlay')" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch">
      <pre id="share-text" style="margin:0;white-space:pre-wrap;word-break:break-word;background:var(--bg3);border:1.5px solid var(--border2);border-radius:10px;color:var(--text2);font-size:14px;line-height:1.8;padding:12px;font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"></pre>
    </div>
    <button id="share-copy-btn" onclick="(async()=>{try{await navigator.clipboard.writeText(document.getElementById('share-text').textContent);const b=document.getElementById('share-copy-btn');b.textContent='✅ コピーしました';b.style.background='var(--green)';b.style.color='#000';setTimeout(()=>{_closeOverlay('share-overlay');},1200);}catch(e){const r=document.createRange();r.selectNode(document.getElementById('share-text'));window.getSelection().removeAllRanges();window.getSelection().addRange(r);}})()\" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0">📋 クリップボードにコピー</button>
    <div style="font-size:12px;color:var(--text3);text-align:center;flex-shrink:0">💡 LINEやメモに貼り付けてバックアップにも</div>
  </div>`;
  // 背景タップで閉じる
  ov.addEventListener('click',e=>{if(e.target===ov) _closeOverlay('share-overlay');});
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  document.getElementById('share-text').textContent=text;
}

/* ── 共通: テキストをファイルとして保存 ──
   PC: Blob+aタグでダウンロード。
   iOS: タブを開く方式(data:/blob: URL)はSafari/PWAでブロックや空白タブになるため、
        shareItineraryと同じ画面内オーバーレイで全文表示し、コピー/共有(ネイティブ共有シート)で取り出す。
   opt: {text, filename, blobType, dataMime, btnId, iosBtnText, desktopToast} */
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

/* ── iOS向け: テキスト書き出しオーバーレイ（shareItineraryと同じ作法） ──
   タブを開かないのでSafari通常タブ/ホーム画面PWA/オフラインのいずれでも安定動作する。
   ・全文を <pre>.textContent で表示（innerHTML不使用＝XSS安全）
   ・📋コピー: navigator.clipboard、失敗時は選択範囲フォールバック
   ・共有: navigator.share 対応時のみ表示。ファイルとして共有できる環境(canShare+files)なら
          .txtファイルで、不可ならテキスト本文で共有シートを開く（「ファイルに保存」「メモ」等へ）。*/
export function _openExportOverlay(text,filename,mime){
  _closeAllOverlays();
  const ov=document.createElement('div');
  ov.id='export-overlay';
  Object.assign(ov.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
  const canShare=typeof navigator!=='undefined'&&typeof navigator.share==='function';
  ov.innerHTML=`<div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:440px;max-height:92dvh;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <span style="font-weight:700;font-size:16px">📝 走行記録</span>
      <button onclick="_closeOverlay('export-overlay')" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch">
      <pre id="export-text" style="margin:0;white-space:pre-wrap;word-break:break-word;background:var(--bg3);border:1.5px solid var(--border2);border-radius:10px;color:var(--text2);font-size:14px;line-height:1.8;padding:12px;font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"></pre>
    </div>
    <button id="export-copy-btn" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0">📋 クリップボードにコピー</button>
    ${canShare?`<button id="export-share-btn" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0;background:var(--bg3)">📤 共有 / ファイルに保存</button>`:''}
    <div style="font-size:12px;color:var(--text3);text-align:center;flex-shrink:0">💡 コピーしてLINEやメモに貼り付け／共有から「ファイルに保存」もできます</div>
  </div>`;
  ov.addEventListener('click',e=>{if(e.target===ov) _closeOverlay('export-overlay');});
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  const pre=document.getElementById('export-text');
  pre.textContent=text;

  // 📋コピー（shareItineraryと同じ挙動: clipboard→失敗時は選択範囲）
  const copyBtn=document.getElementById('export-copy-btn');
  if(copyBtn) copyBtn.onclick=async()=>{
    try{
      await navigator.clipboard.writeText(pre.textContent);
      copyBtn.textContent='✅ コピーしました';
      copyBtn.style.background='var(--green)';copyBtn.style.color='#000';
      setTimeout(()=>_closeOverlay('export-overlay'),1200);
    }catch(e){
      const r=document.createRange();r.selectNode(pre);
      window.getSelection().removeAllRanges();window.getSelection().addRange(r);
    }
  };

  // 📤共有（対応端末のみ）。ファイル共有が可能ならファイルで、不可・失敗時は本文テキストで共有シートへ。
  const shareBtn=document.getElementById('export-share-btn');
  if(shareBtn) shareBtn.onclick=async()=>{
    // ファイル共有を試す。MIMEはdownloadTextFile由来(blobType)を使い、拡張子と不一致にしない
    // （例: .json を text/plain で渡すとiOSの共有が無言でrejectする）。失敗時は本文テキスト共有へ。
    const tryFileShare=async()=>{
      const type=mime||'text/plain';
      let file;
      try{ file=new File([text],filename||'旅刻_記録.txt',{type}); }catch(e){ return false; }
      if(!(navigator.canShare&&navigator.canShare({files:[file]}))) return false;
      await navigator.share({files:[file],title:filename||'旅刻'});
      return true;
    };
    try{
      const ok=await tryFileShare();
      if(!ok) await navigator.share({title:filename||'旅刻',text});
    }catch(e){
      // ユーザーが共有シートを閉じた(AbortError)なら何もしない。
      // それ以外（ファイル共有がrejectされた等）は本文テキスト共有でリトライする。
      if(e&&e.name==='AbortError') return;
      try{ await navigator.share({title:filename||'旅刻',text}); }
      catch(e2){ if(!(e2&&e2.name==='AbortError')) showInfoToast('⚠️ 共有できませんでした。コピーをお使いください',3000); }
    }
  };
}

export function saveJSON(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してからファイル名生成
  _dbgLog('saveJSON', _dbgSnapshot);
  try{
    // 空データチェック: 全日で地点が1件もない場合は保存させない
    const totalStops=(data.days||[]).reduce((sum,d)=>sum+(d.stops?.length||0),0);
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
      blobType:'application/json', dataMime:'application/json;charset=utf-8',
      btnId:'json-save-btn', iosBtnText:'📄 タブで開きました'
    });
  }catch(e){alert('保存に失敗しました: '+e.message);}
}
export function saveRecord(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから記録を生成
  _dbgLog('saveRecord', _dbgSnapshot);
  try{
    const totalStops=(data.days||[]).reduce((sum,d)=>sum+(d.stops?.length||0),0);
    if(totalStops===0){showInfoToast('⚠️ 地点が登録されていません',3000);return;}
    if(!confirm('ツーリングお疲れ様でした。\n走行記録をテキストファイルに保存しますか？')) return;
    const now=new Date();
    const WEEK=['日','月','火','水','木','金','土'];
    const fmtDate=iso=>{if(!iso)return'';try{const d=new Date(iso+'T12:00:00');if(isNaN(d.getTime()))return iso;return`${d.getMonth()+1}/${d.getDate()}(${WEEK[d.getDay()]})`;}catch(e){return iso;}};
    const fmtDiff=d=>{if(d===null)return'';const abs=Math.abs(d),h=Math.floor(abs/60),m=abs%60;const str=h>0&&m>0?`${h}時間${m}分`:h>0?`${h}時間`:`${m}分`;return d===0?'定刻':d>0?`+${str}`:`-${str}`;};
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
    lines.push('旅刻mk16 / Powered by 鴨吉');
    const text=lines.join('\n');
    const dateStr=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const title=(data.title||'ツーリング').replace(/[\\/:*?"<>|]/g,'_');
    const filename=`旅刻_記録_${title}_${dateStr}.txt`;
    downloadTextFile({
      text, filename,
      blobType:'text/plain;charset=utf-8', dataMime:'text/plain;charset=utf-8',
      btnId:'record-save-btn', iosBtnText:'📄',
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
export function restoreFromStorage(){
  try{
    const _raw=localStorage.getItem(SK);
    if(!_raw){showInfoToast('⚠️ 保存データが見つかりませんでした',3000);return;}
    const _p=JSON.parse(_raw);
    // saveは編集のたびに即実行されるため、localStorageは常に現在の作業内容と一致する。
    // よってここでの再読込は現状の再適用（最悪でもno-op）であり、確認は不要。
    _applyImportedData(_p,_p.title,true);
  }catch(e){showAppError(EC.LOAD,e);}
}

/* ── 読み込んだJSONを適用する共通処理 ── */
/** @param {any} p 外部由来の未検証データ @param {string} [titleFallback] @param {boolean} [skipConfirm] */
export function _applyImportedData(p,titleFallback,skipConfirm){
  if(!p||typeof p!=='object'||!Array.isArray(p.days)) throw new Error('フォーマットが正しくありません');
  if(!p.days.length) p.days=[{label:'1日目',date:'',routeUrl:'',stops:[]}];
  _migrateData(p); // 旧バージョン移行（02-utils）
  const _truncated=_sanitizeImportedData(p);
  const title=p.title||titleFallback||'（タイトルなし）';
  if(!skipConfirm&&!confirm(`「${title}」を読み込みます。\n現在の行程は上書きされます。よろしいですか？`)){hideInfoToast();return;}
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
    if(S.isRide){S.isRide=false;if(typeof _gpsOnRideEnd==='function')_gpsOnRideEnd();document.body.classList.remove('ride-mode');_dom('normal-view').style.display='block';_dom('ride-view').classList.remove('active');_dom('ride-btn').classList.remove('on');_dom('ride-btn').textContent='🏍️';_dom('day-tabs').style.display='';_dom('day-manage').style.display='none';_dom('cancel-ride-btn').style.display='none';}
    if(!S.isEdit){S.isEdit=true;_dom('edit-area').style.display='block';}
    _syncTitleInput(); // 読み込んだタイトルをツーリング名欄に反映
    setFormAdd(); // S.isEdit状態に関わらず常にフォームをリセット（既存編集中のロード時に古い入力値が残るのを防ぐ）
    S.editingId=null;S.activeEditStopId=null;
    renderTabs();render();hideInfoToast();
    if(_truncated)showInfoToast(`⚠️ 1日${LIMIT.stopsPerDay}件を超える地点は読み込みませんでした`,4000);
    else showInfoToast(`🗺️ 「${title}」を読み込みました`,3000);
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
        {"id":"s002","name":"宮ヶ瀬湖","addr":"神奈川県愛甲郡清川村宮ヶ瀬","arr":"09:30","dep":"10:00","note":"湖畔で休憩。紅葉シーズンは特に絶景","fuel":false},
        {"id":"s003","name":"道志みち（国道413号）","addr":"神奈川県相模原市緑区青根","arr":"10:30","dep":"10:35","note":"ワインディングを満喫。スピードに注意","fuel":false},
        {"id":"s004","name":"道の駅 どうし","addr":"山梨県南都留郡道志村道志","arr":"11:15","dep":"12:15","note":"名物の道志産鹿カレーや地元野菜を堪能。バイクも多い","fuel":false},
        {"id":"s005","name":"山中湖","addr":"山梨県南都留郡山中湖村山中","arr":"12:50","dep":"13:30","note":"富士山の眺望ポイント。花の都公園近くが撮影スポット","fuel":false},
        {"id":"s006","name":"富士山パノラマロープウェイ","addr":"山梨県南都留郡富士河口湖町","arr":"14:00","dep":"14:30","note":"河口湖周辺。湖畔ぐるりもおすすめ","fuel":false},
        {"id":"s007","name":"道の駅 なるさわ","addr":"山梨県南都留郡鳴沢村字ジラゴンノ","arr":"15:00","dep":"15:30","note":"富士山の溶岩を展示。ここで給油チェックを","fuel":true},
        {"id":"s008","name":"横浜 帰着","addr":"神奈川県横浜市西区","arr":"18:00","dep":"","note":"中央道・相模原IC経由が渋滞少なめ","fuel":false}
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
      p.title=file.name.replace(/\.json$/i,''); // ファイル名をタイトルとして強制セット
      _applyImportedData(p,file.name.replace(/\.json$/i,''),true); // loadJSON側で確認済みのためskip
    }catch(err){
      hideInfoToast();
      showAppError(EC.LOAD,err);
    }
  };
  reader.onerror=()=>{hideInfoToast();showAppError(EC.LOAD,new Error('ファイルの読み込みに失敗しました'));};
  reader.readAsText(file,'UTF-8');
}
