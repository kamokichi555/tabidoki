/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 07-render.js
   描画系（7セグ / updateClock / renderTabs / renderRide / render）
   + エラー・トースト UI（showAppError / showInfoToast）
   依存: 00-constants.js（EC/WMO）, 02-utils.js（esc/toMin等）
   実行時依存: data, S.isEdit, S.isRide, S.currentDay, wxStopRes
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { EC, EC_MSG } from './00-constants.js';
import { S, _dom, data } from './01-state.js';
import { actDiffHtml, esc, fmtHM, isTimeOrderOk, moveDur, moveDurLevel, moveDurRide, nowMin, stayDur, toMin, wrapDiff } from './02-utils.js';
import { _isoToday, enqueueStop, ensureDayWeather, rideWxCompact, stopWxInner } from './04-weather.js';
import { getStatus } from './05-stop.js';
import { _getCdi, _updateRecordBtn, currentDayFlat, stops, switchDay } from './06-day.js';
import { _gpsNotifySwipe, _gpsUpdateNextDist } from './14-gps.js';


/* ════ 7セグメントディスプレイ ════
   各セグメントをSVGパスで描画。
   W=50,H=92,T=9 の座標系でセグメントを定義し
   <g transform> で配置する。
   a=上, b=右上, c=右下, d=下, e=左下, f=左上, g=中
*/
export const _S7=(()=>{
  const W=50,H=92,T=9,G=2;
  const hL=W-2*G, vL=H/2-2*G;
  // 水平セグメント（両端を菱形にカット）
  const h=(x,y,l)=>`M${x+T/2},${y} L${x+l-T/2},${y} L${x+l},${y+T/2} L${x+l-T/2},${y+T} L${x+T/2},${y+T} L${x},${y+T/2}Z`;
  // 垂直セグメント（両端を菱形にカット）
  const v=(x,y,l)=>`M${x},${y+T/2} L${x+T/2},${y} L${x+T},${y+T/2} L${x+T},${y+l-T/2} L${x+T/2},${y+l} L${x},${y+l-T/2}Z`;
  // 7セグメントのSVGパス定義（a〜g順）
  const SEGS=[
    h(G,    0,      hL),   // a 上
    v(W-T,  G,      vL),   // b 右上
    v(W-T,  H/2+G,  vL),   // c 右下
    h(G,    H-T,    hL),   // d 下
    v(0,    H/2+G,  vL),   // e 左下
    v(0,    G,      vL),   // f 左上
    h(G,    H/2-T/2,hL),   // g 中
  ];
  // 数字ごとの点灯パターン [a,b,c,d,e,f,g]
  const BITS={
    '0':[1,1,1,1,1,1,0],
    '1':[0,1,1,0,0,0,0],
    '2':[1,1,0,1,1,0,1],
    '3':[1,1,1,1,0,0,1],
    '4':[0,1,1,0,0,1,1],
    '5':[1,0,1,1,0,1,1],
    '6':[1,0,1,1,1,1,1],
    '7':[1,1,1,0,0,0,0],
    '8':[1,1,1,1,1,1,1],
    '9':[1,1,1,1,0,1,1],
    '-':[0,0,0,0,0,0,1],
    ' ':[0,0,0,0,0,0,0],
  };
  return {W,H,T,SEGS,BITS};
})();

