/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 13-init.js
   起動シーケンス（最後に読み込む）
   依存: すべてのJSファイル
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ── localStorageからの自動復元 ── */
// _pendingRestore は 01-state.js で宣言済み（保存系から参照するためグローバル共有）
let data;
_pendingRestore=null;
try{
  const _raw=localStorage.getItem(SK);
  if(_raw){
    const _p=JSON.parse(_raw);
    if(_p&&typeof _p==='object'&&Array.isArray(_p.days)){
      // 旧バージョンからの移行（_applyImportedDataと同じロジック）
      if(_p.version&&['mk13-v1','mk8-v1','mk7-v2','mk7-v1','mk6-v1','mk5-v1','mk4-v2','mk4-v1'].includes(_p.version)){
        if(_p.version==='mk4-v1'){
          let mid=null;
          for(const d of _p.days){if(d.currentStopId){mid=d.currentStopId;break;}}
          _p.currentStopId=mid;
        }
        _p.version=DEFAULT.version;
        for(const d of _p.days||[]){
          if(!('date' in d)) d.date='';
          if(!('routeUrl' in d)) d.routeUrl='';
          for(const s of d.stops||[]) if(!('addr' in s)) s.addr='';
        }
      }
      _sanitizeImportedData(_p);
      if(!_p.days.length) _p.days=[{label:'1日目',date:'',routeUrl:'',stops:[]}];
      // 地点データがある場合は読み込むか確認する
      const _hasStops=(_p.days||[]).some(d=>d.stops&&d.stops.length>0);
      if(!_hasStops){
        // 地点なし（空データ）はそのまま読み込む
        data=_p;
      }else{
        // 地点あり: 同期confirmは初回描画前（白画面）に出てしまうため、
        // ここでは適用せず保留にし、スプラッシュ描画後にアプリ上で確認する
        _pendingRestore=_p;
      }
    }
  }
}catch(e){console.warn('[旅刻] 自動復元に失敗:',e);}
if(!data) data=JSON.parse(JSON.stringify(DEFAULT));

{
  const ds0=data.days[0]?.stops??[];
  manualCurrentId=data.currentStopId??(ds0[0]?.id??null);
  // currentStopIdが存在しない地点を指していたら無効化
  if(manualCurrentId){
    let _found=false;
    _outer:for(const _d of data.days){
      for(const _s of _d.stops){
        if(_s.id===manualCurrentId){_found=true;break _outer;}
      }
    }
    if(!_found) manualCurrentId=data.days[0]?.stops[0]?.id??null;
  }
}
// スプラッシュ表示中に天気取得を先行開始（DOM構築より先に通信を走らせる）
setTimeout(()=>ensureAllWeather(),0);
/* ══ 初期化 ══ */

_initTheme();


