/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 13-init.js
   起動シーケンス（最後に読み込む）
   依存: すべてのJSファイル
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ── localStorageからの自動復元 ── */
let data;
let _restored=false;
let _restoreDebug={hasRaw:false,parsed:false,daysCount:0,stopsTotal:0,err:null};
try{
  const _raw=localStorage.getItem(SK);
  _restoreDebug.hasRaw=!!_raw;
  _restoreDebug.rawLen=_raw?_raw.length:0;
  if(_raw){
    const _p=JSON.parse(_raw);
    _restoreDebug.parsed=true;
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
      data=_p;
      _restored=data.days.some(d=>d.stops&&d.stops.length>0);
      _restoreDebug.daysCount=data.days.length;
      _restoreDebug.stopsTotal=data.days.reduce((s,d)=>s+(d.stops?.length||0),0);
    }
  }
}catch(e){console.warn('[旅刻] 自動復元に失敗:',e);_restoreDebug.err=String(e).slice(0,100);}
if(!data) data=JSON.parse(JSON.stringify(DEFAULT));
// 復元結果をデバッグログに記録（debug ON時のみ実際に記録される）
setTimeout(()=>{try{_dbgLog('restore_check',{restored:_restored,..._restoreDebug});}catch(e){}},100);

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


syncBorderAddr();save();
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
  const diff=dm2-nowMin(),abs=Math.abs(diff);
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
  // スプラッシュ画面（5秒表示+0.5秒フェードアウト）の後にトーストを表示
  setTimeout(()=>{
    if(_restored){
      const _total=data.days.reduce((s,d)=>s+(d.stops?.length||0),0);
      showInfoToast(`🗺️ 前回の行程を復元しました（${_total}地点）`,3500);
    }else{
      showInfoToast('📂 データの読み込みをしてください',4000);
    }
  },5600);
}
// 縦向き固定（Android Chrome対応・iOS Safariは非対応のため無視）
screen.orientation?.lock('portrait').catch(()=>{});
