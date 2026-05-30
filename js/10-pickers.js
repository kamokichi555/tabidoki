/* ══════════════════════════════════════════════════════
   旅刻 mk17 — 10-pickers.js
   施設選択モーダル（高速道路 / 道の駅 / GS / 快活CLUB / トイレ）
   依存: 00-constants.js, 02-utils.js（esc/escJsAttr）, 04-weather.js（_lsSetItem）
   実行時依存: _dbgLog, showInfoToast, _setFuelCheck, _closeOverlay
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* --- 自動生成: モジュール依存のインポート --- */
import { debounce, esc, escJsAttr, fetchWithTimeout, mapsSearchUrl } from './02-utils.js';
import { _lsSetItem } from './04-weather.js';
import { _updateStickyTops } from './06-day.js';
import { _bindOverlayVp, _closeAllOverlays, _closeOverlay, _lowerHeaderForOverlay, _makeApplyVp, _setDetailsOpen, _setFuelCheck } from './11-overlays.js';
import { _dbgLog, _dbgSnapshot } from './12-debug.js';


/* ══ 高速道路施設選択モーダル（Overpass API + localStorageキャッシュ） ══ */
export const HIGHWAY_FALLBACK=[
  ['海老名SA（上り）','神奈川県海老名市'],['海老名SA（下り）','神奈川県海老名市'],
  ['足柄SA（上り）','静岡県小山町'],['足柄SA（下り）','静岡県小山町'],
  ['駿河湾沼津SA（上り）','静岡県沼津市'],['駿河湾沼津SA（下り）','静岡県沼津市'],
  ['NEOPASA静岡（上り）','静岡県静岡市'],['NEOPASA静岡（下り）','静岡県静岡市'],
  ['NEOPASA清水（上り）','静岡県静岡市清水区'],['NEOPASA清水（下り）','静岡県静岡市清水区'],
  ['浜名湖SA（上り）','静岡県湖西市'],['浜名湖SA（下り）','静岡県湖西市'],
  ['NEOPASA岡崎（上り）','愛知県岡崎市'],['NEOPASA岡崎（下り）','愛知県岡崎市'],
  ['刈谷ハイウェイオアシス','愛知県刈谷市'],
  ['談合坂SA（上り）','山梨県上野原市'],['談合坂SA（下り）','山梨県上野原市'],
  ['双葉SA（上り）','山梨県甲斐市'],['双葉SA（下り）','山梨県甲斐市'],
  ['諏訪湖SA（上り）','長野県諏訪市'],['諏訪湖SA（下り）','長野県諏訪市'],
  ['駒ヶ根SA（上り）','長野県駒ヶ根市'],['駒ヶ根SA（下り）','長野県駒ヶ根市'],
  ['恵那峡SA（上り）','岐阜県中津川市'],['恵那峡SA（下り）','岐阜県中津川市'],
  ['三芳PA（上り）','埼玉県入間郡三芳町'],['三芳PA（下り）','埼玉県入間郡三芳町'],
  ['高坂SA（上り）','埼玉県東松山市'],['高坂SA（下り）','埼玉県東松山市'],
  ['上里SA（上り）','埼玉県児玉郡上里町'],['上里SA（下り）','埼玉県児玉郡上里町'],
  ['赤城高原SA（上り）','群馬県渋川市'],['赤城高原SA（下り）','群馬県渋川市'],
  ['三国SA（上り）','新潟県南魚沼郡湯沢町'],['三国SA（下り）','新潟県南魚沼郡湯沢町'],
  ['蓮田SA（上り）','埼玉県蓮田市'],['蓮田SA（下り）','埼玉県蓮田市'],
  ['佐野SA（上り）','栃木県佐野市'],['佐野SA（下り）','栃木県佐野市'],
  ['上河内SA（上り）','栃木県宇都宮市'],['上河内SA（下り）','栃木県宇都宮市'],
  ['那須高原SA（上り）','栃木県那須郡那須町'],['那須高原SA（下り）','栃木県那須郡那須町'],
  ['国見SA（上り）','福島県伊達郡国見町'],['国見SA（下り）','福島県伊達郡国見町'],
  ['長者原SA（上り）','宮城県黒川郡大和町'],
  ['前沢SA（上り）','岩手県奥州市'],['前沢SA（下り）','岩手県奥州市'],
  ['守谷SA（上り）','茨城県守谷市'],['守谷SA（下り）','茨城県守谷市'],
  ['中郷SA（上り）','茨城県北茨城市'],['中郷SA（下り）','茨城県北茨城市'],
  ['有磯海SA（上り）','富山県魚津市'],['有磯海SA（下り）','富山県魚津市'],
  ['尼御前SA（上り）','石川県加賀市'],
  ['南条SA（上り）','福井県南条郡南越前町'],['南条SA（下り）','福井県南条郡南越前町'],
  ['賤ヶ岳SA（上り）','滋賀県長浜市'],['賤ヶ岳SA（下り）','滋賀県長浜市'],
  ['多賀SA（上り）','滋賀県犬上郡多賀町'],['多賀SA（下り）','滋賀県犬上郡多賀町'],
  ['養老SA（上り）','岐阜県養老郡養老町'],['養老SA（下り）','岐阜県養老郡養老町'],
  ['土山SA（上り）','滋賀県甲賀市'],['土山SA（下り）','滋賀県甲賀市'],
  ['EXPASA芦屋（上り）','兵庫県芦屋市'],['EXPASA芦屋（下り）','兵庫県芦屋市'],
  ['三木SA（上り）','兵庫県三木市'],['三木SA（下り）','兵庫県三木市'],
  ['吉備SA（上り）','岡山県赤磐市'],['吉備SA（下り）','岡山県赤磐市'],
  ['福山SA（上り）','広島県福山市'],['宮島SA（上り）','広島県廿日市市'],['宮島SA（下り）','広島県廿日市市'],
  ['徳山西SA（上り）','山口県周南市'],
  ['古賀SA（上り）','福岡県古賀市'],
  ['金立SA（上り）','佐賀県佐賀市'],['金立SA（下り）','佐賀県佐賀市'],
  ['広川SA（上り）','福岡県八女郡広川町'],['八代SA（上り）','熊本県八代市'],
  ['えびのSA（上り）','宮崎県えびの市'],['霧島SA（上り）','鹿児島県霧島市'],
  ['磐梯山SA（上り）','福島県耶麻郡磐梯町'],['磐梯山SA（下り）','福島県耶麻郡磐梯町'],
  // スマートIC
  ['海老名スマートIC','神奈川県海老名市'],
  ['綾瀬スマートIC','神奈川県綾瀬市'],
  ['清水いはらスマートIC','静岡県静岡市清水区'],
  ['浜松スマートIC','静岡県浜松市東区'],
  ['豊田上郷スマートIC','愛知県豊田市'],
  ['岡崎スマートIC','愛知県岡崎市'],
  ['甲府昭和スマートIC','山梨県中巨摩郡昭和町'],
  ['諏訪南スマートIC','長野県諏訪郡富士見町'],
  ['伊那スマートIC','長野県伊那市'],
  ['久喜白岡スマートIC','埼玉県白岡市'],
  ['嵐山小川スマートIC','埼玉県比企郡小川町'],
  ['本庄スマートIC','埼玉県本庄市'],
  ['三芳スマートIC','埼玉県入間郡三芳町'],
  ['佐野スマートIC','栃木県佐野市'],
  ['真岡スマートIC','栃木県真岡市'],
  ['菅生スマートIC','宮城県柴田郡村田町'],
  ['守谷スマートIC','茨城県守谷市'],
  ['桜土浦スマートIC','茨城県土浦市'],
  ['多賀スマートIC','滋賀県犬上郡多賀町'],
  ['草津田上スマートIC','滋賀県草津市'],
  ['神戸西スマートIC','兵庫県神戸市西区'],
  ['岡山総社スマートIC','岡山県総社市'],
  ['高松東スマートIC','香川県高松市'],
  ['福岡IC（スマート）','福岡県福岡市東区'],
  // 主要JCT
  ['大井JCT','東京都品川区'],
  ['海老名JCT','神奈川県海老名市'],
  ['御殿場JCT','静岡県御殿場市'],
  ['浜松JCT','静岡県浜松市北区'],
  ['豊田JCT','愛知県豊田市'],
  ['小牧JCT','愛知県小牧市'],
  ['四日市JCT','三重県四日市市'],
  ['草津JCT','滋賀県草津市'],
  ['吹田JCT','大阪府吹田市'],
  ['西宮JCT','兵庫県西宮市'],
  ['神戸JCT','兵庫県神戸市北区'],
  ['山陽JCT','岡山県赤磐市'],
  ['岡山JCT','岡山県岡山市北区'],
  ['福山西JCT','広島県福山市'],
  ['広島JCT','広島県広島市安佐北区'],
  ['山口JCT','山口県山口市'],
  ['鳥栖JCT','佐賀県鳥栖市'],
  ['八幡JCT','福岡県北九州市八幡西区'],
  ['八王子JCT','東京都八王子市'],
  ['川口JCT','埼玉県川口市'],
  ['久喜白岡JCT','埼玉県久喜市'],
  ['栃木都賀JCT','栃木県栃木市'],
  ['矢板北PA・スマートIC','栃木県矢板市'],
  ['仙台南JCT','宮城県仙台市太白区'],
  ['村田JCT','宮城県柴田郡村田町'],
  ['三郷JCT','埼玉県三郷市'],
  ['千葉JCT','千葉県千葉市花見川区'],
  // ハイウェイオアシス（追加分）
  ['ハイウェイオアシス竜王','山梨県甲斐市'],
  ['ハイウェイオアシス尾張一宮','愛知県一宮市'],
  ['ハイウェイオアシス草津','滋賀県草津市'],
  ['ハイウェイオアシス大津','滋賀県大津市'],
  // 主要IC（乗降・集合ポイント）
  // 首都圏・東名
  ['港北IC','神奈川県横浜市港北区'],
  ['横浜町田IC','神奈川県横浜市瀬谷区'],
  ['横浜青葉IC','神奈川県横浜市青葉区'],
  ['東名川崎IC','神奈川県川崎市麻生区'],
  ['東京IC','東京都世田谷区'],
  ['高井戸IC','東京都杉並区'],
  ['調布IC','東京都調布市'],
  ['八王子IC','東京都八王子市'],
  ['厚木IC','神奈川県厚木市'],
  ['相模原愛川IC','神奈川県愛甲郡愛川町'],
  ['橋本IC','神奈川県相模原市緑区'],
  ['大月IC','山梨県大月市'],
  ['河口湖IC','山梨県富士河口湖町'],
  ['須走IC','静岡県駿東郡小山町'],
  ['御殿場IC','静岡県御殿場市'],
  ['沼津IC','静岡県沼津市'],
  ['富士IC','静岡県富士市'],
  ['清水IC','静岡県静岡市清水区'],
  ['静岡IC','静岡県静岡市葵区'],
  ['焼津IC','静岡県焼津市'],
  ['浜松IC','静岡県浜松市東区'],
  ['豊川IC','愛知県豊川市'],
  ['岡崎IC','愛知県岡崎市'],
  ['豊田IC','愛知県豊田市'],
  ['名古屋IC','愛知県名古屋市名東区'],
  // 関越・東北方面
  ['所沢IC','埼玉県所沢市'],
  ['鶴ヶ島IC','埼玉県鶴ヶ島市'],
  ['花園IC','埼玉県深谷市'],
  ['藤岡IC','群馬県藤岡市'],
  ['前橋IC','群馬県前橋市'],
  ['渋川伊香保IC','群馬県渋川市'],
  ['月夜野IC','群馬県みなかみ町'],
  ['湯沢IC','新潟県南魚沼郡湯沢町'],
  ['長岡IC','新潟県長岡市'],
  ['新潟IC','新潟県新潟市東区'],
  ['宇都宮IC','栃木県宇都宮市'],
  ['矢板IC','栃木県矢板市'],
  ['那須IC','栃木県那須郡那須町'],
  ['白河IC','福島県白河市'],
  ['郡山IC','福島県郡山市'],
  ['福島飯坂IC','福島県福島市'],
  ['仙台南IC','宮城県仙台市太白区'],
  ['仙台宮城IC','宮城県仙台市青葉区'],
  ['古川IC','宮城県大崎市'],
  ['北上江釣子IC','岩手県北上市'],
  ['盛岡IC','岩手県盛岡市'],
  // 中央道
  ['相模湖IC','神奈川県相模原市緑区'],
  ['上野原IC','山梨県上野原市'],
  ['甲府昭和IC','山梨県中巨摩郡昭和町'],
  ['甲府南IC','山梨県甲府市'],
  ['小淵沢IC','山梨県北杜市'],
  ['諏訪IC','長野県諏訪市'],
  ['岡谷IC','長野県岡谷市'],
  ['伊那IC','長野県伊那市'],
  ['駒ヶ根IC','長野県駒ヶ根市'],
  ['飯田IC','長野県飯田市'],
  ['中津川IC','岐阜県中津川市'],
  ['多治見IC','岐阜県多治見市'],
  // 北陸道
  ['柏崎IC','新潟県柏崎市'],
  ['上越IC','新潟県上越市'],
  ['糸魚川IC','新潟県糸魚川市'],
  ['魚津IC','富山県魚津市'],
  ['富山IC','富山県富山市'],
  ['小矢部IC','富山県小矢部市'],
  ['金沢森本IC','石川県金沢市'],
  ['金沢西IC','石川県金沢市'],
  ['小松IC','石川県小松市'],
  ['加賀IC','石川県加賀市'],
  ['福井IC','福井県福井市'],
  ['敦賀IC','福井県敦賀市'],
  // 名神・新名神
  ['彦根IC','滋賀県彦根市'],
  ['京都東IC','京都府京都市山科区'],
  ['京都南IC','京都府京都市伏見区'],
  ['大津IC','滋賀県大津市'],
  ['西宮IC','兵庫県西宮市'],
  ['宝塚IC','兵庫県宝塚市'],
  ['神戸IC','兵庫県神戸市北区'],
  // 山陽・九州
  ['龍野IC','兵庫県たつの市'],
  ['備前IC','岡山県備前市'],
  ['岡山IC','岡山県岡山市北区'],
  ['倉敷IC','岡山県倉敷市'],
  ['福山東IC','広島県福山市'],
  ['広島IC','広島県広島市安佐北区'],
  ['広島西IC','広島県広島市西区'],
  ['山口IC','山口県山口市'],
  ['下関IC','山口県下関市'],
  ['北九州IC','福岡県北九州市八幡西区'],
  ['福岡IC','福岡県福岡市東区'],
  ['太宰府IC','福岡県太宰府市'],
  ['熊本IC','熊本県熊本市北区'],
  ['鹿児島IC','鹿児島県鹿児島市'],
];
export let HIGHWAY_DATA=HIGHWAY_FALLBACK;
export let _highwayLoading=false;
/* 一度に描画する施設リストの最大行数（大量ノードの一括innerHTML生成を防ぐ） */
export const PICKER_CAP=150;

