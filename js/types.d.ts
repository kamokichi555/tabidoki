/* ══════════════════════════════════════════════════════
   旅刻 mk16 — types.d.ts（共有型定義 / 型専用・実行時には読み込まれない）
   各JSの先頭に // @ts-check を付けると、エディタがここで定義した
   データ構造に照らして、フィールド名の誤りや null アクセスを警告する。
   ※ index.html からは読み込まないこと（型情報のみで実行コードは無い）。
   ══════════════════════════════════════════════════════ */

/** 1地点（スポット）。全フィールドは _sanitizeImportedData で必ず補完される。 */
interface Stop {
  id: string;
  name: string;
  addr: string;
  note: string;
  arr: string;     // 到着予定 "HH:MM"（未設定は ""）
  dep: string;     // 出発予定 "HH:MM"
  fuel: boolean;   // 給油チェック
  actArr: string;  // 実績到着 "HH:MM"
  actDep: string;  // 実績出発 "HH:MM"
  log: string;     // 走行ログ/メモ
}

/** 1日（デイ）。 */
interface Day {
  label: string;
  date: string;    // "YYYY-MM-DD"（未設定は ""）
  routeUrl: string;
  stops: Stop[];
}

/** 行程データ全体（localStorage / 共有JSON の中身）。 */
interface TouringData {
  version: string;
  title: string;
  currentStopId: string | null;
  days: Day[];
}

/** アプリの可変UI状態（01-state.js の S）。 */
interface AppState {
  isEdit: boolean;
  isRide: boolean;
  editingId: string | null;
  currentDay: number;
  manualCurrentId: string | null;
  rideViewIdx: number;
  activeEditStopId: string | null;
  rideActionVisible: boolean;
  _pendingRestore: TouringData | null;
}

/* ── DOM/ブラウザ型の最小拡張 ──
   このアプリは getElementById で取得した要素から .value/.checked を
   キャストせず直接読む。// @ts-check の誤検知を抑えるための意図的な緩め。
   （データ構造の検査が主目的で、DOM要素種別の厳密化は狙いではない） */
interface HTMLElement { value?: any; checked?: boolean; }
interface Window { MSStream?: unknown; }
interface ScreenOrientation { lock?(orientation: string): Promise<void>; }
