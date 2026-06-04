/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 15-mappicker.js
   地図で地点を選ぶ（中央固定ピン方式）。
   ・検索: LocationIQ(OSM/Nominatim相当) を countrycodes=jp + 表示中エリアにバイアス。
           ヒットは地図に番号ピンで複数表示し、タップで採用（1件目を自動確定しない）。
   ・失敗/キー無効時: 地理院(GSI)住所検索 → さらに失敗なら手動ドラッグ。
   ・確定: 中央の座標を #inp-addr に「lat, lon」で書き込み _updateGeoHint() を呼ぶだけ。
           保存時に saveStop()→parseCoord() が geo に確定する（既存経路に相乗り）。
   ・タイル: 地理院（鍵不要・商用可・キャッシュ可、出典表記要）。標準/淡色/航空写真を切替。
   依存(実行時): Leaflet(window.L) を index.html で読み込み済みであること。
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

import { parseCoord } from './02-utils.js';
import { _updateGeoHint } from './05-stop.js';
import { showInfoToast } from './07-render.js';
import { _dbgLog } from './12-debug.js';

/* ━━ 設定 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ▼▼▼ ここに自分の LocationIQ Access Token を入れる ▼▼▼
   取得: https://my.locationiq.com/ → 「Access Tokens」の pk.xxxx をコピー。
   公開サイトなので、ダッシュボードで HTTP Referrer 制限（例: i555.github.io/*）を
   必ず設定すること（鍵が露出しても他サイトから使えなくなる）。
   ※ チャット等に出してしまったキーは revoke して再発行したものを使う。            */
const LIQ_KEY = 'pk.REPLACE_WITH_YOUR_LOCATIONIQ_TOKEN';
const LIQ_HOST = 'https://us1.locationiq.com'; // 必要なら 'https://eu1.locationiq.com'
const DEFAULT_CENTER = [35.681236, 139.767125]; // 東京駅（既存座標も現在地も取れない時の初期位置）
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';

let _map = null;            // Leaflet マップ（使い回す）
let _layer = null;          // 現在のタイルレイヤ
let _resMarkers = [];       // 検索候補ピン
let _results = [];          // 検索候補データ
const _cache = new Map();   // 同一語の再検索抑制（セッション内）

const fmt = n => n.toFixed(6);