/* ── 施設データマージ共通関数 ── */
export function _mergeFacilityData(fallback,online){
  const merged=fallback.slice();
  const existing=new Set(merged.map(m=>m[0]));
  for(const entry of online){
    if(!existing.has(entry[0])) merged.push(entry);
  }
  merged.sort((a,b)=>{const pa=a[1]||'',pb=b[1]||'';return pa<pb?-1:pa>pb?1:0;});
  return merged;
}
/* ── 共通: OSMタグから住所(都道府県+市区町村)を抽出 ── */
export function _extractAddr(tags){
  let addr='';
  const addrFull=tags?.['addr:full']||'';
  if(addrFull){const m=addrFull.match(/^(.+?[都道府県].+?[市区町村])/);addr=m?m[1]:'';}
  if(!addr){
    const pref=tags?.['addr:prefecture']||tags?.['addr:province']||'';
    const city=tags?.['addr:city']||tags?.['addr:town']||tags?.['addr:village']||'';
    addr=pref?(city?pref+city:pref):'';
  }
  return addr;
}
/* ── 共通: 施設キャッシュ読込（TTL・件数しきい値チェック） → {d,t} or null ── */
export function _readFacilityCache(key,ttlMs,minCount){
  try{
    const cached=localStorage.getItem(key);
    if(cached){
      const o=JSON.parse(cached);
      if(o&&Date.now()-o.t<ttlMs&&Array.isArray(o.d)&&o.d.length>minCount) return o;
    }
  }catch(e){}
  return null;
}
/* ── 共通: Overpass APIへPOST（120秒タイムアウト） → elements配列 ── */
export async function _overpassFetch(body){
  const resp=await fetchWithTimeout('https://overpass-api.de/api/interpreter',{method:'POST',body,credentials:'omit'},120000);
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  const json=await resp.json();
  return json.elements||[];
}