export function _seg7svg(ts){
  const {W,H,T,SEGS,BITS}=_S7;
  const isDay=document.body.classList.contains('day-mode');
  // 点灯色・消灯色・グロー
  const ON  =isDay?'#1a1a1a':'#39E07A';
  const OFF =isDay?'rgba(0,0,0,.12)':'rgba(0,70,25,.22)';
  const GLOW=isDay?'':'<filter id="gl"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  const applyGlow=isDay?'':' filter="url(#gl)"'; // ダークモードのみグロー適用
  const DX=W+7;   // 桁間隔
  const CW=22;    // コロン幅
  let body='', cx=0;
  for(let i=0;i<ts.length;i++){
    const ch=ts[i];
    if(ch===':'){
      // コロン：上下2ドット
      const dr=T*0.55, dotX=cx+CW/2;
      body+=`<circle cx="${dotX}" cy="${H*0.30}" r="${dr}" fill="${ON}"${applyGlow}/>`;
      body+=`<circle cx="${dotX}" cy="${H*0.70}" r="${dr}" fill="${ON}"${applyGlow}/>`;
      cx+=CW;
    } else {
      const bits=BITS[ch]||BITS[' '];
      let g='';
      SEGS.forEach((d,si)=>{
        const on=bits[si];
        g+=`<path d="${d}" fill="${on?ON:OFF}"${on?applyGlow:''}/>`;
      });
      body+=`<g transform="translate(${cx},0)">${g}</g>`;
      cx+=DX;
    }
  }
  const svgW=cx-7;
  return `<svg viewBox="0 0 ${svgW} ${H}" style="height:${S.isRide?'clamp(36px,14vw,72px)':'clamp(28px,7vw,42px)'};width:auto;display:block;overflow:visible"><defs>${GLOW}</defs>${body}</svg>`;
}

export let _lastClockTs=''; // updateClock用キャッシュ：前回と同じ分ならSVG再生成をスキップ
export function _resetClockTs(){ _lastClockTs=''; } // 時計キャッシュリセット（他モジュール用）
export function updateClock(){
  const n=new Date(),ts=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  if(ts===_lastClockTs) return; // 変化なし → DOM更新不要
  _lastClockTs=ts;
  const d=document.getElementById('now-display');
  if(d) d.innerHTML=_seg7svg(ts);
}

/* ══ ライドアクション表示切替 ══ */
export function toggleRideAction(){S.rideActionVisible=!S.rideActionVisible;renderRide();}

/* ── 共通: 出発カウントダウンのHTML（走行カード・15秒更新の両方で使用） ── */
export function _depCountdownHtml(dep){
  if(!dep) return '';
  const dm=toMin(dep);
  if(dm===null) return '';
  const diff=wrapDiff(dm-nowMin());
  const val=fmtHM(Math.abs(diff),{span:true});
  if(diff>2)   return `<div class="ride-dep-cd before"><span class="ride-dep-cd-val">${val}</span><span class="ride-dep-cd-unit">前</span></div>`;
  if(diff>=-2) return `<div class="ride-dep-cd now"><span class="ride-dep-cd-val">出発</span></div>`;
  return `<div class="ride-dep-cd after"><span class="ride-dep-cd-val">${val}</span><span class="ride-dep-cd-unit">超過</span></div>`;
}

