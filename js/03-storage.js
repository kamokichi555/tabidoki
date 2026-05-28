/* ══════════════════════════════════════════════════════
   旅刻 mk15 — 03-storage.js
   データ管理（save / share / saveJSON / saveRecord / load / migration）
   依存: 00-constants.js（SK/DEFAULT/LIMIT）, 02-utils.js（sanitize等）
   実行時依存: data, currentDay, render, showInfoToast, showAppError
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */

/* ══ データ管理（localStorage） ══ */

function save(){
  try{
    data.currentStopId=manualCurrentId;
    data.version=DEFAULT.version;
    _lsSetItem(SK,JSON.stringify(data));
  }catch(e){showAppError(EC.SAVE,e);}
}

function shareItinerary(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから共有文を生成
  const WEEK=['日','月','火','水','木','金','土'];
  const fmtDate=iso=>{
    if(!iso) return '日付未設定';
    try{const d=new Date(iso+'T12:00:00');if(isNaN(d.getTime()))return iso;return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;}
    catch(e){return iso;}
  };
  const lines=[];
  const title=data.title||'ツーリング行程';
  lines.push('═══════════════════════');
  lines.push(`  ${title}`);
  lines.push('═══════════════════════');
  data.days.forEach((day,di)=>{
    lines.push('');
    lines.push(`【${di+1}日目】${fmtDate(day.date)}`);
    if(!day.stops.length){lines.push('　（地点未登録）');return;}
    day.stops.forEach(s=>{
      lines.push('');
      lines.push(`${s.fuel?'⛽ ':'▶ '}${s.name}`);
      const times=[];
      if(s.arr) times.push(`到着 ${s.arr}`);
      if(s.dep) times.push(`出発 ${s.dep}`);
      if(times.length) lines.push(`  ${times.join('｜')}`);
      if(s.note) lines.push(`  📝 ${s.note}`);
    });
  });
  lines.push('');
  lines.push('───────────────────────');
  lines.push(`  旅刻 / Powered by 鴨吉`);
  const text=lines.join('\n');
  // Web Share APIは使わず常に自前モーダルで全文表示
  const ov=document.createElement('div');
  ov.id='share-overlay';
  Object.assign(ov.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
  ov.innerHTML=`<div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:440px;max-height:92dvh;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <span style="font-weight:700;font-size:16px">📋 行程テキスト</span>
      <button onclick="_closeOverlay('share-overlay')" style="border:none;background:none;font-size:24px;padding:2px 8px;color:var(--text3)">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch">
      <pre id="share-text" style="margin:0;white-space:pre-wrap;word-break:break-word;background:var(--bg3);border:1.5px solid var(--border2);border-radius:10px;color:var(--text2);font-size:14px;line-height:1.8;padding:12px;font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"></pre>
    </div>
    <button id="share-copy-btn" onclick="(async()=>{try{await navigator.clipboard.writeText(document.getElementById('share-text').textContent);const b=document.getElementById('share-copy-btn');b.textContent='✅ コピーしました';b.style.background='var(--green)';b.style.color='#000';setTimeout(()=>{_closeOverlay('share-overlay');},1200);}catch(e){const r=document.createRange();r.selectNode(document.getElementById('share-text'));window.getSelection().removeAllRanges();window.getSelection().addRange(r);}})()\" style="width:100%;justify-content:center;padding:13px;font-size:16px;flex-shrink:0">📋 クリップボードにコピー</button>
    <div style="font-size:12px;color:var(--text3);text-align:center;flex-shrink:0">💡 LINEやメモに貼り付けてバックアップにも</div>
  </div>`;
  // 背景タップで閉じる
  ov.addEventListener('click',e=>{if(e.target===ov) _closeOverlay('share-overlay');});
  _lowerHeaderForOverlay();document.body.appendChild(ov);
  document.getElementById('share-text').textContent=text;
}

function saveJSON(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してからファイル名生成
  _dbgLog('saveJSON', _dbgSnapshot);
  try{
    // 空データチェック: 全日で地点が1件もない場合は保存させない
    const totalStops=(data.days||[]).reduce((sum,d)=>sum+(d.stops?.length||0),0);
    if(totalStops===0){
      showInfoToast('⚠️ 地点が登録されていません。1件以上追加してから保存してください',3500);
      return;
    }
    data.currentStopId=manualCurrentId;
    data.version=DEFAULT.version;
    const json=JSON.stringify(data,null,2);
    const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;
    const title=(data.title||'ツーリング行程').replace(/[\\/:*?"<>|]/g,'_');
    const btn=document.getElementById('json-save-btn');
    if(isIOS){
      // iOS Safari: data:URLで新しいタブを開いて長押し保存を促す
      const dataUrl='data:application/json;charset=utf-8,'+encodeURIComponent(json);
      window.open(dataUrl,'_blank');
      if(btn){
        const orig=btn.textContent;
        btn.textContent='📄 タブで開きました';
        btn.style.background='var(--blue,#4da6ff)';
        btn.style.color='#000';
        setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},3500);
      }
      showInfoToast('📄 開いたタブで長押し→「保存」してください',4000);
    }else{
      const blob=new Blob([json],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`${title}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      if(btn){
        const orig=btn.textContent;
        btn.textContent='✅';
        btn.style.background='var(--green)';
        btn.style.color='#000';
        setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},2000);
      }
    }
  }catch(e){alert('保存に失敗しました: '+e.message);}
}
function saveRecord(){
  _closeAllOverlays();
  _flushTitle(); // 入力中のツーリング名を確定してから記録を生成
  _dbgLog('saveRecord', _dbgSnapshot);
  try{
    const totalStops=(data.days||[]).reduce((sum,d)=>sum+(d.stops?.length||0),0);
    if(totalStops===0){showInfoToast('⚠️ 地点が登録されていません',3000);return;}
    if(!confirm('ツーリングお疲れ様でした。\n走行記録をテキストファイルに保存しますか？')) return;
    const now=new Date();
    const WEEK=['日','月','火','水','木','金','土'];
    const fmtDate=iso=>{if(!iso)return'';try{const d=new Date(iso+'T12:00:00');if(isNaN(d.getTime()))return iso;return`${d.getMonth()+1}/${d.getDate()}(${WEEK[d.getDay()]})`;}catch(e){return iso;}};
    const fmtDiff=d=>{if(d===null)return'';const abs=Math.abs(d),h=Math.floor(abs/60),m=abs%60;const str=h>0&&m>0?`${h}時間${m}分`:h>0?`${h}時間`:`${m}分`;return d===0?'定刻':d>0?`+${str}`:`-${str}`;};
    const HR='─'.repeat(30);
    const lines=[];
    lines.push('旅刻 走行記録');
    lines.push(HR);
    if(data.title) lines.push(`タイトル：${data.title}`);
    lines.push(`記録日：${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()}（${WEEK[now.getDay()]}）`);
    lines.push('');
    data.days.forEach((day,di)=>{
      if(!day.stops||!day.stops.length) return;
      lines.push(`【${di+1}日目${day.date?' '+fmtDate(day.date):''}】`);
      lines.push('');
      day.stops.forEach((s,si)=>{
        lines.push(`${si+1}. ${s.name}`);
        const planParts=[];
        if(s.arr) planParts.push(`着 ${s.arr}`);
        if(s.dep) planParts.push(`発 ${s.dep}`);
        const sd=stayDur(s.arr,s.dep);
        if(planParts.length) lines.push(`   計画  ${planParts.join('　')}${sd?' '+sd:''}`);
        const actParts=[];
        if(s.actArr){const d=actDiff(s.arr,s.actArr);actParts.push(`実着 ${s.actArr}${d!==null?' ('+fmtDiff(d)+')':''}`);}
        if(s.actDep){const d=actDiff(s.dep,s.actDep);actParts.push(`実発 ${s.actDep}${d!==null?' ('+fmtDiff(d)+')':''}`);}
        if(actParts.length) lines.push(`   実績  ${actParts.join('　')}`);
        if(s.note) lines.push(`   メモ  ${s.note}`);
        if(s.log)  lines.push(`   📝   ${s.log}`);
        if(s.fuel) lines.push(`   ⛽   給油ポイント`);
        lines.push('');
      });
    });
    lines.push(HR);
    lines.push('旅刻mk15 / Powered by 鴨吉');
    const text=lines.join('\n');
    const dateStr=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const title=(data.title||'ツーリング').replace(/[\\/:*?"<>|]/g,'_');
    const filename=`旅刻_記録_${title}_${dateStr}.txt`;
    const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;
    const btn=document.getElementById('record-save-btn');
    if(isIOS){
      const dataUrl='data:text/plain;charset=utf-8,'+encodeURIComponent(text);
      window.open(dataUrl,'_blank');
      if(btn){const orig=btn.textContent;btn.textContent='📄';btn.style.background='var(--blue,#4da6ff)';btn.style.color='#000';setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},3500);}
      showInfoToast('📄 開いたタブで長押し→「保存」してください',4000);
    }else{
      const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=filename;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      if(btn){const orig=btn.textContent;btn.textContent='✅';btn.style.background='var(--green)';btn.style.color='#000';setTimeout(()=>{btn.textContent=orig;btn.style.background='';btn.style.color='';},2000);}
      showInfoToast(`📝 記録を保存しました：${filename}`,3000);
    }
  }catch(e){alert('記録の保存に失敗しました: '+e.message);}
}
function loadJSON(){
  if(_hasAnyStops()&&!confirm('現在の行程は上書きされます。続けますか？')) return;
  document.getElementById('load-file-input').value='';
  document.getElementById('load-file-input').click();
}

/* ── localStorageの保存データを再読み込みする（起動時に「読み込まない」を選んだ後の復旧用） ── */
function restoreFromStorage(){
  try{
    const _raw=localStorage.getItem(SK);
    if(!_raw){showInfoToast('⚠️ 保存データが見つかりませんでした',3000);return;}
    const _p=JSON.parse(_raw);
    // saveは編集のたびに即実行されるため、localStorageは常に現在の作業内容と一致する。
    // よってここでの再読込は現状の再適用（最悪でもno-op）であり、確認は不要。
    _applyImportedData(_p,_p.title,true);
  }catch(e){showAppError(EC.LOAD,e);}
}

/* ── 読み込んだJSONを適用する共通処理 ── */
function _applyImportedData(p,titleFallback,skipConfirm){
  if(!p||typeof p!=='object'||!Array.isArray(p.days)) throw new Error('フォーマットが正しくありません');
  if(!p.days.length) p.days=[{label:'1日目',date:'',routeUrl:'',stops:[]}];
  if(p.version&&['mk13-v1','mk8-v1','mk7-v2','mk7-v1','mk6-v1','mk5-v1','mk4-v2','mk4-v1'].includes(p.version)){
    if(p.version==='mk4-v1'){let mid=null;for(const d of p.days){if(d.currentStopId){mid=d.currentStopId;break;}}p.currentStopId=mid;}
    p.version=DEFAULT.version;
    for(const d of p.days||[]){
      if(!('date' in d)) d.date='';
      if(!('routeUrl' in d)) d.routeUrl='';
      for(const s of d.stops||[]) if(!('addr' in s)) s.addr='';
    }
  }
  const _truncated=_sanitizeImportedData(p);
  const title=p.title||titleFallback||'（タイトルなし）';
  if(!skipConfirm&&!confirm(`「${title}」を読み込みます。\n現在の行程は上書きされます。よろしいですか？`)){hideInfoToast();return;}
  data=p;
  manualCurrentId=data.currentStopId??(data.days[0]?.stops[0]?.id??null);
  // currentStopId が存在しない地点を指している場合は無効化（getStatus の誤判定を防ぐ）
  if(manualCurrentId){
    let _found=false;
    _outer:for(const _d of data.days){for(const _s of _d.stops){if(_s.id===manualCurrentId){_found=true;break _outer;}}}
    if(!_found) manualCurrentId=data.days[0]?.stops[0]?.id??null;
  }
  currentDay=0;editingId=null;activeEditStopId=null;
  Object.keys(wxStopRes).forEach(k=>delete wxStopRes[k]);
  wxGen++; // 実行中の天気取得ループを世代変化で無効化（強制終了させない＝並行実行を防ぐ）
  wxQueueIds.clear();wxQueue.length=0;wxQueueFast.length=0;
  _cachedCdiForId=null;
  save(); // 読み込んだデータを即座にlocalStorageへ反映（読み込み直後にタブを閉じても残るように）
  requestAnimationFrame(()=>{
    if(isRide){isRide=false;document.body.classList.remove('ride-mode');_dom('normal-view').style.display='block';_dom('ride-view').classList.remove('active');_dom('ride-btn').classList.remove('on');_dom('ride-btn').textContent='🏍️';_dom('day-tabs').style.display='';_dom('day-manage').style.display='none';_dom('cancel-ride-btn').style.display='none';}
    if(!isEdit){isEdit=true;_dom('edit-area').style.display='block';}
    _syncTitleInput(); // 読み込んだタイトルをツーリング名欄に反映
    setFormAdd(); // isEdit状態に関わらず常にフォームをリセット（既存編集中のロード時に古い入力値が残るのを防ぐ）
    editingId=null;activeEditStopId=null;
    renderTabs();render();hideInfoToast();
    if(_truncated)showInfoToast(`⚠️ 1日${LIMIT.stopsPerDay}件を超える地点は読み込みませんでした`,4000);
    else showInfoToast(`🗺️ 「${title}」を読み込みました`,3000);
    _lastClockTs='';updateClock(); // 走行モードから戻った場合に時計サイズを即時更新
    requestAnimationFrame(()=>{
      _updateStickyTops();
      const nv=_dom('normal-view');
      if(!nv) return;
      const firstStop=nv.querySelector('#timeline .stop-row');
      if(firstStop){
        const nvRect=nv.getBoundingClientRect();
        const stopRect=firstStop.getBoundingClientRect();
        nv.scrollTo({top:nv.scrollTop+(stopRect.top-nvRect.top)-8,behavior:'instant'});
      }else{
        nv.scrollTo({top:0,behavior:'instant'});
      }
    });
  });
}

/* ── サンプルデータ（インライン埋め込み） ── */
const _SAMPLE_DATA={
  "version":"mk8-v1","title":"神奈川〜山梨 日帰りツーリング","currentStopId":null,
  "days":[
    {
      "label":"1日目\n神奈川→山梨","date":"","routeUrl":"",
      "stops":[
        {"id":"s001","name":"横浜 出発","addr":"神奈川県横浜市西区","arr":"","dep":"08:00","note":"早めに出発。首都高・保土ヶ谷バイパスを避けて下道で","fuel":false},
        {"id":"s002","name":"宮ヶ瀬湖","addr":"神奈川県愛甲郡清川村宮ヶ瀬","arr":"09:30","dep":"10:00","note":"湖畔で休憩。紅葉シーズンは特に絶景","fuel":false},
        {"id":"s003","name":"道志みち（国道413号）","addr":"神奈川県相模原市緑区青根","arr":"10:30","dep":"10:35","note":"ワインディングを満喫。スピードに注意","fuel":false},
        {"id":"s004","name":"道の駅 どうし","addr":"山梨県南都留郡道志村道志","arr":"11:15","dep":"12:15","note":"名物の道志産鹿カレーや地元野菜を堪能。バイクも多い","fuel":false},
        {"id":"s005","name":"山中湖","addr":"山梨県南都留郡山中湖村山中","arr":"12:50","dep":"13:30","note":"富士山の眺望ポイント。花の都公園近くが撮影スポット","fuel":false},
        {"id":"s006","name":"富士山パノラマロープウェイ","addr":"山梨県南都留郡富士河口湖町","arr":"14:00","dep":"14:30","note":"河口湖周辺。湖畔ぐるりもおすすめ","fuel":false},
        {"id":"s007","name":"道の駅 なるさわ","addr":"山梨県南都留郡鳴沢村字ジラゴンノ","arr":"15:00","dep":"15:30","note":"富士山の溶岩を展示。ここで給油チェックを","fuel":true},
        {"id":"s008","name":"横浜 帰着","addr":"神奈川県横浜市西区","arr":"18:00","dep":"","note":"中央道・相模原IC経由が渋滞少なめ","fuel":false}
      ]
    }
  ]
};

/* ── サンプルデータを読み込む（インライン版・fetch不要） ── */
function loadSampleData(){
  _closeAllOverlays();
  if(_hasAnyStops()&&!confirm('現在の行程データがサンプルデータで上書きされます。\n続けますか？')) return;
  try{
    _applyImportedData(JSON.parse(JSON.stringify(_SAMPLE_DATA)),'サンプル行程',true);
  }catch(err){
    showAppError(EC.LOAD,err);
  }
}

function onFileSelected(ev){
  const file=ev.target.files[0];
  if(!file) return;
  // ① 拡張子 / MIMEチェック
  const okExt=file.name.toLowerCase().endsWith('.json');
  const okMime=!file.type||file.type==='application/json'||file.type==='text/plain';
  if(!okExt||!okMime){
    showAppError(EC.LOAD,new Error('JSONファイルを選択してください'));
    return;
  }
  // ② サイズチェック（上限512KB）
  const MAX_BYTES=512*1024;
  if(file.size>MAX_BYTES){
    showAppError(EC.LOAD,new Error(`ファイルサイズが上限（512KB）を超えています（${(file.size/1024).toFixed(0)}KB）`));
    return;
  }
  showInfoToast('');
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const p=JSON.parse(e.target.result);
      p.title=file.name.replace(/\.json$/i,''); // ファイル名をタイトルとして強制セット
      _applyImportedData(p,file.name.replace(/\.json$/i,''),true); // loadJSON側で確認済みのためskip
    }catch(err){
      hideInfoToast();
      showAppError(EC.LOAD,err);
    }
  };
  reader.onerror=()=>{hideInfoToast();showAppError(EC.LOAD,new Error('ファイルの読み込みに失敗しました'));};
  reader.readAsText(file,'UTF-8');
}