/* ── 共通: 施設選択ボトムシートを開く（高速/道の駅/GS共通） ──
   cfg: {prefix, title, heightPct, placeholder, oninput, renderList,
         hintHtml='', listPadding='8px 0', afterOpen?} */
export function _openPickerModal(cfg){
  _closeAllOverlays();
  const id=cfg.prefix;
  const ov=document.createElement('div');
  ov.id=id+'-overlay';
  const applyVp=_makeApplyVp(ov);
  Object.assign(ov.style,{position:'fixed',top:'0',left:'0',width:'100%',height:'100%',zIndex:'999999',background:'rgba(0,0,0,.88)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0'});
  ov.innerHTML=`<div style="background:var(--bg2);border-radius:16px 16px 0 0;width:100%;max-width:480px;height:${cfg.heightPct}%;display:flex;flex-direction:column;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <span style="font-weight:700;font-size:16px">${cfg.title}</span>
      <button id="${id}-close-btn" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="padding:10px 12px;flex-shrink:0;border-bottom:1px solid var(--border)">
      <input id="${id}-search" type="text" placeholder="${cfg.placeholder}" oninput="${cfg.oninput}" style="width:100%;background:var(--bg3);border:1.5px solid var(--border2);border-radius:10px;color:var(--text);font-size:16px;padding:10px 12px;font-family:inherit">
    </div>
    ${cfg.hintHtml||''}
    <div id="${id}-list" style="overflow-y:auto;flex:1;padding:${cfg.listPadding||'8px 0'};-webkit-overflow-scrolling:touch"></div>
  </div>`;
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  _bindOverlayVp(ov,applyVp);
  const closeBtn=document.getElementById(id+'-close-btn');
  if(closeBtn) closeBtn.onclick=()=>{_closeOverlay(id+'-overlay');requestAnimationFrame(()=>requestAnimationFrame(_updateStickyTops));};
  if(cfg.afterOpen) cfg.afterOpen();
  const _q=(document.getElementById('inp-name')?.value||'').trim();
  const _s=ov.querySelector('#'+id+'-search');
  if(_s&&_q) _s.value=_q;
  cfg.renderList(_q);
  setTimeout(()=>{const el=document.getElementById(id+'-search');if(el){el.focus();if(_q) el.select();}},100);
}

/* 施設オンライン取得の共通スケルトン（高速/道の駅）。cfg:
   {isLoading, setLoading, searchId, filter, cacheKey, minCount, query, parseEls, merge, kind, failMsg}
   ・キャッシュ確認(24h,minCount件)→Overpass取得→parseElsで整形→minCount超なら保存&マージ
   ・loadingフラグのON/OFFと検索ボックス再描画(filter)はここで一元化 */
async function _fetchFacilityOnline(cfg){
  if(cfg.isLoading()) return;
  cfg.setLoading(true);
  const _refresh=()=>{const s=document.getElementById(cfg.searchId);if(s)cfg.filter();};
  _refresh();
  try{
    const cached=_readFacilityCache(cfg.cacheKey,24*60*60*1000,cfg.minCount);
    if(cached){cfg.merge(cached.d);return;}
    const els=await _overpassFetch(cfg.query);
    const result=cfg.parseEls(els);
    if(result.length>cfg.minCount){
      const json=JSON.stringify({d:result,t:Date.now()});if(json.length<600000)try{_lsSetItem(cfg.cacheKey,json);}catch(e){}
      cfg.merge(result);
    }
  }catch(e){
    console.log(cfg.failMsg,e?.message);
    _dbgLog('facility_fetch_failed',{kind:cfg.kind,err:String(e&&e.message||e).slice(0,120)});
  }finally{
    cfg.setLoading(false);
    const s=document.getElementById(cfg.searchId);if(s)cfg.filter();
  }
}
export function _mergeHighwayData(online){
  HIGHWAY_DATA=_mergeFacilityData(HIGHWAY_FALLBACK,online);
}

export async function _fetchHighwayOnline(){
  return _fetchFacilityOnline({
    isLoading:()=>_highwayLoading, setLoading:v=>{_highwayLoading=v;},
    searchId:'highway-search', filter:filterHighway,
    cacheKey:'highway_online_v1', minCount:30,
    query:`[out:json][timeout:100];\nnwr["highway"="services"]["name"~"SA|PA|サービスエリア|パーキングエリア|オアシス|EXPASA|NEOPASA"](24,122,46,155);\nout center tags;`,
    parseEls:els=>{
      const result=[];const seen=new Set();
      for(const el of els){
        const name=(el.tags?.name||'').trim();
        if(!name||seen.has(name)) continue;
        seen.add(name);
        result.push([name,_extractAddr(el.tags)]);
      }
      return result;
    },
    merge:_mergeHighwayData, kind:'highway', failMsg:'高速施設オンライン取得失敗（フォールバック使用）:'
  });
}

(function _initHighwayData(){
  const cached=_readFacilityCache('highway_online_v1',7*24*60*60*1000,30);
  if(cached){
    _mergeHighwayData(cached.d);
    if(Date.now()-cached.t>24*60*60*1000) setTimeout(_fetchHighwayOnline,6000);
    return;
  }
  setTimeout(_fetchHighwayOnline,6000);
})();

