/* ══════════════════════════════════════════════════════
   旅刻 mk16 — 11-overlays.js
   給油チェック / 詳細セクション / スプラッシュ設定 / オーバーレイ共通
   依存: 00-constants.js（LIMIT）, 02-utils.js（sanitize）
   実行時依存: _dbgLog, showInfoToast, save, render, _lsSetItem
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ 給油チェック ══ */
function _setFuelCheck(val){
  const box=document.getElementById('fuel-check-box');
  if(!box) return;
  box.classList.toggle('checked',!!val);
  box.textContent=val?'⛽':'';
  // GS選択などで給油ONになった時、詳細パネルを自動で開いて変更を見せる
  if(val) _setDetailsOpen(true);
}
function toggleFuelCheck(){
  const box=document.getElementById('fuel-check-box');
  if(!box) return;
  const next=!box.classList.contains('checked');
  _setFuelCheck(next);
}

/* ══ 詳細セクション開閉 ══ */
function _setDetailsOpen(open){
  const body=document.getElementById('details-body');
  const btn=document.getElementById('details-toggle');
  if(!body||!btn) return;
  body.style.display=open?'flex':'none';
  btn.classList.toggle('open',open);
}
function toggleDetails(){
  const body=document.getElementById('details-body');
  if(!body) return;
  _setDetailsOpen(body.style.display==='none');
}