/* ══ ライドモード描画 ══ */
export function renderRide(){
  try{
  const el=_dom('ride-content');
  const bar=_dom('ride-swipe-bar');
  const flat=currentDayFlat();
  if(!flat.length){el.innerHTML='<div style="text-align:center;color:var(--text3);padding:3rem 1rem;font-size:20px">🗺️<br><br>行程を追加してください</div>';bar.style.display='none';const _pb=_rideBannerEl();if(_pb){_pb.innerHTML='';_pb.style.display='none';}return;}
  S.rideViewIdx=Math.max(0,Math.min(flat.length-1,S.rideViewIdx));
  _urgentRideFetch(flat); // 先に現在/次地点を最優先取得（ensureDayWeatherが全件キューに入れる前に）
  ensureDayWeather(S.currentDay);
  const rci=flat.findIndex(s=>s.id===S.manualCurrentId); // currentDayIdxOf→flatから直接検索
  bar.style.display='flex';
  _dom('sw-arr-l').classList.toggle('dim',S.rideViewIdx===0);
  _dom('sw-arr-r').classList.toggle('dim',S.rideViewIdx===flat.length-1);
  /* ── ライドカード共通パーツ ── */
  const _mapLink=s=>s.addr?`<a class="ride-route-btn" href="https://maps.google.com/?q=${encodeURIComponent(s.name)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🗺 マップで確認</a>`:'';
  const _fuelBadge=(s,extra='')=>s.fuel?`<div class="stop-fuel-badge" style="width:100%;justify-content:center${extra}">⛽ 給油ポイント</div>`:'';
  const _noteCompact=s=>s.note?`<div class="ride-note-compact" title="${esc(s.note)}">${esc(s.note)}</div>`:'';
  const _logHtml=s=>s.log?`<div class="ride-log">📝 ${esc(s.log)}</div>`:'';
  const _chips=(s,cls='ride-chip-val')=>{const _sd=stayDur(s.arr,s.dep);return`
        ${s.arr?`<div class="ride-chip"><div class="ride-chip-label">着</div><div class="${cls}">${s.arr}</div></div>`:''}
        ${s.dep?`<div class="ride-chip"><div class="ride-chip-label">発</div><div class="${cls}">${s.dep}</div>${_sd?`<div style="font-size:12px;color:var(--text3);font-weight:600;align-self:center;margin-left:2px">${_sd}</div>`:''}</div>`:''}`;
  };
  let h='';
  const vs=flat[S.rideViewIdx];
  // 日付未設定の日は今日+N日として天気を取得しているため注記する（表示中地点の所属日で判定）。
  // バナーは ride-content の外（スワイプアニメーション対象外）に描画し、地点切替時にスライドしないようにする
  const _pbEl=_rideBannerEl();
  if(_pbEl){
    const _bh=provisionalDateBanner(vs.dayIdx);
    _pbEl.innerHTML=_bh;
    _pbEl.style.display=_bh?'':'none'; // 空のときは要素ごと隠す（CSSの:empty未反映時のフォールバック）
  }
  const isCurr=(S.rideViewIdx===rci),isPast=(rci!==-1&&S.rideViewIdx<rci);
  const vsUrl=data.days[vs.dayIdx]?.routeUrl||'';
  // routeUrlをnew URL()で正規化（"等の不正文字を%22にエンコード）してからHTMLエスケープ
  const vsUrlSafe=vsUrl?(()=>{try{return new URL(vsUrl).href;}catch(e){return '';}})():'';
  const vsRouteBtn=vsUrlSafe?`<a class="ride-route-btn" href="${esc(vsUrlSafe)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🗺 ルートを開く</a>`:'';
  if(isCurr){
    const depCd=_depCountdownHtml(vs.dep);
    h+=`<div class="ride-card curr" onclick="toggleRideAction()">
      <div class="ride-tag curr-tag">▶ 現在地</div>
      <div class="ride-name">${esc(vs.name)}</div>
      <div class="ride-times-row">${_chips(vs)}${depCd}</div>
      ${rideWxCompact(vs.id,!!(vs.addr))}
      ${_fuelBadge(vs,';font-size:16px;padding:8px')}${_noteCompact(vs)}
      ${S.rideActionVisible?`${_logHtml(vs)}${vsRouteBtn}${_mapLink(vs)}`:''}
    </div>`;
  }else{
    const tag=isPast?'✓ 通過済み':'◎ 閲覧中';
    h+=`<div class="ride-card" onclick="toggleRideAction()">
      <div class="ride-tag">${tag}</div>
      <div class="ride-name" style="color:var(--text2)">${esc(vs.name)}</div>
      <div class="ride-times-row">${_chips(vs,'next-chip-val')}</div>
      ${rideWxCompact(vs.id,!!(vs.addr))}
      ${_fuelBadge(vs,';font-size:16px;padding:8px')}${_noteCompact(vs)}
      ${S.rideActionVisible?`${_logHtml(vs)}${vsRouteBtn}${_mapLink(vs)}<button class="ride-set-curr-btn" onclick="event.stopPropagation();setCurrentStop('${vs.id}')">📍 ここを現在地にする</button>`:''}
    </div>`;
  }
  const ni=S.rideViewIdx+1;
  if(ni<flat.length){
    const ns=flat[ni];
    const _mdr=moveDurRide(vs.dep,ns.arr);
    let cd='';
    if(isCurr){const am=toMin(ns.arr);if(am!==null){let diff=am-nowMin();if(diff<-720)diff+=1440;if(diff>720)diff-=1440; // 深夜またぎ補正
if(diff>0){const hh=Math.floor(diff/60),mm=diff%60;cd=hh>0&&mm>0?`あと ${hh}時間${mm}分`:hh>0?`あと ${hh}時間`:`あと ${mm}分`;}else if(diff>-30)cd='まもなく到着';}}
    h+=`${_mdr?`<div class="ride-move-dur${_mdr.level>=0?' lv'+_mdr.level:''}">→ 次まで ${_mdr.html}</div>`:''}`;
    h+=`<div class="ride-card">
      <div class="ride-tag">↓ 次の目的地${cd?`<span style="margin-left:8px;color:var(--green);font-size:12px">${cd}</span>`:''}<span id="ride-next-dist" class="ride-next-dist"></span></div>
      <div class="ride-name" style="color:var(--text2)">${esc(ns.name)}</div>
      <div class="ride-times-row">${_chips(ns,'next-chip-val')}</div>
      ${rideWxCompact(ns.id,!!(ns.addr))}
    </div>`;
  }else{
    h+=`<div style="color:var(--green);font-size:20px;font-weight:700;margin-top:12px;text-align:center">🏁 全行程完了</div>`;
  }
  el.innerHTML=h;
  // プログレスドットをスワイプバー中央に表示
  const ctrEl=_dom('ride-stop-ctr');
  if(ctrEl){
    let dots='<div class="ride-progress">';
    flat.forEach((s,i)=>{const ac=(i===rci),pp=(rci!==-1&&i<rci);dots+=`<div class="ride-dot${ac?' d-curr':pp?' d-past':''}"></div>`;});
    ctrEl.innerHTML=dots+'</div>';
  }
  if(typeof _gpsUpdateNextDist==='function') _gpsUpdateNextDist(); // GPS残り距離を反映
  }catch(e){showAppError(EC.RIDE,e);}
}