export function openHighway(){
  _dbgLog('openHighway',()=>({q:(document.getElementById('inp-name')?.value||'').trim(),snap:_dbgSnapshot()}));
  _openPickerModal({
    prefix:'highway',
    title:'🛣️ 高速施設を選択',
    heightPct:75,
    placeholder:'SA名・都道府県で検索…',
    oninput:'filterHighwayDebounced()',
    renderList:renderHighwayList,
    afterOpen:()=>{if(!_highwayLoading) _fetchHighwayOnline();}
  });
}
export function filterHighway(){
  const q=(document.getElementById('highway-search')?.value||'').trim();
  renderHighwayList(q);
}
/* キーストロークごとの全件再描画を防ぐためdebounce（モーダルopen時・データ到着時は即時のfilterHighwayを使用） */
export const filterHighwayDebounced=debounce(filterHighway,140);
/* 空状態の共通スニペット（高速/道の駅で同一） */
const _PICKER_EMPTY_HTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:14px">見つかりません</div>';
/* 施設リスト共通描画（高速/道の駅）。cfg:
   {listId, getData, isLoading, labelPrefix, selectFn, loadingMode:'top'|'footer'}
   ・loadingMode 'top'  … 取得中を上部ステータスで表示し件数footerは常設（高速）
   ・loadingMode 'footer'… 取得中をfooter差し替えで表示（道の駅） */
function _renderFacilityList(cfg,q){
  const list=document.getElementById(cfg.listId);
  if(!list) return;
  const data=cfg.getData();
  const filtered=q?data.filter(m=>m[0].includes(q)||m[1].includes(q)):data;
  if(!filtered.length){list.innerHTML=_PICKER_EMPTY_HTML;return;}
  const loading=cfg.isLoading();
  const shown=filtered.length>PICKER_CAP?filtered.slice(0,PICKER_CAP):filtered;
  const capNote=filtered.length>PICKER_CAP?`<div style="padding:10px 16px;font-size:12px;color:var(--text3);text-align:center;border-top:1px solid var(--border)">他 ${filtered.length-PICKER_CAP} 件… 検索で絞り込んでください</div>`:'';
  const countFooter=`<div style="padding:7px 16px;font-size:11px;color:var(--text3);text-align:right;border-top:1px solid var(--border)">${data.length}件</div>`;
  const status=(cfg.loadingMode==='top'&&loading)?'<div style="padding:6px 16px;font-size:11px;color:var(--text3)">🌐 最新データ取得中…</div>':'';
  const footer=(cfg.loadingMode==='footer'&&loading)
    ?'<div style="padding:10px 16px;font-size:12px;color:var(--text3);text-align:center;border-top:1px solid var(--border)">🌐 最新データを取得中…</div>'
    :countFooter;
  const rows=shown.map(m=>`<div onclick="${cfg.selectFn}('${escJsAttr(m[0])}','${escJsAttr(m[1])}','${cfg.labelPrefix}${escJsAttr(m[0])}')" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
    <div style="font-weight:700;font-size:15px;color:var(--text)">${cfg.labelPrefix}${esc(m[0])}</div>
    <div style="font-size:12px;color:var(--text3);margin-top:2px">${esc(m[1])}</div>
  </div>`).join('');
  list.innerHTML=status+rows+capNote+footer;
}
export function renderHighwayList(q){
  _renderFacilityList({listId:'highway-list',getData:()=>HIGHWAY_DATA,isLoading:()=>_highwayLoading,labelPrefix:'',selectFn:'selectHighway',loadingMode:'top'},q);
}
/* 施設選択後の共通後処理: オーバーレイ閉じ→キーボード閉じ→入力ビュー先頭へ */
function _afterFacilityPick(overlayId){
  _closeOverlay(overlayId); // visualViewport リスナーリーク防止
  document.activeElement?.blur(); // キーボードを閉じる
  setTimeout(()=>{
    document.getElementById('normal-view')?.scrollTo({top:0,behavior:'instant'});
  },50);
}
export function selectHighway(name,addr,fullName){
  _dbgLog('selectHighway',{name:String(fullName||name).slice(0,40),addr:String(addr||'').slice(0,40)});
  const ni=document.getElementById('inp-name');
  const ai=document.getElementById('inp-addr');
  if(ni) ni.value=fullName;
  if(ai) ai.value=addr;
  if(addr) _setDetailsOpen(true);
  _afterFacilityPick('highway-overlay');
}

