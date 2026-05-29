/* ══════════════════════════════════════════════════════
   旅刻 mk16 — _expose.js（インラインイベントハンドラのwindow公開ブリッジ）
   ESM化でモジュールスコープになった関数を、HTMLの on*="fn()" 属性から
   参照できるよう window へ明示公開する。ここに列挙された関数だけが公開API。
   ※ 09-drag / 10-pickers はこのファイルのimportで初めて読み込まれる（他からimportされないため）。
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

import { loadJSON, loadSampleData, onFileSelected, saveJSON, saveRecord, shareItinerary } from './03-storage.js';
import { retryStopWeather } from './04-weather.js';
import { delStop, saveStop, setCurrentStop } from './05-stop.js';
import { _commitTitle, _saveRouteDebounced, _saveTitleDebounced, addDay, deleteCurrentDay, saveDayDate, switchDay } from './06-day.js';
import { checkTimeOrder, dismissAppError, rideNavigate, toggleRideAction } from './07-render.js';
import { _toggleTheme, cancelEdit, cancelToRide, onEditBtnClick, openEditStop, tapStopInEdit, toggleRide } from './08-mode.js';
import { _cancelTouchDrag, onMouseDragStart, onTouchDragEnd, onTouchDragMove, onTouchDragStart } from './09-drag.js';
import { filterGasStation, filterHighwayDebounced, filterMichiDebounced, openGasStation, openHighway, openKaikatsu, openMichinoEki, openToiletMap, selectGasStation, selectHighway, selectMichi } from './10-pickers.js';
import { _closeOverlay, _saveSplashSettings, _updateEpisodePreview, openSplashSettings, toggleDetails, toggleFuelCheck } from './11-overlays.js';
import { _dbgClear, _dbgCopy, _dbgDownload, _dbgSetEnabled } from './12-debug.js';
import { toggleGps } from './14-gps.js';

Object.assign(window, {
  _cancelTouchDrag, _closeOverlay, _commitTitle, _dbgClear, _dbgCopy, _dbgDownload, _dbgSetEnabled, _saveRouteDebounced, _saveSplashSettings, _saveTitleDebounced, _toggleTheme, _updateEpisodePreview, addDay, cancelEdit, cancelToRide, checkTimeOrder, delStop, deleteCurrentDay, dismissAppError, filterGasStation, filterHighwayDebounced, filterMichiDebounced, loadJSON, loadSampleData, onEditBtnClick, openEditStop, onFileSelected, onMouseDragStart, onTouchDragEnd, onTouchDragMove, onTouchDragStart, openGasStation, openHighway, openKaikatsu, openMichinoEki, openSplashSettings, openToiletMap, retryStopWeather, rideNavigate, saveDayDate, saveJSON, saveRecord, saveStop, selectGasStation, selectHighway, selectMichi, setCurrentStop, shareItinerary, switchDay, tapStopInEdit, toggleDetails, toggleFuelCheck, toggleGps, toggleRide, toggleRideAction,
});