/* ══ スワイプ ══ */
export let _swX=0,_swY=0,_swAct=false,_swAnim=false;
export function initRideSwipe(){
  const rv=document.getElementById('ride-view');
  rv.addEventListener('touchstart',e=>{if(_swAnim)return;_swX=e.touches[0].clientX;_swY=e.touches[0].clientY;_swAct=true;},{passive:true});
  rv.addEventListener('touchmove',e=>{if(!_swAct)return;if(Math.abs(e.touches[0].clientY-_swY)>Math.abs(e.touches[0].clientX-_swX)*1.2)_swAct=false;},{passive:true});
  rv.addEventListener('touchend',e=>{if(!_swAct||_swAnim){_swAct=false;return;}_swAct=false;const dx=e.changedTouches[0].clientX-_swX,dy=e.changedTouches[0].clientY-_swY;if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx)*0.85)return;rideNavigate(dx<0?1:-1);},{passive:true});
  rv.addEventListener('touchcancel',()=>{_swAct=false;},{passive:true});
}
export function initNormalSwipe(){
  const nv=document.getElementById('normal-view');let nx=0,ny=0,na=false;
  const fi=()=>{const a=document.activeElement;return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT');};
  nv.addEventListener('touchstart',e=>{if(fi())return;nx=e.touches[0].clientX;ny=e.touches[0].clientY;na=true;},{passive:true});
  nv.addEventListener('touchmove',e=>{if(!na)return;if(Math.abs(e.touches[0].clientY-ny)>Math.abs(e.touches[0].clientX-nx)*1.2)na=false;},{passive:true});
  nv.addEventListener('touchend',e=>{if(!na){na=false;return;}na=false;if(fi()||S.editingId!==null)return;const dx=e.changedTouches[0].clientX-nx,dy=e.changedTouches[0].clientY-ny;if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx)*0.85)return;const to=S.currentDay+(dx<0?1:-1);if(to>=0&&to<data.days.length)switchDay(to);},{passive:true});
  nv.addEventListener('touchcancel',()=>{na=false;},{passive:true});
}
/* 現在・次地点の天気をキュー先頭へ優先投入（単一レート制限ループ経由でNominatimバーストを防ぐ） */
export function _urgentRideFetch(flat){
  const day=data.days[S.currentDay];
  if(!day) return;
  const date=day.date||_isoToday(S.currentDay);
  // 次地点を先にenqueue→現在地を後にenqueueすると、unshiftにより現在地がキュー最前列に来る
  [flat[S.rideViewIdx+1],flat[S.rideViewIdx]].filter(Boolean).forEach(flatStop=>{
    // flat は currentDayFlat() のスプレッドコピーのため、data.days から元の参照を引き当てる
    const stop=day.stops.find(s=>s.id===flatStop.id);
    if(!stop) return;
    if(!(stop.addr||'').trim()) return; // 住所なしは取得しない（表示もしないため）
    enqueueStop(stop,date,true); // 優先投入（キュー先頭・単一ループ経由でレート制限を遵守）
  });
}
export function rideNavigate(dir){
  if(_swAnim)return;const flat=currentDayFlat();if(flat.length<2)return;
  const to=Math.max(0,Math.min(flat.length-1,S.rideViewIdx+dir));if(to===S.rideViewIdx)return;
  if(typeof _gpsNotifySwipe==='function') _gpsNotifySwipe(); // 手動スワイプ→GPS表示追従を一時停止
  S.rideActionVisible=false;
  _swAnim=true;const el=document.getElementById('ride-content');
  const ec=dir>0?'sw-exit-left':'sw-exit-right',nc=dir>0?'sw-enter-left':'sw-enter-right';
  el.classList.add(ec);
  setTimeout(()=>{
    if(!S.isRide){_swAnim=false;return;} // モード切替済みなら無駄なrenderRide/fetchを走らせない
    S.rideViewIdx=to;el.style.transition='none';el.classList.remove(ec);el.classList.add(nc);
    renderRide();el.offsetHeight;el.style.transition='';el.classList.remove(nc);setTimeout(()=>{_swAnim=false;},260);},240);
}