/* ══ スプラッシュ タイトル設定 ══ */
const SPLASH_SK='touring_splash_settings';
const KANJI_NUMS=['一','二','三','四','五','六','七','八','九','十'];
function _toKanjiNum(n){
  n=parseInt(n,10);
  if(isNaN(n)||n<1) return '';
  if(n<=10) return KANJI_NUMS[n-1];
  if(n<20) return '十'+KANJI_NUMS[n-11];
  const j=Math.floor(n/10), k=n%10;
  return KANJI_NUMS[j-1]+'十'+(k?KANJI_NUMS[k-1]:'');
}
function _numToEpisode(val){
  const n=parseInt(val,10);
  if(!val||isNaN(n)||n<1||n>99) return '';
  return '第'+_toKanjiNum(n)+'話';
}
// 木枯らし紋次郎 各話タイトル（笹沢左保 原作）
const MONJIROU_TITLES=[
  '甲州街道に月を追う','赦免花は散ったか','一里塚に風が吹く',
  '木枯しは江戸に吹いた','墓場に何かが帰る夜','峠に散った三度笠',
  '流れ旅に泥が跳んだ','崖の上に影が消えた','風鈴峠に月が泣く',
  '霧の中の渡り鳥','荒野に十字架が立った','血文字峠を越せ',
  '荒れ野に仁義は無い','三度笠が流れる宿','峠の向こうに嘘があった',
  '木枯しの涯に海があった','野分の後に血が流れた','孤独な旅路に敵が待つ',
  '旅がらすに傷が疼く','荒漠の地に道はない','砂塵の中の決闘',
  '宵闇の中の渡り鳥','冬枯れの道に涙が落ちた','山霧の彼方に故郷がある',
  '三度笠に吹雪が沁みた','刃風峠に月が泣いた','橋の袂で骨が鳴る',
  '血煙は風に流れた','孤狼は斃れず','さらば紋次郎',
];
let splashSettings=(()=>{
  try{
    const s=JSON.parse(localStorage.getItem(SPLASH_SK));
    if(s&&typeof s==='object'){
      const epNum=parseInt(s.episode,10);
      return {
        star:sanitize(s.star,20),
        episode:(Number.isInteger(epNum)&&epNum>=1&&epNum<=99)?String(epNum):'',
        title:sanitize(s.title,40),
      };
    }
  }catch(e){}
  return {episode:'',title:'',star:''};
})();
function _randomKanji(){return '第'+KANJI_NUMS[Math.floor(Math.random()*KANJI_NUMS.length)]+'話';}
function _randomTitle(){return MONJIROU_TITLES[Math.floor(Math.random()*MONJIROU_TITLES.length)];}
function _renderSplash(){
  const ep=document.getElementById('splash-episode');
  const ti=document.getElementById('splash-ep-title');
  const cr=document.getElementById('splash-credit');
  if(ep) ep.textContent=_numToEpisode(splashSettings.episode)||_randomKanji();
  if(ti) ti.textContent=splashSettings.title||_randomTitle();
  const starName=splashSettings.star||'あなた';
  if(cr) cr.textContent='主演：'+starName+'　友情出演：鴨吉';
}
function openSplashSettings(){
  _closeAllOverlays();
  const ov=document.createElement('div');
  ov.id='splash-settings-overlay';
  const applyVp=_makeApplyVp(ov);
  Object.assign(ov.style,{position:'fixed',top:'0',left:'0',width:'100%',height:'100%',zIndex:'999999',background:'rgba(0,0,0,.88)',display:'flex',alignItems:'flex-end',justifyContent:'center'});
  ov.innerHTML=`<div style="background:var(--bg2);border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:80%;display:flex;flex-direction:column;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
      <span style="font-weight:700;font-size:17px">📜 設定</span>
      <div style="display:flex;align-items:center;gap:4px">
        <a href="tabidoki_manual.html" target="_blank" rel="noopener" title="マニュアルを開く" style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--amber);text-decoration:none;padding:5px 10px;border:1.5px solid rgba(255,184,0,.35);border-radius:8px;background:rgba(255,184,0,.1);white-space:nowrap">📖 マニュアル</a>
        <button id="ss-close-btn" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;padding:16px;-webkit-overflow-scrolling:touch">
      <div class="form-gap">
        <div class="input-group">
          <div class="input-label">主演（空欄で「あなた」を表示）</div>
          <input id="ss-star" type="text" maxlength="20" placeholder="例：田中太郎" value="${esc(splashSettings.star||'')}">
        </div>
        <div class="input-group">
          <div class="input-label">第◯話（数字を入力すると漢数字に変換・空欄でランダム）</div>
          <div style="position:relative">
            <input id="ss-episode" type="number" min="1" max="99" step="1" placeholder="例：3　→　第三話" value="${splashSettings.episode||''}" oninput="_updateEpisodePreview()" style="padding-right:100px">
            <span id="ss-episode-preview" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--amber);font-weight:700;pointer-events:none">${splashSettings.episode?_numToEpisode(splashSettings.episode):''}</span>
          </div>
        </div>
        <div class="input-group">
          <div class="input-label">タイトル（空欄で紋次郎風ランダム）</div>
          <input id="ss-title" type="text" maxlength="40" placeholder="例：甲州街道に月を追う" value="${esc(splashSettings.title||'')}">
        </div>
      </div>
      <div style="margin-top:14px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r)">
        <div style="font-size:12px;color:var(--text3);line-height:1.8">
          <div>• 第◯話：数字（1〜99）を入力すると自動で漢数字に変換して表示</div>
          <div>• 空欄にすると一〜十のいずれかをランダムで表示</div>
          <div>• タイトルを空欄にすると木枯らし紋次郎風をランダム表示</div>
          <div>• 起動するたびにランダム抽選されます</div>
        </div>
      </div>
      <div class="dbg-section">
        <h4>🐛 デバッグログ</h4>
        <div class="dbg-row">
          <label><input type="checkbox" id="dbg-enable-cb" onchange="_dbgSetEnabled(this.checked)"> 操作・エラーを記録する</label>
        </div>
        <div class="dbg-row">
          <span style="color:var(--text3)">記録件数:</span><span id="dbg-count" style="font-family:ui-monospace,monospace">0件</span>
        </div>
        <div class="dbg-btns">
          <button class="dbg-btn" onclick="_dbgCopy()">📋 コピー</button>
          <button class="dbg-btn" onclick="_dbgDownload()">💾 保存</button>
          <button class="dbg-btn" onclick="_dbgClear()" style="background:#3a1010;border-color:var(--red);color:#f88">🗑️ 消去</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.6">
          ONにすると画面右下に 🐛 バッジが出ます。バグを再現後、コピーまたは保存でログを取り出してください（最新500件まで保持）。
        </div>
      </div>
      <div style="margin-top:14px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r)">
        <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:6px">📄 クレジット</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.9">
          <div>🌤 天気：<a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:var(--amber)">Open-Meteo</a>（CC BY 4.0）/ <a href="https://wttr.in/" target="_blank" rel="noopener" style="color:var(--amber)">wttr.in</a></div>
          <div>📍 住所検索：<a href="https://www.gsi.go.jp/" target="_blank" rel="noopener" style="color:var(--amber)">国土地理院</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:var(--amber)">© OpenStreetMap contributors</a></div>
          <div>🛣 施設情報：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:var(--amber)">OpenStreetMap</a>（ODbL）</div>
        </div>
      </div>
    </div>
    <div style="padding:14px 16px;border-top:1px solid var(--border);flex-shrink:0">
      <button onclick="_saveSplashSettings()" style="width:100%;justify-content:center;padding:14px;font-size:17px;background:var(--amber);border-color:var(--amber);color:#000;font-weight:800">✅ 保存して閉じる</button>
    </div>
  </div>`;
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  // デバッグUI初期化
  try{
    const cb=document.getElementById('dbg-enable-cb');
    if(cb) cb.checked=!!_dbgEnabled;
    _dbgRefreshSettings();
  }catch(e){}
  if(window.visualViewport){
    _bindOverlayVp(ov,applyVp);
  }
  const closeBtn=document.getElementById('ss-close-btn');
  if(closeBtn) closeBtn.onclick=()=>{
    _closeOverlay('splash-settings-overlay');
    requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));
  };
}
function _updateEpisodePreview(){
  const val=(document.getElementById('ss-episode')?.value||'').trim();
  const prev=document.getElementById('ss-episode-preview');
  if(prev) prev.textContent=val?_numToEpisode(val):'';
}
function _saveSplashSettings(){
  splashSettings.star=sanitize(document.getElementById('ss-star')?.value||'',20);
  const epRaw=(document.getElementById('ss-episode')?.value||'').trim();
  const epNum=parseInt(epRaw,10);
  splashSettings.episode=(Number.isInteger(epNum)&&epNum>=1&&epNum<=99)?String(epNum):'';
  splashSettings.title=sanitize(document.getElementById('ss-title')?.value||'',40);
  try{_lsSetItem(SPLASH_SK,JSON.stringify(splashSettings));}catch(e){}
  document.getElementById('ss-close-btn')?.click();
  showInfoToast('📜 タイトル設定を保存しました',2000);
}