/* ══ 道の駅選択モーダル ══ */
export const MICHI_NO_EKI_FALLBACK=[
  // 北海道
  ['オホーツク紋別','北海道紋別市'],['流氷街道網走','北海道網走市'],['知床・らうす','北海道目梨郡羅臼町'],
  ['うとろ・シリエトク','北海道斜里町'],['摩周温泉','北海道川上郡弟子屈町'],['阿寒丹頂の里','北海道釧路市'],
  ['厚岸グルメパーク','北海道厚岸郡厚岸町'],['しらぬか恋問','北海道白糠町'],['ねむろ','北海道根室市'],
  ['ピア21しほろ','北海道河東郡士幌町'],['なかさつない','北海道広尾郡中札内村'],['忠類','北海道中川郡幕別町'],
  ['更別','北海道河西郡更別村'],['サーモンパーク千歳','北海道千歳市'],['ウトナイ湖','北海道苫小牧市'],
  ['むかわ四季の館','北海道勇払郡むかわ町'],['夕張メロード','北海道夕張市'],['樹海ロード日高','北海道沙流郡日高町'],
  ['230ルスツ','北海道虻田郡留寿都村'],['とうや湖','北海道虻田郡洞爺湖町'],['あぷた','北海道虻田郡洞爺湖町'],
  ['そうべつ情報館i','北海道有珠郡壮瞥町'],['豊浦','北海道虻田郡豊浦町'],['YOU・遊・もり','北海道茅部郡森町'],
  ['縄文ロマン南かやべ','北海道函館市'],['しかべ間歇泉公園','北海道茅部郡鹿部町'],['つど〜る・プラザ・さわら','北海道二海郡八雲町'],
  ['あっさぶ','北海道爾志郡厚沢部町'],['江差','北海道檜山郡江差町'],['北前船松前','北海道松前郡松前町'],
  ['みそぎの郷きこない','北海道上磯郡木古内町'],['横綱の里ふくしま','北海道松前郡福島町'],
  ['三笠','北海道三笠市'],['スペース・アップルよいち','北海道余市郡余市町'],['ニセコビュープラザ','北海道虻田郡ニセコ町'],
  ['てっくいランド大成','北海道久遠郡せたな町'],['おびら鰊番屋','北海道苫前郡小平町'],['ほっと♡はぼろ','北海道苫前郡羽幌町'],
  ['風Wとままえ','北海道苫前郡苫前町'],['ロマン街道しむかっぷ','北海道勇払郡占冠村'],['南ふらの','北海道空知郡南富良野町'],
  ['自然体験みかさ','北海道三笠市'],['当麻','北海道上川郡当麻町'],['びえい白金ビルケ','北海道上川郡美瑛町'],
  ['びえい丘のくら','北海道上川郡美瑛町'],['かみふらの','北海道空知郡上富良野町'],['フラワーランドかみふらの','北海道空知郡上富良野町'],
  ['旭川','北海道旭川市'],['絵本の里けんぶち','北海道上川郡剣淵町'],['もち米の里☆なよろ','北海道名寄市'],
  // 青森
  ['いかりがせき','青森県平川市'],['いなかだて','青森県南津軽郡田舎館村'],['つるた','青森県北津軽郡鶴田町'],
  ['もりた','青森県つがる市'],['十三湖高原','青森県五所川原市'],['こどまり','青森県北津軽郡中泊町'],
  ['たいらだて','青森県むつ市'],['横浜','青森県上北郡横浜町'],['しちのへ','青森県上北郡七戸町'],
  ['奥入瀬ろまんパーク','青森県十和田市'],['なんごう','青森県八戸市'],['はしかみ','青森県三戸郡階上町'],
  // 岩手
  ['雫石あねっこ','岩手県岩手郡雫石町'],['にしね','岩手県岩手郡岩手町'],['石神の丘','岩手県岩手郡岩手町'],
  ['くじ','岩手県久慈市'],['山田','岩手県下閉伊郡山田町'],['たろう','岩手県宮古市'],
  ['遠野風の丘','岩手県遠野市'],['江刺','岩手県奥州市'],['平泉','岩手県西磐井郡平泉町'],
  // 宮城
  ['おおさと','宮城県黒川郡大郷町'],['津山','宮城県登米市'],['三滝堂','宮城県登米市'],
  ['上品の郷','宮城県石巻市'],['みなみかた','宮城県登米市'],['村田','宮城県柴田郡村田町'],
  // 秋田
  ['ことおか','秋田県由利本荘市'],['おおゆ','秋田県鹿角市'],['かみこあに','秋田県北秋田郡上小阿仁村'],
  ['協和','秋田県大仙市'],['象潟ねむの丘','秋田県にかほ市'],['にしめ','秋田県由利本荘市'],
  // 山形
  ['おおえ','山形県西村山郡大江町'],['にしかわ','山形県西村山郡西川町'],['月山','山形県西村山郡西川町'],
  ['庄内みかわ','山形県東田川郡庄内町'],['しょうない','山形県鶴岡市'],['鳥海','山形県飽海郡遊佐町'],
  // 福島
  ['ばんだいアスパム','福島県耶麻郡磐梯町'],['裏磐梯','福島県耶麻郡北塩原村'],['西会津','福島県耶麻郡西会津町'],
  ['喜多の郷','福島県喜多方市'],['みしま宿','福島県大沼郡三島町'],['からむし織の里しょうわ','福島県大沼郡昭和村'],
  ['しもごう','福島県南会津郡下郷町'],['たじま','福島県南会津郡南会津町'],['南会津','福島県南会津郡南会津町'],
  ['いいたて村の道の駅 までい館','福島県飯舘村'],
  // 茨城
  ['みわ','茨城県常陸大宮市'],['常陸大宮〜かわプラザ〜','茨城県常陸大宮市'],['常陸太田','茨城県常陸太田市'],
  ['日立おさかなセンター','茨城県日立市'],['ひたちおおた','茨城県常陸太田市'],
  ['かつら','茨城県那珂市'],['しもつま','茨城県下妻市'],
  ['グランテラス筑西','茨城県筑西市'],['笠間','茨城県笠間市'],
  // 栃木
  ['思川','栃木県小山市'],['みぶ','栃木県下都賀郡壬生町'],['うつのみや ろまんちっく村','栃木県宇都宮市'],
  ['湧水の郷しおや','栃木県塩谷郡塩谷町'],['やいた','栃木県矢板市'],['那須高原友愛の森','栃木県那須郡那須町'],
  ['那珂川郷土館','栃木県那須郡那珂川町'],['きつれがわ','栃木県さくら市'],['にのみや','栃木県芳賀郡二宮町'],
  ['もてぎ','栃木県芳賀郡茂木町'],
  // 群馬
  ['まえばし赤城','群馬県前橋市'],['ふじみ','群馬県沼田市'],['たくみの里','群馬県利根郡みなかみ町'],
  ['みなかみ水紀行館','群馬県利根郡みなかみ町'],['こもち','群馬県渋川市'],['よしおか温泉','群馬県北群馬郡吉岡町'],
  ['おおた','群馬県太田市'],['玉村宿','群馬県佐波郡玉村町'],['甘楽','群馬県甘楽郡甘楽町'],
  ['下仁田','群馬県甘楽郡下仁田町'],['上州おにし','群馬県藤岡市'],['ららん藤岡','群馬県藤岡市'],
  ['くらぶち小栗の里','群馬県高崎市'],['くろほね・やまびこ','群馬県桐生市'],['東国文化の郷','群馬県太田市'],
  // 埼玉
  ['はなぞの','埼玉県深谷市'],['おかべ','埼玉県深谷市'],['いちごの里よしみ','埼玉県比企郡吉見町'],
  ['アグリパークゆめすぎと','埼玉県北葛飾郡杉戸町'],['庄和','埼玉県春日部市'],['和紙の里ひがしちちぶ','埼玉県秩父郡東秩父村'],
  ['龍勢会館','埼玉県秩父郡吉田町'],['あらかわ','埼玉県秩父市'],['果樹公園あしがくぼ','埼玉県秩父郡横瀬町'],
  // 千葉
  ['富楽里とみやま','千葉県南房総市'],['三芳村','千葉県安房郡鋸南町'],['ちくら・潮風王国','千葉県南房総市'],
  ['鴨川オーシャンパーク','千葉県鴨川市'],['木更津うまくたの里','千葉県木更津市'],
  ['多古','千葉県香取郡多古町'],['発酵の里こうざき','千葉県香取郡神崎町'],
  // 東京
  ['八王子滝山','東京都八王子市'],['夕やけ小やけふれあいの里','東京都八王子市'],
  // 神奈川
  ['清川','神奈川県愛甲郡清川村'],['山北','神奈川県足柄上郡山北町'],
  ['箱根峠','神奈川県足柄下郡箱根町'],['足柄・金太郎のふるさと','神奈川県南足柄市'],
  ['どうし','神奈川県相模原市'],
  // 山梨
  ['しもべ','山梨県南巨摩郡身延町'],['なんぶ','山梨県南巨摩郡南部町'],['とよとみ','山梨県中巨摩郡昭和町'],
  ['にらさき','山梨県韮崎市'],['はくしゅう','山梨県北杜市'],['小淵沢','山梨県北杜市'],
  ['南きよさと','山梨県北杜市'],['まきおか','山梨県山梨市'],['牧丘','山梨県山梨市'],
  ['甲斐大和','山梨県甲州市'],['富士吉田','山梨県富士吉田市'],['なるさわ','山梨県南都留郡鳴沢村'],
  ['かつやま','山梨県南都留郡富士河口湖町'],
  // 長野
  ['信州新野千石平','長野県下伊那郡阿南町'],['信濃路下條','長野県下伊那郡下條村'],['大鹿村','長野県下伊那郡大鹿村'],
  ['南アルプスむら長谷','長野県伊那市'],['南信州うるぎ','長野県下伊那郡売木村'],['田切の里','長野県上伊那郡飯島町'],
  ['オアシスおぶせ','長野県上高井郡小布施町'],['北信州やまのうち','長野県下高井郡山ノ内町'],
  ['ヘルシーテラス佐久南','長野県佐久市'],['雷電くるみの里','長野県小県郡東御市'],
  ['マルメロの駅ながと','長野県小県郡長和町'],['女神の里たてしな','長野県北佐久郡立科町'],
  ['信州蔦木宿','長野県諏訪郡富士見町'],['FARMUS木島平','長野県下高井郡木島平村'],
  ['中条','長野県長野市'],['信州新町','長野県長野市'],['アルプス安曇野','長野県安曇野市'],
  ['ほりがねの里','長野県安曇野市'],['安曇野松川','長野県北安曇郡松川村'],['白馬','長野県北安曇郡白馬村'],
  ['小谷','長野県北安曇郡小谷村'],['千国の庄市','長野県北安曇郡小谷村'],['今井恵みの里','長野県松本市'],
  // 新潟
  ['南魚沼 雪あかり','新潟県南魚沼市'],['よしかわ杜氏の郷','新潟県上越市'],['越後市振の関','新潟県糸魚川市'],
  ['親不知ピアパーク','新潟県糸魚川市'],['能生','新潟県糸魚川市'],['うみてらす名立','新潟県上越市'],
  ['あらい','新潟県妙高市'],['新井さかえ野','新潟県妙高市'],['関川','新潟県岩船郡関川村'],
  ['朝日','新潟県村上市'],['神林','新潟県村上市'],['荒川胎内','新潟県胎内市'],
  ['加治川','新潟県新発田市'],['豊栄','新潟県新潟市'],['新潟ふるさと村','新潟県新潟市'],
  ['西山ふるさと公苑','新潟県柏崎市'],['てまりの湯','新潟県柏崎市'],['おじや温泉雪むろ','新潟県小千谷市'],
  ['越後川口あぐりの里','新潟県長岡市'],['ゆのたに','新潟県魚沼市'],['いりひろせ','新潟県魚沼市'],
  ['塩沢','新潟県南魚沼市'],['六日町','新潟県南魚沼市'],['大沢','新潟県南魚沼市'],
  ['ほんまち(十日町)','新潟県十日町市'],['クロステン十日町','新潟県十日町市'],['まつだいふるさと会館','新潟県十日町市'],
  // 富山
  ['メルヘンおやべ','富山県小矢部市'],['庄川','富山県砺波市'],['砺波','富山県砺波市'],
  ['細入','富山県富山市'],['立山','富山県中新川郡立山町'],['うなづき','富山県黒部市'],
  ['たいら','富山県南砺市'],['上平ささら','富山県南砺市'],['利賀','富山県南砺市'],
  // 石川
  ['のと千里浜','石川県羽咋市'],['能登食祭市場','石川県七尾市'],['すず塩田村','石川県珠洲市'],
  ['桜峠','石川県輪島市'],['輪島','石川県輪島市'],['赤神','石川県輪島市'],
  ['なかじまロマン峠','石川県七尾市'],['氷見','石川県氷見市'],
  // 福井
  ['河野','福井県南条郡南越前町'],['おばま','福井県小浜市'],['若狭おばま','福井県小浜市'],
  ['若狭熊川宿','福井県三方上中郡若狭町'],['名田庄','福井県大飯郡おおい町'],
  ['シーサイド高浜','福井県大飯郡高浜町'],
  // 静岡
  ['富士川楽座','静岡県富士市'],['とみざわ','静岡県富士宮市'],['朝霧高原','静岡県富士宮市'],
  ['天城越え','静岡県伊豆市'],['伊豆月ヶ瀬','静岡県伊豆市'],['開国下田みなと','静岡県下田市'],
  ['伊東マリンタウン','静岡県伊東市'],['伊豆のへそ','静岡県伊豆の国市'],['ゲートウェイ函南','静岡県田方郡函南町'],
  ['富士川','静岡県富士市'],['藤枝おひたち','静岡県藤枝市'],
  ['ふじおやま','静岡県駿東郡小山町'],['伊豆ゲートウェイ函南','静岡県田方郡函南町'],
  ['伊豆・三津シーパラダイス','静岡県沼津市'],['なんぶ','静岡県富士宮市'],
  // 愛知
  ['アグリステーションなぐら','愛知県北設楽郡設楽町'],['どんぐりの里いなぶ','愛知県豊田市'],
  ['おばあちゃん市・山岡','愛知県恵那市'],['つぐ高原グリーンパーク','愛知県北設楽郡設楽町'],
  ['豊根グリーンポート宮嶋','愛知県北設楽郡豊根村'],
  // 岐阜
  ['ロック・ガーデンひちそう','岐阜県加茂郡七宗町'],['平成','岐阜県関市'],['美濃にわか茶屋','岐阜県美濃市'],
  ['古今伝授の里やまと','岐阜県郡上市'],['白鳥','岐阜県郡上市'],['大日岳','岐阜県大野郡白川村'],
  ['飛騨白山','岐阜県高山市'],['モンデウス飛騨位山','岐阜県高山市'],['ひだ朝日村','岐阜県高山市'],
  ['奥飛騨温泉郷上宝','岐阜県高山市'],['飛騨古川いぶし','岐阜県飛騨市'],['スカイドーム神岡','岐阜県飛騨市'],
  ['パスカル清見','岐阜県高山市'],['荘川','岐阜県高山市'],['合掌の里','岐阜県大野郡白川村'],
  // 三重
  ['奥伊勢おおだい','三重県多気郡大台町'],['伊勢志摩','三重県志摩市'],['パーク七里御浜','三重県南牟婁郡御浜町'],
  ['熊野・板屋九郎兵衛の里','三重県熊野市'],['熊野きのくに','三重県熊野市'],
  // 滋賀
  ['塩津海道あぢかまの里','滋賀県長浜市'],['マキノ追坂峠','滋賀県高島市'],['藤樹の里あどがわ','滋賀県高島市'],
  ['びわ湖大橋米プラザ','滋賀県守山市'],['せせらぎの里こうら','滋賀県犬上郡甲良町'],
  ['草津','滋賀県草津市'],['あいの土山','滋賀県甲賀市'],['こんぜの里りっとう','滋賀県栗東市'],
  // 京都
  ['和','京都府相楽郡南山城村'],['お茶の京都みなみやましろ村','京都府相楽郡南山城村'],
  ['美山ふれあい広場','京都府南丹市'],['ウッディー京北','京都府京都市'],
  ['丹後王国「食のみやこ」','京都府京丹後市'],['舟屋の里伊根','京都府与謝郡伊根町'],
  // 大阪
  ['かなん','大阪府南河内郡河南町'],['ちはやあかさか','大阪府南河内郡千早赤阪村'],
  ['いずみ山愛の里','大阪府和泉市'],['くみのき','大阪府貝塚市'],
  // 兵庫
  ['あわじ','兵庫県洲本市'],['うずしお','兵庫県南あわじ市'],['福良','兵庫県南あわじ市'],
  ['みつ','兵庫県たつの市'],['しんぐう','兵庫県たつの市'],['みはら','兵庫県神戸市'],
  ['にしきの','兵庫県養父市'],['ようか但馬蔵','兵庫県養父市'],['ハチ北','兵庫県香美町'],
  ['村岡ファームガーデン','兵庫県美方郡香美町'],['きなんせ岩津','兵庫県朝来市'],
  // 奈良
  ['宇陀路大宇陀','奈良県宇陀市'],['宇陀路菟田野','奈良県宇陀市'],['宇陀路室生','奈良県宇陀市'],
  ['杉の湯川上','奈良県吉野郡川上村'],['吉野路大淀iセンター','奈良県吉野郡大淀町'],
  ['吉野路黒滝','奈良県吉野郡黒滝村'],['おおちらと','奈良県吉野郡十津川村'],
  // 和歌山
  ['みなべうめ振興館','和歌山県日高郡みなべ町'],['ごまさんスカイタワー','和歌山県伊都郡高野町'],
  ['柿の郷くどやま','和歌山県伊都郡九度山町'],['しみず','和歌山県西牟婁郡すさみ町'],
  ['すさみ','和歌山県西牟婁郡すさみ町'],['なち','和歌山県東牟婁郡那智勝浦町'],
  ['たいじ','和歌山県東牟婁郡太地町'],['熊野古道中辺路','和歌山県田辺市'],
  // 鳥取
  ['ポート赤碕','鳥取県東伯郡琴浦町'],['はわい','鳥取県東伯郡湯梨浜町'],['燕趙園','鳥取県東伯郡湯梨浜町'],
  ['大栄','鳥取県北栄町'],['北条公園','鳥取県北栄町'],['琴の浦','鳥取県北栄町'],
  ['神話の里白うさぎ','鳥取県鳥取市'],['西いなば気楽里','鳥取県鳥取市'],
  // 島根
  ['キララ多伎','島根県出雲市'],['湯の川','島根県出雲市'],['仁摩サンドミュージアム','島根県大田市'],
  ['ローズロード やまそ','島根県邑智郡美郷町'],['匹見峡','島根県益田市'],
  ['サンピコごうつ','島根県江津市'],['ゆうひパーク三隅','島根県浜田市'],
  ['シルクウェイにちはら','島根県美郷町'],
  // 岡山
  ['醍醐の里','岡山県真庭市'],['蒜山高原','岡山県真庭市'],['風の家','岡山県真庭市'],
  ['彩菜茶屋','岡山県岡山市'],['久米の里','岡山県津山市'],['奥津温泉','岡山県苫田郡鏡野町'],
  ['山陽道やかげ宿','岡山県小田郡矢掛町'],
  // 広島
  ['北の関宿安芸高田','広島県安芸高田市'],['来夢とごうち','広島県山県郡安芸太田町'],
  ['スパ羅漢','広島県廿日市市'],['豊平どんぐり村','広島県山県郡北広島町'],
  ['三矢の里あきたかた','広島県安芸高田市'],['世羅','広島県世羅郡世羅町'],
  ['よがんす白竜','広島県三原市'],['湖畔の里福富','広島県東広島市'],
  // 山口
  ['ソレーネ周南','山口県周南市'],['きらら あじす','山口県山口市'],['長門峡','山口県山口市'],
  ['むつみ','山口県萩市'],['阿武町','山口県阿武郡阿武町'],['萩しーまーと','山口県萩市'],
  ['ゆとりパークたまがわ','山口県山口市'],['きわし川','山口県光市'],
  // 徳島
  ['どなり','徳島県板野郡藍住町'],['かもだ岬温泉ランド','徳島県阿南市'],['ひなの里かつうら','徳島県勝浦郡勝浦町'],
  ['温泉の里神山','徳島県名西郡神山町'],['大歩危','徳島県三好市'],['にしいや','徳島県三好市'],
  ['貞光ゆうゆう館','徳島県美馬郡つるぎ町'],['わじき','徳島県那賀郡那賀町'],
  // 香川
  ['ながお','香川県さぬき市'],['小豆島オリーブ公園','香川県小豆郡小豆島町'],
  ['しおのえ','香川県高松市'],['ことなみ','香川県仲多度郡まんのう町'],
  ['とよはま','香川県観音寺市'],['みの','香川県三豊市'],
  // 愛媛
  ['風早の郷風和里','愛媛県松山市'],['今治湯ノ浦温泉','愛媛県今治市'],['小松オアシス','愛媛県西条市'],
  ['マイントピア別子','愛媛県新居浜市'],['虹の森公園まつの','愛媛県北宇和郡松野町'],
  ['みまの里','愛媛県宇和島市'],['日吉夢産地','愛媛県北宇和郡松野町'],
  ['どんぶり館','愛媛県北宇和郡鬼北町'],['三間','愛媛県宇和島市'],['うわじま きさいや広場','愛媛県宇和島市'],
  // 高知
  ['土佐和紙工芸村','高知県吾川郡いの町'],['633美の里','高知県長岡郡大豊町'],
  ['大杉','高知県長岡郡大豊町'],['美良布','高知県長岡郡大豊町'],
  ['なぶら土佐佐賀','高知県幡多郡黒潮町'],['すくも','高知県宿毛市'],
  ['あしずり','高知県土佐清水市'],['ビオスおおがた','高知県幡多郡大方町'],
  // 福岡
  ['おおき','福岡県三潴郡大木町'],['むなかた','福岡県宗像市'],['しんよしとみ','福岡県築上郡築上町'],
  ['豊前おこしかけ','福岡県豊前市'],['歓遊舎ひこさん','福岡県田川郡添田町'],['小石原','福岡県朝倉郡東峰村'],
  ['うきは','福岡県うきは市'],['原鶴','福岡県朝倉市'],['吉野ヶ里','福岡県神埼郡吉野ヶ里町'],
  // 佐賀
  ['山内','佐賀県武雄市'],['厳木','佐賀県唐津市'],['桃山天下市','佐賀県唐津市'],
  ['浜野浦','佐賀県藤津郡太良町'],['太良','佐賀県藤津郡太良町'],
  // 長崎
  ['夕陽が丘そとめ','長崎県長崎市'],['させぼっくす99','長崎県佐世保市'],['昆虫の里たびら','長崎県平戸市'],
  ['生月大橋','長崎県平戸市'],['松浦海のふるさと館','長崎県松浦市'],['南島原','長崎県南島原市'],
  // 熊本
  ['七城メロンドーム','熊本県菊池市'],['旭志','熊本県菊池市'],['泗水孔子公園','熊本県菊池市'],
  ['大津','熊本県菊池郡大津町'],['阿蘇','熊本県阿蘇市'],['小国 ゆうステーション','熊本県阿蘇郡小国町'],
  ['波野','熊本県阿蘇市'],['宮地岳かかしの里','熊本県阿蘇郡南阿蘇村'],['清和文楽邑','熊本県上益城郡山都町'],
  ['通潤橋','熊本県上益城郡山都町'],['山都','熊本県上益城郡山都町'],
  // 大分
  ['やよい','大分県佐伯市'],['なんごう','大分県佐伯市'],['米水津','大分県佐伯市'],
  ['きよかわ','大分県豊後大野市'],['みえ','大分県豊後大野市'],['竹田','大分県竹田市'],
  ['原尻の滝','大分県豊後大野市'],['菅尾石仏','大分県豊後大野市'],
  ['みやま本舗','大分県玖珠郡九重町'],['水分の里','大分県玖珠郡九重町'],
  ['童話の里くす','大分県玖珠郡玖珠町'],['玖珠','大分県玖珠郡玖珠町'],
  // 宮崎
  ['フェニックス','宮崎県宮崎市'],['都農','宮崎県児湯郡都農町'],['なんごう','宮崎県日南市'],
  ['酒谷','宮崎県日南市'],['北川はゆま','宮崎県延岡市'],['きたごう','宮崎県東臼杵郡美郷町'],
  ['高千穂','宮崎県西臼杵郡高千穂町'],['青雲橋','宮崎県西臼杵郡日之影町'],
  // 鹿児島
  ['黒之瀬戸だんだん市場','鹿児島県阿久根市'],['阿久根','鹿児島県阿久根市'],
  ['すえよし','鹿児島県曽於市'],['たるみず','鹿児島県垂水市'],['たるみず湯ったり館','鹿児島県垂水市'],
  ['根占','鹿児島県肝属郡南大隅町'],['かいもん','鹿児島県指宿市'],['いぶすき','鹿児島県指宿市'],
  // 沖縄
  ['豊崎','沖縄県豊見城市'],['かでな','沖縄県中頭郡嘉手納町'],['許田','沖縄県名護市'],
  ['ぎのざ','沖縄県国頭郡宜野座村'],['おおぎみ','沖縄県国頭郡大宜味村'],
  ['ゆいゆい国頭','沖縄県国頭郡国頭村'],['おろく','沖縄県那覇市'],
];