syncBorderAddr();
// 復元の確認が保留中は保存データを上書きしないよう初期saveをスキップ
if(!_pendingRestore) save();
initRideSwipe();
initNormalSwipe();
renderTabs();
updateClock();
render();
// レイアウト確定後にheight計算
requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));
// スプラッシュ画面のエピソード・タイトルを描画
_renderSplash();
// ── キーボード表示対応 ──────────────────────────────
// visualViewport resize: sticky高さ再計算 + edit-area先頭をnormal-view上端に揃える
(window.visualViewport||window).addEventListener('resize',()=>{
  _updateStickyTops();
  const el=document.activeElement;
  const nv=document.getElementById('normal-view');
  if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')&&!el.closest('[id$="-overlay"]')){
    setTimeout(()=>{
      const ea=document.getElementById('edit-area');
      if(nv&&ea){
        const target=ea.getBoundingClientRect().top - nv.getBoundingClientRect().top + nv.scrollTop - 8;
        nv.scrollTo({top:Math.max(0,target),behavior:'smooth'});
      } else {
        el.scrollIntoView({behavior:'smooth',block:'start'});
      }
    },150);
  }
});
// focusin: 時計を非表示にしてヘッダー高さを約150px削減 → normal-view 表示領域を確保
document.addEventListener('focusin',e=>{
  const el=e.target;
  if((el.tagName==='INPUT'||el.tagName==='TEXTAREA')&&!el.closest('[id$="-overlay"]')){
    const clk=document.querySelector('.header-clock');
    if(clk) clk.style.display='none';
    requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));
  }
},true);
// focusout: フォーカスが外れたら時計を復元
document.addEventListener('focusout',()=>{
  setTimeout(()=>{
    const a=document.activeElement;
    if(!a||a.tagName!=='INPUT'&&a.tagName!=='TEXTAREA'){
      const clk=document.querySelector('.header-clock');
      if(clk) clk.style.display='';
      requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));
    }
  },200);
},true);
// 時刻は15秒ごと更新（renderRide全再描画しない）
setInterval(()=>{
  updateClock();
  if(!isRide) return;
  // 発車カウントダウンのみ差し替え（全再描画なし）
  const flat=currentDayFlat();
  if(!flat.length) return;
  const rci=flat.findIndex(s=>s.id===manualCurrentId); // currentDayIdxOf→flatから直接検索
  const vs=flat[rideViewIdx];
  if(rideViewIdx!==rci||!vs?.dep) return;
  const dm2=toMin(vs.dep);if(dm2===null)return;
  let diff=dm2-nowMin();if(diff<-720)diff+=1440;if(diff>720)diff-=1440; // 深夜またぎ補正
  const abs=Math.abs(diff);
  const hh2=Math.floor(abs/60),mm2=abs%60;
  const val=hh2>0&&mm2>0?`${hh2}<span style="font-size:.75em">時間</span>${String(mm2).padStart(2,'0')}<span style="font-size:.75em">分</span>`:hh2>0?`${hh2}<span style="font-size:.75em">時間</span>`:`${mm2}<span style="font-size:.75em">分</span>`;
  let html='';
  if(diff>2) html=`<div class="ride-dep-cd before"><span class="ride-dep-cd-val">${val}</span><span class="ride-dep-cd-unit">前</span></div>`;
  else if(diff>=-2) html=`<div class="ride-dep-cd now"><span class="ride-dep-cd-val">出発</span></div>`;
  else html=`<div class="ride-dep-cd after"><span class="ride-dep-cd-val">${val}</span><span class="ride-dep-cd-unit">超過</span></div>`;
  const cd=document.querySelector('.ride-dep-cd');
  if(cd) cd.outerHTML=html;
},15000);
if(!isEdit&&!isRide){
  toggleEdit();
  // ブラウザのフォーム値復元（bfcache/オートフィル）がdata.titleと食い違うのを防ぐため、
  // 描画が落ち着いた後にもう一度data.titleで入力欄を上書き同期する
  requestAnimationFrame(()=>requestAnimationFrame(()=>_syncTitleInput()));
  if(_pendingRestore){
    // 初回描画（スプラッシュ表示）が済んでから確認する。
    // 少し遅延させることで白画面ではなくスプラッシュ上にダイアログが出る。
    setTimeout(()=>{
      const _total=_pendingRestore.days.reduce((s,d)=>s+(d.stops?.length||0),0);
      const _ok=confirm(`前回の行程データが保存されています（${_total}地点）。\n読み込みますか？`);
      _pendingRestore=null; // 確認に応答したので保留解除（以降の保存系ガードを外す）
      if(_ok){
        restoreFromStorage(); // localStorageは保持済みなので再読込で適用
      }else{
        // 新規開始: data は空のままなので、ブラウザが復元した入力欄の値を明示的にクリアする。
        // _syncTitleInput=ツーリング名、renderTabs=ルートURL/日付欄をdataから再同期。
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
  if(isEdit){ _syncTitleInput(); setTimeout(()=>{ if(isEdit) _syncTitleInput(); },120); }
});

// 縦向き固定（Android Chrome対応・iOS Safariは非対応のため無視）
screen.orientation?.lock('portrait').catch(()=>{});
