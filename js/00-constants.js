/* ══════════════════════════════════════════════════════
   旅刻 mk18 — 00-constants.js
   定数・マスタデータ（WMO / DEFAULT / SK / EC / LIMIT）
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ WMO天気コード ══ */
export const WMO={
  0:{e:'☀️',t:'快晴'},1:{e:'🌤️',t:'晴れ'},2:{e:'⛅',t:'薄曇り'},3:{e:'☁️',t:'曇り'},
  45:{e:'🌫️',t:'霧'},48:{e:'🌫️',t:'霧(霧氷)'},
  51:{e:'🌦️',t:'霧雨弱'},53:{e:'🌦️',t:'霧雨'},55:{e:'🌦️',t:'霧雨強'},
  61:{e:'🌧️',t:'小雨'},63:{e:'🌧️',t:'雨'},65:{e:'🌧️',t:'大雨'},
  71:{e:'🌨️',t:'小雪'},73:{e:'❄️',t:'雪'},75:{e:'❄️',t:'大雪'},77:{e:'🌨️',t:'雪粒'},
  80:{e:'🌦️',t:'にわか雨弱'},81:{e:'🌧️',t:'にわか雨'},82:{e:'⛈️',t:'にわか雨激'},
  85:{e:'🌨️',t:'にわか雪'},86:{e:'❄️',t:'にわか雪強'},
  95:{e:'⛈️',t:'雷雨'},96:{e:'⛈️',t:'雷雨(雹)'},99:{e:'⛈️',t:'激しい雷雨'}
};
/* ══ バージョン ══
   ▼ APP_VERSION：表示・ログ用の「リリース版」。リリースごとに上げる。
     これを変えたら、import で繋がらない以下も手動で併せて更新すること：
       ・sw.js の CACHE_NAME（'tabidoki-<ver>-v1'）← キャッシュ無効化に必須
       ・index.html の <title> と スプラッシュの版表示
   ▼ DEFAULT.version は別物（下記参照）。混同しないこと。 */
export const APP_VERSION='mk18';
export const DEFAULT={
  // ↓ これは「データ形式（スキーマ）のバージョン」。APP_VERSION（表示版）とは無関係。
  //    保存データの構造を変えたときだけ上げ、旧版を 02-utils.js の _migrateData の LEGACY 配列へ必ず追加すること。
  //    APP_VERSION に追従させてはいけない（追従させると既存データが移行不全＝消失する恐れ）。
  version:'mk18-v1',title:'',currentStopId:null,
  days:[
    {date:'',routeUrl:'',stops:[]}
  ]
};
export const SK='touring_data';
export const EC={SAVE:'E-SV01',LOAD:'E-LD01',RENDER:'E-RD01',RIDE:'E-RD02',STOP:'E-ST01',SORT:'E-ST02',CASCADE:'E-ST03',CURRENT:'E-ST04',DAY_SW:'E-DY01',DAY_ADD:'E-DY02',DAY_DEL:'E-DY03',DAY_DATE:'E-DY04',ROUTE:'E-RT01',EDIT_OPEN:'E-ES01',GLOBAL:'E-GL01'};
export const EC_MSG={'E-SV01':'ファイルの保存に失敗しました','E-LD01':'ファイルの読み込みに失敗しました','E-RD01':'画面の描画に失敗しました','E-RD02':'ライドモードの描画に失敗しました','E-ST01':'地点の保存に失敗しました','E-ST02':'行程の並び替えに失敗しました','E-ST03':'時刻の自動調整に失敗しました','E-ST04':'現在地の設定に失敗しました','E-DY01':'日程の切り替えに失敗しました','E-DY02':'日程の追加に失敗しました','E-DY03':'日程の削除に失敗しました','E-DY04':'日付の保存に失敗しました','E-RT01':'ルートURLの保存に失敗しました','E-ES01':'編集フォームの表示に失敗しました','E-GL01':'予期しないエラーが発生しました'};
export const LIMIT={name:50,addr:100,note:1000,log:200,title:60,url:500,stopsPerDay:20,splashStar:20,splashTitle:40};
/* ── localStorageキー集約（生文字列の散在によるタイポ事故を防ぐ） ──
   既に定数化済みのもの（SK / GEO_SK / FCST_SK / SPLASH_SK / DBG_KEY）は各所で共有済みのためここには含めない。
   未定数化で複数ファイルに散っていたキーのみをここへ集約する。
   ※ lock.js は classic script（モジュール非対応）のため import できず、対象外（lock.js内のキーはそのまま）。 */
export const LSK={
  theme:'touring_theme',
  fontscale:'touring_fontscale',
  gps:'touring_gps',
  ride:'touring_ride',
  highwayCache:'highway_online_v1',
  michiCache:'michi_online_v2',
};
