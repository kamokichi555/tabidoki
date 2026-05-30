/* ══════════════════════════════════════════════════════
   旅刻 mk17 — _expose.js（インラインイベントハンドラのwindow公開ブリッジ）
   ESM化でモジュールスコープになった関数を、HTMLの on*="fn()" 属性から
   参照できるよう window へ明示公開する。ここに列挙された関数だけが公開API。
   ※ 09-drag / 10-pickers はこのファイルのimportで初めて読み込まれる（他からimportされないため）。
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

import { loadJSON, loadSampleData, onFileSelected, saveJSON, saveRecord, shareItinerary } from './03-storage.js';
import { retryStopWeather } from './04-weather.js';
import { delStop, saveStop, setCurrentStop } from './05-stop.js';
import { _commitTitle, _saveRouteDebounced, _saveTitleDebounced, addDay, deleteCurrentDay, saveDayDate, switchDay } from './06-day.js';
import { checkTimeOrder, closeRideNote, dismissAppError, openRideNote, rideNavigate, toggleRideAction } from './07-render.js';
import { _toggleTheme, autoGrowNote, cancelEdit, cancelToRide, onEditBtnClick, openEditStop, tapStopInEdit, toggleRide } from './08-mode.js';
import { _cancelTouchDrag, onMouseDragStart, onTouchDragEnd, onTouchDragMove, onTouchDragStart } from './09-drag.js';
import { filterGasStation, filterHighwayDebounced, filterMichiDebounced, openGasStation, openHighway, openKaikatsu, openMichinoEki, openToiletMap, selectGasStation, selectHighway, selectMichi } from './10-pickers.js';
import { _closeOverlay, _saveSplashSettings, _updateEpisodePreview, openSplashSettings, toggleDetails, toggleFuelCheck } from './11-overlays.js';
import { _dbgClear, _dbgCopy, _dbgDownload, _dbgSetEnabled } from './12-debug.js';
import { toggleGps } from './14-gps.js';

Object.assign(window, {
  _cancelTouchDrag, _closeOverlay, _commitTitle, _dbgClear, _dbgCopy, _dbgDownload, _dbgSetEnabled, _saveRouteDebounced, _saveSplashSettings, _saveTitleDebounced, _toggleTheme, _updateEpisodePreview, addDay, autoGrowNote, cancelEdit, cancelToRide, checkTimeOrder, closeRideNote, delStop, deleteCurrentDay, dismissAppError, filterGasStation, filterHighwayDebounced, filterMichiDebounced, loadJSON, loadSampleData, onEditBtnClick, openEditStop, onFileSelected, onMouseDragStart, onTouchDragEnd, onTouchDragMove, onTouchDragStart, openGasStation, openHighway, openKaikatsu, openMichinoEki, openRideNote, openSplashSettings, openToiletMap, retryStopWeather, rideNavigate, saveDayDate, saveJSON, saveRecord, saveStop, selectGasStation, selectHighway, selectMichi, setCurrentStop, shareItinerary, switchDay, tapStopInEdit, toggleDetails, toggleFuelCheck, toggleGps, toggleRide, toggleRideAction,
});


/* ══════════════════════════════════════════════════════
   ▼▼▼ 自動テスト用ブリッジ（Playwright E2E から状態・関数を参照するため）▼▼▼
   通常のアプリ動作には影響しない。テストは page.evaluate() 内で
   isEdit / data / currentDay / render() などをグローバル名で参照するが、
   ESモジュール化でこれらはモジュールスコープに閉じているため、
   ここで window 上に getter/setter ブリッジを張る。
   ・S.* の状態（isEdit等）は getter/setter で S に読み書きする
   ・data は setData() 経由で差し替える（再代入バインディング制約のため）
   ・const のコレクション（wxStopRes 等）は getter のみ（中身操作はそのまま効く）
   ══════════════════════════════════════════════════════ */
import { S, data as _stateData, setData, _dom } from './01-state.js';
import { render, renderRide, hideInfoToast } from './07-render.js';
import { toggleEdit } from './08-mode.js';
import { ensureAllWeather, wxStopRes, wxQueue, wxQueueFast, wxQueueIds, geoCache } from './04-weather.js';
import { nowMin, _setNowMinOverride } from './02-utils.js';
import { _setDetailsOpen, _setFuelCheck, splashSettings } from './11-overlays.js';
import { save } from './03-storage.js';
import { renderTabs, _updateStickyTops, currentDayFlat } from './06-day.js';
import { esc, isSafeUrl } from './02-utils.js';
import { _isoToday } from './04-weather.js';
import * as _drag from './09-drag.js';

// ── S.* 状態変数（読み書き両対応）──
['isEdit','isRide','editingId','currentDay','manualCurrentId',
 'rideViewIdx','activeEditStopId','rideActionVisible'].forEach(key=>{
  Object.defineProperty(window, key, {
    configurable:true,
    get(){ return S[key]; },
    set(v){ S[key]=v; },
  });
});

// ── data（再代入は setData 経由）──
Object.defineProperty(window, 'data', {
  configurable:true,
  get(){ return _stateData; },
  set(v){ setData(v); },
});

// ── 関数・コレクション類（読み取りのみ。中身の操作はそのまま反映される）──
Object.assign(window, {
  render, renderRide, toggleEdit, ensureAllWeather, nowMin, _setNowMinOverride,
  _setDetailsOpen, _setFuelCheck, _dom, setData, save, hideInfoToast,
  renderTabs, _updateStickyTops, currentDayFlat,
  esc, isSafeUrl, _isoToday, onMouseDragEnd: _drag.onMouseDragEnd,
  wxStopRes, wxQueue, wxQueueFast, wxQueueIds, geoCache,
});

// ── ドラッグ状態変数（09-drag の let。テストは読み取りのみ）──
// モジュール名前空間オブジェクト経由なので常に最新値を返す
['tGhost','tDragId','tDragEl','tStopRows',
 'mGhost','mDragId','mDragEl','mStopRows'].forEach(key=>{
  Object.defineProperty(window, key, {
    configurable:true,
    get(){ return _drag[key]; },
  });
});

// ── splashSettings（let だが再代入されずプロパティ更新のみ。読み取り用 getter）──
Object.defineProperty(window, 'splashSettings', {
  configurable:true,
  get(){ return splashSettings; },
});
/* ▲▲▲ 自動テスト用ブリッジ ここまで ▲▲▲ */