/* ══ 道の駅 動的取得（Overpass API + localStorageキャッシュ） ══ */
export let MICHI_NO_EKI = MICHI_NO_EKI_FALLBACK;
export let _michiLoading = false;

export function _mergeMichiData(online){
  MICHI_NO_EKI=_mergeFacilityData(MICHI_NO_EKI_FALLBACK,online);
}

export async function _fetchMichiOnline(){
  return _fetchFacilityOnline({
    isLoading:()=>_michiLoading, setLoading:v=>{_michiLoading=v;},
    searchId:'michi-search', filter:filterMichi,
    cacheKey:'michi_online_v2', minCount:100,
    query:`[out:json][timeout:100];
nwr["name"~"^道の駅"](24,122,46,155);
out center tags;`,
    parseEls:els=>{
      const result=[];const seen=new Set();
      for(const el of els){
        const fullName=el.tags?.name||'';
        if(!fullName.startsWith('道の駅')) continue;
        const shortName=fullName.replace(/^道の駅[\s　]*/,'').trim();
        if(!shortName||seen.has(shortName)) continue;
        seen.add(shortName);
        result.push([shortName,_extractAddr(el.tags)]);
      }
      return result;
    },
    merge:_mergeMichiData, kind:'michi', failMsg:'道の駅一覧オンライン取得失敗（フォールバック使用）:'
  });
}