/* ══ エラーハンドリング ══ */
export let _appErrTimer=null;
export function showAppError(code,err){const toast=document.getElementById('app-error-toast');if(!toast)return;const detail=err instanceof Error?err.message.slice(0,100):(err?String(err).slice(0,100):'');document.getElementById('app-err-code').textContent=code;document.getElementById('app-err-msg').textContent=(EC_MSG[code]||'エラー')+(detail?' — '+detail:'');toast.style.display='block';if(_appErrTimer)clearTimeout(_appErrTimer);_appErrTimer=setTimeout(dismissAppError,8000);console.error('[旅刻 '+code+']',err);}
export function dismissAppError(){const t=document.getElementById('app-error-toast');if(t)t.style.display='none';if(_appErrTimer){clearTimeout(_appErrTimer);_appErrTimer=null;}}

export let _infoTimer=null;
export function showInfoToast(msg,duration=0,action=null){
  const t=document.getElementById('info-toast');
  if(!t)return;
  if(_infoTimer){clearTimeout(_infoTimer);_infoTimer=null;}
  if(action&&action.label&&typeof action.fn==='function'){
    // アクションボタン付きトースト（テキスト＋タップ可能なボタン）
    t.textContent='';
    const span=document.createElement('span');
    span.textContent=msg;
    const btn=document.createElement('button');
    btn.textContent=action.label;
    btn.style.cssText='margin-left:12px;padding:6px 14px;border:none;border-radius:8px;background:var(--green,#4da6ff);color:#000;font-weight:700;font-size:14px;vertical-align:middle';
    btn.addEventListener('click',()=>{hideInfoToast();action.fn();});
    t.appendChild(span);
    t.appendChild(btn);
  }else{
    t.textContent=msg;
  }
  t.style.display='block';
  t.style.animation='none';
  requestAnimationFrame(()=>{t.style.animation='toast-in .22s cubic-bezier(.2,0,.2,1)';});
  if(duration>0) _infoTimer=setTimeout(()=>hideInfoToast(),duration);
}
export function hideInfoToast(){
  const t=document.getElementById('info-toast');
  if(t) t.style.display='none';
  if(_infoTimer){clearTimeout(_infoTimer);_infoTimer=null;}
}
// グローバルエラーハンドラは _dbgInit() 内で一本化して登録

