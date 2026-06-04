/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 12-debug.js
   デバッグログ機構・バッジ・トースト
   依存: 00-constants.js（EC）, 04-weather.js（_lsSetItem）
   実行時依存: showAppError
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { S, data } from './01-state.js';
import { EC, APP_VERSION } from './00-constants.js';
import { showAppError, showInfoToast } from './07-render.js';
/* ══ デバッグログ機構 ══ */
export const DBG_KEY='dbg_log_v1';
export const DBG_IMP_KEY='dbg_imp_v1';      // 重要イベント専用の永続化キー（gps_fix等に押し出されない退避先）
export const DBG_ENABLED_KEY='dbg_enabled_v1';
export const DBG_MAX=500;
export const DBG_IMP_MAX=1000;              // 重要イベントの保持上限（全行程ぶん残す。満杯でも約90KB＝localStorage上限の2%弱）
/* 1日がかりの走行では gps_fix(15秒毎=240件/時) が500件リングを2時間強で一巡し、
   序盤の gps_auto_switch 等が押し出されて消える。そこで「全行程残したい重要イベント」だけを
   別バッファ(_dbgImpBuf)へも退避する。gps_fix と click は対象外＝従来どおり500件リングのみ。 */
export const DBG_IMP_EVENTS=new Set([
  'gps_auto_switch','gps_error','gps_prefetch_failed','setCurrentStop',
  'toggleRide:in','toggleRide:out','ride_autoresume',
  'wakelock_failed','wakelock_released',
  'window_error','promise_rejection','app_error',
  'ls_quota_exceeded','ls_save_failed','ls_unavailable','autorestore_failed',
]);
export let _dbgEnabled=false;
export let _dbgErrCount=0;
export let _dbgBuf=[];
export let _dbgImpBuf=[];                    // 重要イベント退避バッファ（全行程ぶん。gps_fixで埋まらない）
export let _dbgPersistTimer=null;
export let _dbgDirty=false;

export function _dbgPersistSchedule(){
  _dbgDirty=true;
  if(_dbgPersistTimer) return;
  _dbgPersistTimer=setTimeout(()=>{
    _dbgPersistTimer=null;
    if(_dbgDirty){
      try{localStorage.setItem(DBG_KEY,JSON.stringify({buf:_dbgBuf,err:_dbgErrCount}));}catch(e){}
      try{localStorage.setItem(DBG_IMP_KEY,JSON.stringify({buf:_dbgImpBuf}));}catch(e){}
      _dbgDirty=false;
    }
  },3000);
}

export function _dbgSnapshot(){
  try{
    const h=document.querySelector('header');
    return {
      isEdit:typeof S.isEdit!=='undefined'?S.isEdit:null,
      isRide:typeof S.isRide!=='undefined'?S.isRide:null,
      cd:typeof S.currentDay!=='undefined'?S.currentDay:null,
      mId:typeof S.manualCurrentId!=='undefined'?S.manualCurrentId:null,
      aId:typeof S.activeEditStopId!=='undefined'?S.activeEditStopId:null,
      eId:typeof S.editingId!=='undefined'?S.editingId:null,
      days:(typeof data!=='undefined'&&data?.days)?data.days.length:0,
      hh:h?.offsetHeight||0,
      vw:window.innerWidth,vh:window.innerHeight,
      vvh:window.visualViewport?Math.round(window.visualViewport.height):null,
      vvt:window.visualViewport?Math.round(window.visualViewport.offsetTop):null,
    };
  }catch(e){return {snapErr:String(e).slice(0,60)};}
}

export function _dbgLog(event,data){
  if(!_dbgEnabled) return;
  try{
    // dataが関数なら有効時のみ評価（早期評価によるDOM計測コストを回避）
    const resolved=typeof data==='function'?data():data;
    const entry={t:new Date().toISOString().slice(11,23),e:event};
    if(resolved!==undefined&&resolved!==null) entry.d=resolved;
    _dbgBuf.push(entry);
    if(_dbgBuf.length>DBG_MAX) _dbgBuf=_dbgBuf.slice(-DBG_MAX);
    // 重要イベントは別バッファにも退避（gps_fix/clickに押し出されず全行程残る）
    if(DBG_IMP_EVENTS.has(event)){
      _dbgImpBuf.push(entry);
      if(_dbgImpBuf.length>DBG_IMP_MAX) _dbgImpBuf=_dbgImpBuf.slice(-DBG_IMP_MAX);
    }
    _dbgPersistSchedule();
    _dbgRefreshSettings();
  }catch(e){}
}

export function _dbgFmtAll(){
  const env={
    app:'tabidoki '+APP_VERSION,
    now:new Date().toISOString(),
    ua:navigator.userAgent,
    vw:window.innerWidth,vh:window.innerHeight,
    vvw:window.visualViewport?.width,vvh:window.visualViewport?.height,
    err:_dbgErrCount,entries:_dbgBuf.length,impEntries:_dbgImpBuf.length,
    snap:_dbgSnapshot(),
  };
  const fmt=en=>`[${en.t}] ${en.e}${en.d?' '+JSON.stringify(en.d):''}`;
  const head='# 旅刻'+APP_VERSION+' デバッグログ\n## 環境\n'+JSON.stringify(env,null,2)+'\n';
  // 重要イベント（全行程ぶん・gps_fix等に押し出されない）。1日走行でも序盤の到着が残る。
  const impHead='\n## 重要イベント (全行程・古い→新しい)\n';
  const impLines=_dbgImpBuf.length?_dbgImpBuf.map(fmt).join('\n'):'(なし)';
  // 直近の全イベント（gps_fix/click含む。500件で一巡するため直近約2時間ぶん）
  const allHead='\n\n## イベント (直近500件・古い→新しい)\n';
  const lines=_dbgBuf.map(fmt).join('\n');
  return head+impHead+impLines+allHead+lines+'\n';
}