// キャッシュがあれば即時反映、なければバックグラウンド取得
(function _initMichiData(){
  const cached=_readFacilityCache('michi_online_v2',7*24*60*60*1000,100);
  if(cached){
    _mergeMichiData(cached.d);
    // 1日以上経過していれば裏でリフレッシュ
    if(Date.now()-cached.t > 24*60*60*1000) setTimeout(_fetchMichiOnline, 5000);
    return;
  }
  // キャッシュなし → スプラッシュ後に取得開始
  setTimeout(_fetchMichiOnline, 5000);
})();

export function openMichinoEki(){
  _dbgLog('openMichinoEki',()=>({q:(document.getElementById('inp-name')?.value||'').trim(),snap:_dbgSnapshot()}));
  _openPickerModal({
    prefix:'michi',
    title:`🏪 道の駅を選択${_michiLoading?'<span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:8px">🌐取得中…</span>':''}`,
    heightPct:75,
    placeholder:'名前・都道府県で検索…',
    oninput:'filterMichiDebounced()',
    renderList:renderMichiList
  });
}
export function filterMichi(){
  const q=(document.getElementById('michi-search')?.value||'').trim();
  renderMichiList(q);
}
/* キーストロークごとの全件再描画を防ぐためdebounce */
export const filterMichiDebounced=debounce(filterMichi,140);
export function renderMichiList(q){
  _renderFacilityList({listId:'michi-list',getData:()=>MICHI_NO_EKI,isLoading:()=>_michiLoading,labelPrefix:'道の駅 ',selectFn:'selectMichi',loadingMode:'footer'},q);
}
export function selectMichi(name,addr,fullName){
  _dbgLog('selectMichi',{name:String(fullName||name).slice(0,40),addr:String(addr||'').slice(0,40)});
  const ni=document.getElementById('inp-name');
  const ai=document.getElementById('inp-addr');
  if(ni) ni.value=fullName;
  if(ai) ai.value=addr;
  if(addr) _setDetailsOpen(true);
  _afterFacilityPick('michi-overlay');
}