/* ══ バリデーション ══ */
/* 読み込んだJSONを手動入力時と同じ基準でサニタイズ（長さ・XSS・形式不正を遮断） */
export function checkTimeOrder(){
  const a=document.getElementById('inp-arr').value,d=document.getElementById('inp-dep').value;
  const err=document.getElementById('time-order-error');
  const depEl=document.getElementById('inp-dep');
  const ok=isTimeOrderOk(a,d);
  if(err) err.style.display=ok?'none':'block';
  depEl.style.borderColor=ok?'':'var(--red)';
  depEl.style.borderWidth=ok?'':'2px';
  const prev=document.getElementById('stay-dur-preview');
  if(prev){const sd=ok?stayDur(a,d):'';prev.textContent=sd?'⏱ 滞在 '+sd:'';prev.style.display=sd?'block':'none';}
}
export function showValError(msg){const old=document.getElementById('val-error');if(old)old.remove();const el=document.createElement('div');el.id='val-error';el.className='val-error';el.textContent='⚠ '+msg;const fg=document.querySelector('.form-gap');if(fg)fg.prepend(el);setTimeout(()=>{if(el.parentNode)el.remove();},3500);}
export function showUrlError(msg){const el=document.getElementById('inp-route-url');if(!el)return;el.style.borderColor='var(--red)';el.title=msg;setTimeout(()=>{el.style.borderColor='';el.title='';},2500);}

/* 走行モードのバナー要素を取得（index.html に無い場合は ride-content の直前に動的生成）。
   古いHTMLがキャッシュ/デプロイされていてもバナーが確実に出るようにするためのフォールバック。 */
export function _rideBannerEl(){
  let el=document.getElementById('ride-provisional-banner');
  if(!el){
    const content=document.getElementById('ride-content');
    const wrap=content&&content.parentNode;
    if(!wrap) return null;
    el=document.createElement('div');
    el.id='ride-provisional-banner';
    wrap.insertBefore(el,content); // ride-content の直前（＝スワイプ対象外）に挿入
  }
  return el;
}

/* 日付未設定の日の予報注記バナーを生成（通常ビュー・走行モード共用）。
   日付未設定時は「今日+dayIdx日」として天気を取得しているため、その補完日を明示する。
   day.date が設定済みなら空文字を返す（バナー非表示）。
   ※インラインstyleは style.css が古い/未反映でも見た目が崩れないためのフォールバック。
     新しいCSSの .provisional-date-note が当たればそちらと同等の見た目になる。 */
export function provisionalDateBanner(dayIdx){
  const day=data.days[dayIdx];
  if(!day||day.date) return '';
  const pd=new Date();pd.setDate(pd.getDate()+dayIdx);
  const w=['日','月','火','水','木','金','土'][pd.getDay()];
  const ds=`${pd.getMonth()+1}/${pd.getDate()}(${w})`;
  const _s='margin:0 0 14px;padding:8px 12px;background:var(--amber-bg);border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r,12px);color:var(--text2);font-size:13px;line-height:1.5';
  return `<div class="provisional-date-note" style="${_s}">📅 日付未設定のため <b style="color:var(--amber);font-weight:700">${ds}</b> の予報を表示しています</div>`;
}