/* ── ピッカーの骨組み（初回のみ生成） ── */
function buildOverlay(){
  if(document.getElementById('mp-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'mp-overlay';
  ov.className = 'mp-overlay';
  ov.innerHTML = `
    <div class="mp-sheet" role="dialog" aria-label="地図で地点を選ぶ">
      <div class="mp-head">
        <h2>📍 地図で地点を選ぶ</h2>
        <span class="mp-sub" id="mp-sub"></span>
        <button type="button" class="mp-close" id="mp-close" aria-label="閉じる">✕</button>
      </div>
      <div class="mp-search">
        <input id="mp-q" type="text" placeholder="駅名・施設名・住所で検索 → 🔍/Enter" autocomplete="off">
        <button type="button" id="mp-go" aria-label="検索">🔍</button>
      </div>
      <div class="mp-note mp-ok" id="mp-note"></div>
      <div class="mp-cands" id="mp-cands"></div>
      <div class="mp-mapwrap" id="mp-mapwrap">
        <div id="mp-map"></div>
        <div class="mp-seg" id="mp-seg">
          <button type="button" data-l="std" class="on">地図</button>
          <button type="button" data-l="pale">淡色</button>
          <button type="button" data-l="photo">📷 写真</button>
        </div>
        <div class="mp-dot"></div>
        <div class="mp-pin">📍</div>
        <div class="mp-credit">地理院タイル</div>
      </div>
      <div class="mp-readout">
        <div class="mp-ll"><span class="mp-lbl">中央の座標（この点を登録）</span><span class="mp-v" id="mp-ll">—</span></div>
        <button type="button" class="mp-loc" id="mp-loc">🧭 現在地</button>
      </div>
      <div class="mp-foot">
        <button type="button" class="mp-ghost" id="mp-cancel">戻る</button>
        <button type="button" class="mp-confirm" id="mp-confirm">✓ この地点に決定</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  // 閉じる系
  ov.querySelector('#mp-close').onclick = closePicker;
  ov.querySelector('#mp-cancel').onclick = closePicker;
  ov.addEventListener('click', e => { if(e.target === ov) closePicker(); }); // 背景タップで閉じる

  // 検索
  ov.querySelector('#mp-go').onclick = doSearch;
  ov.querySelector('#mp-q').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); doSearch(); } });

  // 現在地・決定
  ov.querySelector('#mp-loc').onclick = openAtCurrent;
  ov.querySelector('#mp-confirm').onclick = confirmPick;
}

/* ── Leaflet マップ初期化（初回のみ） ── */
function ensureMap(){
  if(_map) return true;
  if(!window.L){ showInfoToast('⚠️ 地図ライブラリを読み込めませんでした', 4000); return false; }
  const L = window.L;
  _map = L.map('mp-map', { zoomControl:true, attributionControl:false }).setView(DEFAULT_CENTER, 14);
  _layer = tileLayer('std');
  _layer.addTo(_map);

  const wrap = document.getElementById('mp-mapwrap');
  const ll = document.getElementById('mp-ll');
  const upd = () => { const c = _map.getCenter(); ll.textContent = fmt(c.lat) + ', ' + fmt(c.lng); };
  upd();
  _map.on('move', upd);
  _map.on('movestart', () => wrap.classList.add('dragging'));
  _map.on('moveend', () => wrap.classList.remove('dragging'));

  // レイヤ切替
  document.querySelectorAll('#mp-seg button').forEach(b => {
    b.onclick = () => {
      _map.removeLayer(_layer);
      _layer = tileLayer(b.dataset.l);
      _layer.addTo(_map);
      document.querySelectorAll('#mp-seg button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  return true;
}
function tileLayer(kind){
  const L = window.L;
  if(kind === 'pale')  return L.tileLayer(GSI + 'pale/{z}/{x}/{y}.png', { maxZoom:18, minZoom:5 });
  if(kind === 'photo') return L.tileLayer(GSI + 'seamlessphoto/{z}/{x}/{y}.jpg', { maxZoom:18, minZoom:5 });
  return L.tileLayer(GSI + 'std/{z}/{x}/{y}.png', { maxZoom:18, minZoom:5 });
}

/* ── 公開: ピッカーを開く ── */
export function openLocationPicker(){
  buildOverlay();
  const ov = document.getElementById('mp-overlay');
  ov.classList.add('show');
  document.body.classList.add('mp-open');

  // 文脈: 編集中の地点名をサブタイトルに
  const nm = (document.getElementById('inp-name')?.value || '').trim();
  document.getElementById('mp-sub').textContent = nm;
  document.getElementById('mp-q').value = nm; // 名前を初期クエリに（任意で検索しやすく）
  clearResults();
  document.getElementById('mp-cands').classList.remove('show');

  if(!ensureMap()) return;
  // レイアウト確定後にサイズ再計算（潰れ/タイル欠け対策）
  setTimeout(() => {
    _map.invalidateSize();
    // 初期位置: 既存の座標 → 現在地 → デフォルト
    const cur = parseCoord(document.getElementById('inp-addr')?.value || '');
    if(cur){
      _map.setView([cur.lat, cur.lon], 17);
      note('既存の座標を表示中。検索かドラッグで調整できます。', true);
    }else{
      openAtCurrent();
    }
  }, 60);
  _dbgLog('mappicker_open', { hasName: !!nm });
}

function closePicker(){
  const ov = document.getElementById('mp-overlay');
  if(ov) ov.classList.remove('show');
  document.body.classList.remove('mp-open');
}

function note(msg, ok){
  const el = document.getElementById('mp-note');
  if(!el) return;
  el.className = 'mp-note' + (ok ? ' mp-ok' : '');
  el.textContent = msg;
}

/* ── 現在地から開始 ── */
function openAtCurrent(){
  if(!navigator.geolocation){ note('初期位置を表示。地図を動かして合わせてください。', true); return; }
  note('現在地を取得中…', true);
  navigator.geolocation.getCurrentPosition(
    p => { _map.setView([p.coords.latitude, p.coords.longitude], 17); note('現在地から開始。検索かドラッグで合わせてください。', true); },
    () => { note('現在地が取れないので初期位置を表示。地図を動かして合わせてください。', true); },
    { enableHighAccuracy:true, timeout:8000, maximumAge:0 }
  );
}

/* ── 検索バックエンド ── */
async function searchLocationIQ(q){
  if(!LIQ_KEY || LIQ_KEY.indexOf('REPLACE_WITH') !== -1){ const e = new Error('NOKEY'); e.nokey = true; throw e; }
  const b = _map.getBounds();
  const vb = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map(x => x.toFixed(4)).join(',');
  const u = LIQ_HOST + '/v1/search?key=' + encodeURIComponent(LIQ_KEY)
    + '&q=' + encodeURIComponent(q) + '&format=json&limit=5&accept-language=ja&countrycodes=jp&dedupe=1'
    + '&viewbox=' + vb + '&bounded=0';
  const r = await fetch(u);
  if(!r.ok){ if(r.status === 401 || r.status === 403) throw new Error('キー無効'); throw new Error('HTTP ' + r.status); }
  const j = await r.json();
  if(j && j.error) throw new Error(String(j.error));
  return (Array.isArray(j) ? j : []).map(f => ({ lat:+f.lat, lon:+f.lon, name:f.display_name }));
}
async function searchGSI(q){
  const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
  const j = await r.json();
  return (Array.isArray(j) ? j : []).slice(0, 5).map(f => ({
    lat:+f.geometry.coordinates[1], lon:+f.geometry.coordinates[0],
    name:(f.properties && f.properties.title) || q
  }));
}

const shortName = s => (s || '').split(',').slice(0, 3).join(',');
function numPin(n, active){
  const L = window.L, c = active ? '#d33' : '#2b6fd6';
  return L.divIcon({ className:'', iconSize:[26,26], iconAnchor:[13,13],
    html:'<div style="width:24px;height:24px;border-radius:50%;background:' + c +
         ';color:#fff;font:800 13px sans-serif;display:flex;align-items:center;justify-content:center;' +
         'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)">' + n + '</div>' });
}
function clearResults(){ _resMarkers.forEach(m => _map && _map.removeLayer(m)); _resMarkers = []; _results = []; }

function selectCand(i){
  const r = _results[i]; if(!r) return;
  _map.setView([r.lat, r.lon], Math.max(_map.getZoom(), 17));
  _resMarkers.forEach((m, k) => m.setIcon(numPin(k + 1, k === i)));
  const cands = document.getElementById('mp-cands');
  [...cands.children].forEach((el, k) => el.classList.toggle('sel', k === i));
  note('候補' + (i + 1) + '：' + shortName(r.name) + ' を表示中。違えば他の候補/ドラッグで調整。', true);
}
function showCands(list){
  _results = list;
  clearResults();
  _results = list;
  const cands = document.getElementById('mp-cands');
  cands.innerHTML = '';
  const L = window.L, pts = [];
  list.forEach((r, i) => {
    const m = L.marker([r.lat, r.lon], { icon:numPin(i + 1, false) }).addTo(_map);
    m.on('click', () => selectCand(i));
    _resMarkers.push(m); pts.push([r.lat, r.lon]);
    const el = document.createElement('div');
    el.className = 'mp-cand';
    el.innerHTML = '<span class="mp-b">' + (i + 1) + '</span><span class="mp-nm"></span>';
    el.querySelector('.mp-nm').textContent = shortName(r.name);
    el.onclick = () => selectCand(i);
    cands.appendChild(el);
  });
  cands.classList.add('show');
  if(pts.length) _map.fitBounds(pts, { padding:[50,50], maxZoom:17 });
  selectCand(0);
}

async function doSearch(){
  const q = (document.getElementById('mp-q').value || '').trim();
  if(!q) return;
  if(_cache.has(q)){ showCands(_cache.get(q)); return; }
  note('検索中…', true);
  let res = [];
  try{
    res = await searchLocationIQ(q);
  }catch(e){
    note(e.nokey ? 'LocationIQキー未設定のためGSIで代用（駅名は外しやすい）…'
                 : 'LocationIQ失敗（' + (e.message || e) + '）→ GSIで代用…', false);
    try{ res = await searchGSI(q); }catch(e2){ res = []; }
  }
  if(!res.length){
    document.getElementById('mp-cands').classList.remove('show');
    clearResults();
    note('見つかりませんでした。地図を動かして直接合わせてください。', false);
    return;
  }
  _cache.set(q, res);
  showCands(res);
  _dbgLog('mappicker_search', { q: q.slice(0, 30), n: res.length });
}

/* ── 決定: 住所欄へ座標を書き込み、既存のgeo確定経路に乗せる ── */
function confirmPick(){
  const c = _map.getCenter();
  const v = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
  const inp = document.getElementById('inp-addr');
  if(inp){ inp.value = v; }
  if(typeof window._updateGeoHint === 'function') window._updateGeoHint();
  else _updateGeoHint();
  closePicker();
  showInfoToast('📍 地図で座標を設定しました。保存で確定します', 3500);
  _dbgLog('mappicker_pick', { lat:+c.lat.toFixed(6), lon:+c.lng.toFixed(6) });
}