/* ══ ガソリンスタンド選択 ══ */
export const GAS_STATION_CHAINS=[
  ['ENEOS','ENEOSホールディングス系列（旧日石・旧JOMOほか）'],
  ['apollostation','出光・昭和シェル統合ブランド'],
  ['出光','出光興産系列'],
  ['コスモ石油','コスモエネルギーグループ'],
  ['シェル','昭和シェル石油系列'],
  ['エッソ','エクソンモービル系列'],
  ['モービル','エクソンモービル系列'],
  ['キグナス石油','キグナス石油系列'],
  ['ゼネラル','ゼネラル石油系列'],
  ['ホクレン','北海道農協系列（道内限定）'],
  ['JA-SS','JA農協系列'],
  ['太陽石油','四国・西日本中心'],
  ['セルフSS','チェーン不明（セルフ）'],
  ['ガソリンスタンド','チェーン不明'],
];
export function openGasStation(){
  _dbgLog('openGasStation',()=>({q:(document.getElementById('inp-name')?.value||'').trim(),snap:_dbgSnapshot()}));
  _openPickerModal({
    prefix:'gs',
    title:'⛽ ガソリンスタンドを選択',
    heightPct:70,
    placeholder:'チェーン名で検索…',
    oninput:'filterGasStation()',
    hintHtml:'<div style="padding:8px 14px 6px;font-size:12px;color:var(--text3);flex-shrink:0">選択すると給油ポイントが自動でONになります</div>',
    listPadding:'4px 0 8px',
    renderList:renderGasStationList
  });
}
export function filterGasStation(){
  renderGasStationList((document.getElementById('gs-search')?.value||'').trim());
}
export function renderGasStationList(q){
  const list=document.getElementById('gs-list');
  if(!list) return;
  const filtered=q?GAS_STATION_CHAINS.filter(g=>g[0].includes(q)||g[1].includes(q)):GAS_STATION_CHAINS;
  if(!filtered.length){list.innerHTML=_PICKER_EMPTY_HTML;return;}
  list.innerHTML=filtered.map(g=>`<div onclick="selectGasStation('${escJsAttr(g[0])}')" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
    <div style="font-weight:700;font-size:15px;color:var(--text)">⛽ ${esc(g[0])}</div>
    <div style="font-size:12px;color:var(--text3);margin-top:2px">${esc(g[1])}</div>
  </div>`).join('');
}
export function selectGasStation(chain){
  _dbgLog('selectGasStation',{chain});
  const ni=document.getElementById('inp-name');
  if(ni) ni.value=chain+' SS';
  _setFuelCheck(true);
  _afterFacilityPick('gs-overlay');
}

/* ══ 近くの快活CLUB検索（Googleマップ直接遷移） ══ */
export function openKaikatsu(){
  _dbgLog('openKaikatsu',{});
  window.open(mapsSearchUrl('快活CLUB'),'_blank','noopener');
}


/* ══ 近くのトイレ検索（Googleマップ直接遷移） ══ */
export function openToiletMap(){
  _dbgLog('openToiletMap',{});
  window.open(mapsSearchUrl('トイレ'),'_blank','noopener');
}

