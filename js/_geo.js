/* ══════════════════════════════════════════════════════
   旅刻 — _geo.js  ジオコーディング(GSI) ＋ ジオキャッシュ
   ・04-weather.js から切り出した純粋モジュール（DOM/render非依存）。
     モバイル版・PC版（編集デスク）で同一ロジックを共有する単一ソース。
   ・依存なし（localStorage / fetch のみ。ブラウザであれば動作）。
   ・永続化は _setGeoPersist で差し替え可能：
       モバイル版は weather の _lsSetItem を注入し、容量超過時に他キャッシュを退避する挙動を維持。
       未注入時（PC版など）は素の localStorage 保存にフォールバック。
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

export const GEO_SK='touring_geo';
/* LRU上限。1地点につきキャッシュされる実キーは「最初に解決した1クエリ」のみのため、実上限は地点数とほぼ等しい。
   設計上の最大は 7日×20地点=140地点。140を確実に上回り、編集中の滞留分の余裕も見て300とする
   （1件≈80B＝計24KB程度でlocalStorage上問題なし）。 */
export const GEO_MAX=300;

/* 住所→座標の解決結果キャッシュ（{ [query]: {lat,lon,title,ts} }）。起動時にlocalStorageから復元。 */
export const geoCache=(()=>{try{return JSON.parse(localStorage.getItem(GEO_SK))||{};}catch(e){return{};}})();

/* 永続化フック。既定は素のlocalStorage保存。weather側が _setGeoPersist(_lsSetItem) で差し替える。 */
let _persist=(key,val)=>{try{localStorage.setItem(key,val);}catch(e){}};
export function _setGeoPersist(fn){ if(typeof fn==='function') _persist=fn; }

export function _geoCacheGet(q){const e=geoCache[q];if(!e)return null;e.ts=Date.now();return e;}
export function _geoCacheSet(q,lat,lon,title){geoCache[q]={lat,lon,title:title||null,ts:Date.now()};_saveGeoCache();}
export function _saveGeoCache(){try{
  const keys=Object.keys(geoCache);
  if(keys.length>GEO_MAX){
    // LRU: tsが古い順に削除
    keys.sort((a,b)=>(geoCache[a].ts||0)-(geoCache[b].ts||0))
      .slice(0,keys.length-GEO_MAX).forEach(k=>delete geoCache[k]);
  }
  _persist(GEO_SK,JSON.stringify(geoCache));
}catch(e){}}

/* ── 国土地理院 住所検索API（日本住所専用・CORS完全対応・APIキー不要） ──
   返り値: {lat, lon, title, count} | null
     title = GSIがマッチしたと主張する地名（化け座標の判定材料）, count = 候補件数 */
export async function _geocodeGSI(q){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      {signal:ctrl.signal}
    );
    clearTimeout(t);
    if(r.ok){
      const j=await r.json();
      if(j&&j.length>0){
        // GeoJSON形式: coordinates[0]=lon, coordinates[1]=lat
        const lon=parseFloat(j[0].geometry.coordinates[0]);
        const lat=parseFloat(j[0].geometry.coordinates[1]);
        const title=(j[0].properties&&j[0].properties.title)||null;
        if(!isNaN(lat)&&!isNaN(lon)) return {lat,lon,title,count:j.length};
      }
    }
  }catch(e){clearTimeout(t);}
  return null;
}