/* ══ render（通常ビュー） ══ */
export function render(){
  try{
  if(S.isRide){renderRide();return;}
  const tl=document.getElementById('timeline'),em=document.getElementById('empty-state'),ds=stops();
  tl.className=S.isEdit&&S.editingId===null?'timeline edit-mode':'timeline';
  if(!ds.length){tl.innerHTML='';em.style.display='block';return;}
  em.style.display='none';
  // cdiをキャッシュ利用
  const cdi=_getCdi();
  // 天気フェッチ（日付未設定でも住所があれば取得）
  ensureDayWeather(S.currentDay);
  // 日付未設定の日は今日+N日として天気を取得しているため、その旨を一度だけ注記する
  const provisionalBanner=provisionalDateBanner(S.currentDay);
  tl.innerHTML=provisionalBanner+ds.map((s,i)=>{
    const st=getStatus(s,i,ds,cdi),isLast=i===ds.length-1,isDM=s.note&&s.note.includes('🩸'),_sdur=stayDur(s.arr,s.dep),_mdur=!isLast?moveDur(s.dep,ds[i+1].arr):'',_mlv=!isLast?moveDurLevel(s.dep,ds[i+1].arr):-1;
    return`<div class="stop-row ${st}" data-id="${s.id}">
  <div class="stop-line-col"><div class="stop-dot"></div>${!isLast?'<div class="stop-connector"></div>':''}</div>
  ${S.isEdit&&S.editingId===null?`<div class="drag-handle" data-drag-id="${s.id}" ontouchstart="onTouchDragStart(event,'${s.id}')" ontouchmove="onTouchDragMove(event)" ontouchend="onTouchDragEnd(event)" ontouchcancel="_cancelTouchDrag()" onmousedown="onMouseDragStart(event,'${s.id}')">⠿</div>`:''}
  <div class="stop-body"${S.isEdit&&S.editingId===null?` onclick="tapStopInEdit('${s.id}')"`:''}>    <div class="stop-name-row"><span class="stop-name-text">${esc(s.name)}</span>${S.isEdit&&S.editingId===null?`<span style="font-size:13px;color:var(--text3);margin-left:auto">▾</span>`:''}</div>
    ${s.addr?`<div class="stop-addr">📍 ${esc(s.addr)}</div>`:''}
    <div class="stop-times">
      ${s.arr?`<div class="time-chip"><span class="time-label">着</span><span class="time-value">${s.arr}</span></div>`:''}
      ${s.dep?`<div class="time-chip"><span class="time-label">発</span><span class="time-value">${s.dep}</span>${_sdur?`<span style="font-size:13px;color:var(--text3);font-weight:600;margin-left:4px;align-self:center">${_sdur}</span>`:''}</div>`:''}
      ${!s.arr&&!s.dep?'<span style="color:var(--text3);font-size:13px">時刻未設定</span>':''}
    </div>
    <div id="wx-${s.id}">${stopWxInner(s.id,!!(s.addr))}</div>
    ${s.fuel?'<div class="stop-fuel-badge">⛽ 給油ポイント</div>':''}
    ${(s.actArr||s.actDep)?`<div class="stop-act-row">${s.actArr?`<div class="stop-act-chip"><span class="stop-act-label">実着</span><span class="stop-act-value">${s.actArr}</span>${actDiffHtml(s.arr,s.actArr)}</div>`:''}${s.actDep?`<div class="stop-act-chip"><span class="stop-act-label">実発</span><span class="stop-act-value">${s.actDep}</span>${actDiffHtml(s.dep,s.actDep)}</div>`:''}</div>`:''}
    ${s.note?`<div class="stop-note${isDM?' dm':''}">${esc(s.note)}</div>`:''}
    ${s.log?`<div class="stop-log">📝 ${esc(s.log)}</div>`:''}
    ${st==='current'?'<div class="current-badge">▶ 現在地</div>':''}
    ${!isLast&&_mdur?`<div class="move-dur-label${_mlv>=0?' lv'+_mlv:''}">→ 次まで ${_mdur}</div>`:''}
    ${S.isEdit&&S.editingId===null&&S.activeEditStopId===s.id?`<div class="stop-edit-row">      <button class="small amber-outline" onclick="event.stopPropagation();setCurrentStop('${s.id}')">📍 現在</button>
      <button class="small amber-outline" onclick="event.stopPropagation();openEditStop('${s.id}')">✏️ 編集</button>
      ${s.addr?`<a class="map-link-btn" href="https://maps.google.com/?q=${encodeURIComponent(s.name)}" target="_blank" rel="noopener">🗺 マップ</a>`:''}
      <button class="small danger" onclick="event.stopPropagation();delStop('${s.id}')">削除</button>
    </div>`:''}
  </div>
</div>`;
  }).join('');
  _updateRecordBtn();
  }catch(e){showAppError(EC.RENDER,e);}
}