export function _dbgCopy(){
  const t=_dbgFmtAll();
  const done=()=>{try{showInfoToast('📋 ログをコピーしました',1800);}catch(e){}};
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(t).then(done).catch(()=>_dbgFallbackCopy(t,done));
  }else _dbgFallbackCopy(t,done);
}
export function _dbgFallbackCopy(t,done){
  try{
    const ta=document.createElement('textarea');
    ta.value=t;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    document.execCommand('copy');ta.remove();
    done&&done();
  }catch(e){alert('コピーに失敗しました');}
}

export function _dbgDownload(){
  try{
    const t=_dbgFmtAll();
    const blob=new Blob([t],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='tabidoki-debug-'+new Date().toISOString().slice(0,19).replace(/[:.]/g,'').replace('T','-')+'.txt';
    document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
    try{showInfoToast('💾 ログを保存しました',1800);}catch(e){}
  }catch(e){alert('保存に失敗しました: '+e.message);}
}

export function _dbgClear(){
  if(!confirm('デバッグログをすべて削除しますか？')) return;
  _dbgBuf=[];_dbgImpBuf=[];_dbgErrCount=0;_dbgDirty=true;
  try{localStorage.removeItem(DBG_KEY);}catch(e){}
  try{localStorage.removeItem(DBG_IMP_KEY);}catch(e){}
  _dbgUpdateBadge();
  _dbgRefreshSettings();
  try{showInfoToast('🗑️ ログを消去しました',1500);}catch(e){}
}

export function _dbgSetEnabled(on){
  _dbgEnabled=!!on;
  try{localStorage.setItem(DBG_ENABLED_KEY,on?'1':'0');}catch(e){}
  if(on){
    _dbgLog('debug_enabled', _dbgSnapshot);
  }else{
    // OFFにする際は1件記録してから停止
    try{
      _dbgEnabled=true;
      _dbgLog('debug_disabled',null);
      _dbgEnabled=false;
    }catch(e){}
  }
  _dbgUpdateBadge();
  _dbgRefreshSettings();
}

export function _dbgUpdateBadge(){
  const b=document.getElementById('dbg-badge');
  const t=document.getElementById('dbg-badge-text');
  if(!b||!t) return;
  if(_dbgEnabled){
    b.classList.add('show');
    if(_dbgErrCount>0){b.classList.add('err');t.textContent='🐛 '+_dbgErrCount;}
    else{b.classList.remove('err');t.textContent='🐛';}
  }else b.classList.remove('show');
}

export function _dbgRefreshSettings(){
  const c=document.getElementById('dbg-count');
  if(c) c.textContent=`${_dbgBuf.length}件 / 重要${_dbgImpBuf.length}件 / エラー${_dbgErrCount}件`;
}

export function _dbgInit(){
  try{_dbgEnabled=localStorage.getItem(DBG_ENABLED_KEY)==='1';}catch(e){}
  try{
    const raw=localStorage.getItem(DBG_KEY);
    if(raw){const obj=JSON.parse(raw);_dbgBuf=Array.isArray(obj?.buf)?obj.buf:[];_dbgErrCount=obj?.err|0;}
  }catch(e){_dbgBuf=[];_dbgErrCount=0;}
  try{
    const rawImp=localStorage.getItem(DBG_IMP_KEY);
    if(rawImp){const o=JSON.parse(rawImp);_dbgImpBuf=Array.isArray(o?.buf)?o.buf:[];}
  }catch(e){_dbgImpBuf=[];}
  // クリックを全部拾う
  document.addEventListener('click',e=>{
    if(!_dbgEnabled) return;
    if(e.target.closest('#dbg-badge,.dbg-btn,.dbg-section')) return;
    const el=e.target.closest('button,.picker-chip,.day-tab,.stop-row,a[href]');
    if(!el) return;
    try{
      _dbgLog('click',{
        id:el.id||null,
        txt:(el.textContent||'').trim().slice(0,28),
        cls:(typeof el.className==='string'?el.className:'').slice(0,40)||null,
      });
    }catch(e){}
  },true);
  // グローバルエラーハンドラ（showAppError との一本化）
  window.addEventListener('error',e=>{
    _dbgErrCount++;
    _dbgLog('window_error',{
      msg:e.message,
      src:(e.filename||'').slice(-60),
      line:e.lineno,col:e.colno,
      stack:(e.error&&e.error.stack||'').slice(0,400),
    });
    _dbgUpdateBadge();
    showAppError(EC.GLOBAL,e.error||new Error(e.message));
  });
  window.addEventListener('unhandledrejection',e=>{
    _dbgErrCount++;
    _dbgLog('promise_rejection',{reason:String(e.reason).slice(0,400)});
    _dbgUpdateBadge();
    showAppError(EC.GLOBAL,e.reason);
  });
  // app_error のデバッグログ記録は 07-render.js の showAppError 内で直接行う
  // （window.showAppError フックはモジュール束縛経由の呼び出しを捕捉できず機能しなかったため廃止）
  // ページ離脱前に永続化（beforeunload=デスクトップ、pagehide=iOS Safari対応）
  function _dbgFlush(){
    if(_dbgDirty){
      try{localStorage.setItem(DBG_KEY,JSON.stringify({buf:_dbgBuf,err:_dbgErrCount}));}catch(e){}
      try{localStorage.setItem(DBG_IMP_KEY,JSON.stringify({buf:_dbgImpBuf}));}catch(e){}
    }
  }
  window.addEventListener('beforeunload',_dbgFlush);
  window.addEventListener('pagehide',_dbgFlush);
  _dbgUpdateBadge();
}
_dbgInit();

