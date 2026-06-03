/* ══════════════════════════════════════════════════════
   旅刻 — js/lock.js
   起動ロック（パスワード入力で起動）
   ・index.html から classic script として、13-init.js より前に読み込む
   ・パスワードが正しいときだけ js/13-init.js（本体）を起動する
   注意: これはのぞき見防止の簡易ロックです。データは端末内に保存され、
        開発者ツール等を使えば閲覧可能です（本当の暗号化ではありません）。
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var HASH_KEY = 'tabidoki_lock_hash';
  var SALT_KEY = 'tabidoki_lock_salt';
  var REMEMBER_KEY = 'tabidoki_lock_seen';    // 最後に認証した時刻(ms)。一定期間は再入力を省く
  var REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 記憶期間: 30日

  function isRemembered() {
    try {
      var t = parseInt(localStorage.getItem(REMEMBER_KEY) || '', 10);
      if (!t || isNaN(t)) return false;
      return (Date.now() - t) < REMEMBER_MS;
    } catch (e) { return false; }
  }
  function markRemembered() {
    try { localStorage.setItem(REMEMBER_KEY, String(Date.now())); } catch (e) {}
  }
  function clearRemembered() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
  }
  // 貸すとき等に即ロック: 記憶を消して再読み込み → 次回起動でパスワードを要求する。
  // アプリ側のメニュー等から window.tdkLockNow() を呼べば手動ロックできる。
  try { window.tdkLockNow = function () { clearRemembered(); location.reload(); }; } catch (e) {}

  // ── パスワードのハッシュ化 ─────────────────────────────
  // 可能なら Web Crypto(SHA-256)。使えない環境では簡易ハッシュにフォールバック。
  function randomSalt() {
    try {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (e) {
      return String(Date.now()) + Math.random().toString(16).slice(2);
    }
  }

  function hashPassword(pw, salt) {
    var data = salt + ':' + pw;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      var bytes = new TextEncoder().encode(data);
      return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    // フォールバック（簡易・非暗号学的）。HTTPSでないローカル等向けの保険。
    var h = 5381;
    for (var i = 0; i < data.length; i++) { h = ((h << 5) + h + data.charCodeAt(i)) | 0; }
    return Promise.resolve('fb' + (h >>> 0).toString(16));
  }

  function getStored() {
    try { return { hash: localStorage.getItem(HASH_KEY), salt: localStorage.getItem(SALT_KEY) }; }
    catch (e) { return { hash: null, salt: null }; }
  }
  function setStored(hash, salt) {
    try { localStorage.setItem(HASH_KEY, hash); localStorage.setItem(SALT_KEY, salt); return true; }
    catch (e) { return false; }
  }

  // ── スタイル ────────────────────────────────────────
  function injectStyle() {
    var css =
      '#tdk-lock{position:fixed;inset:0;z-index:2147483647;background:#0d0d0d;color:#f0ebd7;' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      "font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;" +
      '-webkit-tap-highlight-color:transparent}' +
      '#tdk-lock *{box-sizing:border-box}' +
      '.tdk-card{width:100%;max-width:340px;text-align:center}' +
      '.tdk-logo{font-size:44px;margin-bottom:8px}' +
      '.tdk-title{font-size:22px;font-weight:700;letter-spacing:.12em;margin:0 0 4px}' +
      '.tdk-sub{font-size:13px;color:rgba(240,235,215,.65);margin:0 0 22px;line-height:1.5}' +
      '.tdk-input{width:100%;font-size:18px;padding:14px 16px;border-radius:14px;border:1.5px solid rgba(240,235,215,.25);' +
      'background:rgba(255,255,255,.05);color:#f0ebd7;outline:none;margin-bottom:12px;text-align:center;letter-spacing:.1em}' +
      '.tdk-input:focus{border-color:rgba(192,40,10,.9)}' +
      '.tdk-btn{width:100%;font-size:17px;font-weight:700;padding:14px;border-radius:14px;border:none;cursor:pointer;' +
      'background:#C0280A;color:#fff;letter-spacing:.08em}' +
      '.tdk-btn:active{opacity:.85}' +
      '.tdk-link{display:inline-block;margin-top:18px;font-size:13px;color:rgba(240,235,215,.55);' +
      'text-decoration:underline;cursor:pointer;background:none;border:none}' +
      '.tdk-err{min-height:20px;font-size:13px;color:#ff6b5e;margin:2px 0 10px;font-weight:700}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── 本体（13-init.js）の起動 ────────────────────────
  var booted = false;
  function bootApp() {
    if (booted) return;
    booted = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'js/13-init.js';
    document.body.appendChild(s);
  }

  function removeLock() {
    var el = document.getElementById('tdk-lock');
    if (el) el.parentNode.removeChild(el);
  }

  // ── 画面 ────────────────────────────────────────────
  function buildLock() {
    injectStyle();
    var stored = getStored();
    var isSetup = !stored.hash; // 初回＝パスワード設定

    var wrap = document.createElement('div');
    wrap.id = 'tdk-lock';
    wrap.innerHTML =
      '<div class="tdk-card">' +
      '<div class="tdk-logo">🔒</div>' +
      '<h1 class="tdk-title">旅刻</h1>' +
      '<p class="tdk-sub" id="tdk-sub"></p>' +
      '<input class="tdk-input" id="tdk-pw1" type="password" inputmode="text" ' +
      'autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="パスワード">' +
      '<input class="tdk-input" id="tdk-pw2" type="password" autocomplete="off" ' +
      'autocapitalize="off" autocorrect="off" placeholder="もう一度入力" style="display:none">' +
      '<div class="tdk-err" id="tdk-err"></div>' +
      '<button class="tdk-btn" id="tdk-go"></button>' +
      '<button class="tdk-link" id="tdk-change" style="display:none">パスワードを変更</button>' +
      '</div>';
    document.body.appendChild(wrap);

    var sub = wrap.querySelector('#tdk-sub');
    var pw1 = wrap.querySelector('#tdk-pw1');
    var pw2 = wrap.querySelector('#tdk-pw2');
    var err = wrap.querySelector('#tdk-err');
    var go = wrap.querySelector('#tdk-go');
    var change = wrap.querySelector('#tdk-change');

    function setError(msg) { err.textContent = msg || ''; }

    function renderSetup() {
      sub.textContent = 'はじめに、起動用のパスワードを設定してください。';
      pw1.placeholder = '新しいパスワード';
      pw2.style.display = '';
      go.textContent = '設定して開始';
      change.style.display = 'none';
      setError('');
      pw1.value = ''; pw2.value = '';
      setTimeout(function () { pw1.focus(); }, 60);
    }

    function renderUnlock() {
      sub.textContent = 'パスワードを入力してください。';
      pw1.placeholder = 'パスワード';
      pw2.style.display = 'none';
      go.textContent = '解除して開始';
      change.style.display = '';
      setError('');
      pw1.value = '';
      setTimeout(function () { pw1.focus(); }, 60);
    }

    // 変更モード: 現在のPW → 新PW×2
    var changeMode = false;
    var changeStep = 0; // 0=現在確認, 1=新規入力
    function renderChange() {
      changeMode = true; changeStep = 0;
      sub.textContent = 'パスワードを変更します。まず現在のパスワードを入力してください。';
      pw1.placeholder = '現在のパスワード';
      pw2.style.display = 'none';
      go.textContent = '次へ';
      change.style.display = 'none';
      setError('');
      pw1.value = ''; pw2.value = '';
      setTimeout(function () { pw1.focus(); }, 60);
    }

    function doSetup() {
      var a = pw1.value, b = pw2.value;
      if (a.length < 4) { setError('4文字以上にしてください'); return; }
      if (a !== b) { setError('パスワードが一致しません'); return; }
      var salt = randomSalt();
      hashPassword(a, salt).then(function (h) {
        if (!setStored(h, salt)) { setError('保存に失敗しました'); return; }
        finishUnlock();
      });
    }

    function doUnlock() {
      var s = getStored();
      hashPassword(pw1.value, s.salt || '').then(function (h) {
        if (h === s.hash) { finishUnlock(); }
        else { setError('パスワードが違います'); pw1.value = ''; pw1.focus(); }
      });
    }

    function doChange() {
      var s = getStored();
      if (changeStep === 0) {
        hashPassword(pw1.value, s.salt || '').then(function (h) {
          if (h !== s.hash) { setError('現在のパスワードが違います'); pw1.value = ''; return; }
          changeStep = 1;
          sub.textContent = '新しいパスワードを入力してください。';
          pw1.placeholder = '新しいパスワード';
          pw2.style.display = '';
          go.textContent = '変更して開始';
          setError(''); pw1.value = ''; pw2.value = '';
          pw1.focus();
        });
      } else {
        var a = pw1.value, b = pw2.value;
        if (a.length < 4) { setError('4文字以上にしてください'); return; }
        if (a !== b) { setError('パスワードが一致しません'); return; }
        var salt = randomSalt();
        hashPassword(a, salt).then(function (h) {
          if (!setStored(h, salt)) { setError('保存に失敗しました'); return; }
          finishUnlock();
        });
      }
    }

    function finishUnlock() {
      markRemembered();   // 認証成功を記録 → 以後は記憶期間内なら素通り
      bootApp();
      removeLock();
    }

    function onGo() {
      if (changeMode) doChange();
      else if (isSetup) doSetup();
      else doUnlock();
    }

    go.addEventListener('click', onGo);
    [pw1, pw2].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onGo(); }
      });
    });
    change.addEventListener('click', renderChange);

    if (isSetup) renderSetup(); else renderUnlock();
  }

  // 起動: パスワード設定済み かつ 記憶が有効なら、ロック画面を出さず即起動する。
  // それ以外（初回設定 / 記憶切れ / localStorage不可）はロック画面を表示する。
  function start() {
    var stored = getStored();
    if (stored.hash && isRemembered()) { bootApp(); return; }
    buildLock();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