/* ══ オーバーレイ一括掃除 (主要操作前の保険) ══ */
const _OVERLAY_IDS=['share-overlay','splash-settings-overlay','highway-overlay','michi-overlay','gs-overlay'];
/* ── visualViewport オーバーレイ共通ユーティリティ ── */
function _lowerHeaderForOverlay(){
  // overlay表示中はstickyヘッダーがoverlayより前面に来るのを防ぐ
  const h=document.querySelector('header');
  if(h) h.style.zIndex='1';
}
function _makeApplyVp(ov){
  return function(){
    const vv=window.visualViewport;
    if(!vv)return;
    ov.style.top=vv.offsetTop+'px';
    ov.style.left=vv.offsetLeft+'px';
    ov.style.width=vv.width+'px';
    ov.style.height=vv.height+'px';
  };
}
function _bindOverlayVp(ov,applyVp){
  if(!window.visualViewport)return;
  window.visualViewport.addEventListener('resize',applyVp);
  window.visualViewport.addEventListener('scroll',applyVp);
  applyVp();
  ov._applyVp=applyVp; // _closeAllOverlays で unbind するため要素に保存
}
function _unbindOverlayVp(applyVp){
  window.visualViewport?.removeEventListener('resize',applyVp);
  window.visualViewport?.removeEventListener('scroll',applyVp);
}
function _closeOverlay(id){ // 個別overlay閉じる時のvisualViewportリスナーリーク防止
  const el=document.getElementById(id);
  if(!el)return;
  if(el._applyVp) _unbindOverlayVp(el._applyVp);
  el.remove();
  // 全overlay閉じたらヘッダーのz-indexを復元
  if(!_OVERLAY_IDS.some(i=>document.getElementById(i))) document.querySelector('header').style.zIndex='';
}
function _closeAllOverlays(except){
  for(const id of _OVERLAY_IDS){
    if(except===id) continue;
    const el=document.getElementById(id);
    if(!el) continue;
    if(el._applyVp) _unbindOverlayVp(el._applyVp); // visualViewport リスナーリーク防止
    el.remove();
  }
  // overlayが全て閉じたらヘッダーのz-indexを復元
  if(!except||!document.getElementById(except)) document.querySelector('header').style.zIndex='';
}

