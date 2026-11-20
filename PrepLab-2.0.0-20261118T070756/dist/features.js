import { fetchHealth, interviewRequest, setAccessToken, hasAccessToken } from './ai-client.js';
import { InterviewVoice } from './realtime.js';
import { createBackup, parseBackup, MAX_BACKUP_BYTES } from './portability.js';
import { putRecording, listRecordings, replaceRecordings, deleteSessionRecordings, clearRecordings } from './audio-store.js';

export function createFeatures(h) {
  let health = null, busy = false, voice = null, voiceStatus = 'disconnected', audioWrites = Promise.resolve(), voiceClosing = Promise.resolve();
  const E = h.esc, $ = s => document.querySelector(s);
  const labels = { disconnected:'尚未連線',connecting:'連線中',ready:'準備就緒',listening:'正在收音',processing:'處理回答中',speaking:'面試官說話中' };
  async function refresh() { try { health = await fetchHealth(); } catch { health = null; } paintBadge(); return health; }
  function paintBadge() { const b=$('.prototype-badge'); if(b) b.textContent=health?.configured?'GPT 已設定 · 可開始 AI 練習':'示範可用 · GPT 尚未設定'; }
  function disconnect() { const v=voice; voice=null; const closed=v?.close(); voiceClosing=Promise.all([voiceClosing,closed]).then(()=>{}).catch(e=>h.toast(e.message)); voiceStatus='disconnected'; paintVoice();return voiceClosing; }
  async function task(fn) { if(busy) return; busy=true; document.body.classList.add('ai-busy'); try { await fn(); } catch(e) { h.toast(e.message); } finally { busy=false; document.body.classList.remove('ai-busy'); } }
  function paintVoice() { const label=$('#voice-status'); if(label)label.textContent=labels[voiceStatus]||voiceStatus; const b=$('[data-action="voice-record"]'); if(b) { b.textContent=voice?.recording?'結束回答':'開始口頭回答'; b.disabled=!!h.current()?.paused || !voice || voiceStatus!=='ready'&&!voice.recording; } }
  async function saveAudio(blob, {sessionId,questionId,slot='main'}) {
    const id=`${sessionId}:${questionId}:${slot}`;
    const record={id,sessionId,questionId,slot,blob,createdAt:new Date().toISOString()};
    audioWrites=audioWrites.then(()=>putRecording(record));
    try { await audioWrites; await loadAudio(); } catch(e) { audioWrites=Promise.resolve(); h.toast(e.message); }
  }
  async function loadAudio() {
    const recordings=await listRecordings();
    for(const url of h.audioURLs.values())URL.revokeObjectURL(url);
    h.audioURLs.clear();
    for(const r of recordings) { const key=`${r.sessionId}:${r.questionId}:${r.slot||'main'}`;h.audioURLs.set(key,URL.createObjectURL(r.blob)); if(r.slot==='main'||!r.slot)h.audioURLs.set(`${r.sessionId}:${r.questionId}`,h.audioURLs.get(key)); }
  }
  async function start(profile, seed, id) {
    if(profile.mode!=='ai')return {questions:seed};
    const result=await interviewRequest({action:'plan',profile,questions:seed},id);
    if(!Array.isArray(result.data?.questions)||!result.data.questions.length)throw Error('AI 未提供有效題目，請重試。');
    return {questions:result.data.questions,meta:result.meta};
  }
  function afterRender() {
    paintBadge(); const s=h.current();
    if(location.hash==='#setup') {
      const aside=$('.side-summary');
      if(aside&&!$('#practice-mode')) {
        const note=aside.querySelector('.note');
        note.innerHTML='示範模式在本機操作。GPT 模式會把履歷、職缺、題目、作答與程式送往 OpenAI；啟用語音時亦會傳送聲音。錄音與歷史可在設定中完整備份。';
        aside.insertAdjacentHTML('afterbegin',`<label class="field"><span>練習模式</span><select id="practice-mode" name="mode"><option value="demo">示範練習（不呼叫 AI）</option><option value="ai">GPT 面試（使用 API 額度）</option></select></label>`);
        $('#practice-mode').value=h.getState().profile.mode||'demo';
        aside.querySelectorAll('.detail-line b')[1].textContent='錄音回聽／GPT 即時語音';
      }
    }
    if(location.hash==='#room'&&s?.mode==='ai') {
      $('.interviewer small').textContent='GPT 面試 · 先思考，再說明';
      $('.session-disclaimer').textContent='GPT 回饋可能有誤，請核對依據。程式只做分析，不會編譯或執行。';
      const f=$('[data-action="followup"]');if(f)f.textContent='請 GPT 追問';
      const ftag=$('.followup .answer-label span');if(ftag)ftag.textContent='GPT 追問';
      const target=$('.interviewer');target.insertAdjacentHTML('afterend',`<div class="voice-panel"><div class="section-title"><h3>語音面試</h3><span id="voice-status" role="status"></span></div><p class="feedback-note">按鈕控制開始與結束。語音會送往 OpenAI；逐字稿可在回答欄核對。每題最多一次追問。</p><div class="toolbar"><button class="btn small" data-action="voice-connect">連接語音</button><button class="btn small" data-action="voice-record">開始口頭回答</button><button class="text-button" data-action="voice-play">播放語音</button><button class="text-button" data-action="voice-close">斷開</button></div></div>`);paintVoice();
    }
    if(location.hash==='#report') {
      const report=h.selectedReport();if(!report)return;
      const note=$('main > .note');if(note)note.textContent='字詞標記僅供自我檢查。GPT 分析會另列引用依據，不代表執行測試、錄取機率或正式能力評分。';
      document.querySelectorAll('.report-card').forEach((card,i)=>{
        const q=report.questions[i],a=report.answers.find(x=>x.questionId===q.id);if(!a)return;
        const recordings=[...h.audioURLs.entries()].filter(([key])=>key.startsWith(`${report.id}:${q.id}:`));
        for(const [key,url] of recordings)card.insertAdjacentHTML('beforeend',`<p class="compare-label">保存錄音 · ${key.endsWith(':followup')?'追問':'回答'}</p><audio controls src="${url}" aria-label="回聽保存錄音"></audio>`);
        card.insertAdjacentHTML('beforeend',`<div class="ai-feedback"><div class="section-title"><h3>GPT 回饋</h3><button class="btn small" data-action="ai-feedback" data-id="${E(q.id)}">${a.aiFeedback?'重新檢視回饋':'生成回饋'}</button></div>${a.aiFeedback?feedbackHTML(a.aiFeedback):'<p class="feedback-note">尚未生成。會將本題、回答及程式交給 GPT 分析。</p>'}${a.retakeText?`<button class="btn small soft" data-action="ai-compare" data-id="${E(q.id)}">分析重答差異</button>${a.aiComparison?comparisonHTML(a.aiComparison):''}`:''}</div>`);
      });
    }
  }
  function feedbackHTML(r) { const d=r.data;return `<p>${E(d.summary)}</p><h4>回答中做得好的地方</h4>${d.strengths.map(x=>`<p><b>${E(x.point)}</b></p><blockquote>${E(x.evidence)}</blockquote>`).join('')}<h4>可以改善的地方</h4>${d.improvements.map(x=>`<p><b>${E(x.point)}</b>：${E(x.suggestion)}</p><blockquote>${E(x.evidence)}</blockquote>`).join('')}<p class="feedback-note">未評估：${d.unassessed.map(E).join('、')||'無額外項目'}</p><small>${E(r.meta?.model)} · ${E(r.meta?.generatedAt)} · 程式未實際執行</small>`; }
  function comparisonHTML(r) {return `<h4>GPT 重答比較</h4><p>${E(r.data.summary)}</p>${r.data.changes.map(x=>`<p><b>${E(x.point)}</b><br>原先：${E(x.before)}<br>重答：${E(x.after)}</p>`).join('')}<p>仍可補充：${r.data.remaining.map(E).join('、')||'無額外項目'}</p>`;}
  async function settings() {
    await refresh();
    h.modal('資料、GPT 與交接',`<div class="dialog-body"><h3>${health?.configured?'GPT 金鑰已設定':'GPT 尚未設定'}</h3><p>版本 2.0.0 · ${E(health?.textModel||'尚未連到後端')}<br>示範模式隨時可用。AI 模式需要由管理者設定後端金鑰。</p><label class="field"><span>網站存取碼（不是 OpenAI 金鑰）</span><input id="access-token" type="password" autocomplete="off" placeholder="若管理者有設定才需填入"><small>只存於本次頁面，不會加入備份。</small></label><button class="btn small" data-action="save-access">套用存取碼</button><div class="divider"></div><h3>完整資料移轉</h3><p>包含履歷、題庫、進行中練習、所有歷史、GPT 回饋、重答與保存錄音。備份含個人資料，請妥善保存。金鑰與網站存取碼不包含在內。</p><div class="toolbar"><button class="btn primary" data-action="backup-export">下載完整備份</button><button class="btn" data-action="backup-import">還原完整備份</button></div><input type="file" id="backup-file" accept=".json,application/json" hidden><p class="feedback-note">文字最多 3 MB、錄音總量 50 MB。還原前會驗證完整性並下載目前資料的復原副本。跨裝置仍需自行移交備份檔。</p><div class="divider"></div><button class="btn danger" data-action="clear-data">清除本機資料</button></div>`,`<div class="dialog-actions"><button class="btn" data-action="close-dialog">完成</button></div>`);
  }
  async function exportBackup() { await disconnect();await h.stopMic();await audioWrites; const backup=await createBackup(h.getState(),await listRecordings());h.download(JSON.stringify(backup),'preplab-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');return backup; }
  async function restore(file) {
    if(file.size>MAX_BACKUP_BYTES)throw Error('備份檔案超過 80 MB。');
    const parsed=await parseBackup(await file.text()),x=parsed.summary;
    h.modal('確認還原完整備份',`<div class="dialog-body"><p>將還原 ${x.questions} 題、${x.sessions} 場紀錄、${x.recordings} 段錄音${x.active?'，以及一場進行中的練習':''}，並取代目前瀏覽器的資料。</p><p>確認後會先下載目前資料的復原備份。${parsed.legacy?'此為舊版資料，沒有包含錄音。':''}</p></div>`,`<div class="dialog-actions"><button class="btn" data-action="close-dialog">取消</button><button id="restore-confirm" class="btn primary">備份目前資料並還原</button></div>`);
    $('#restore-confirm').onclick=()=>task(async()=>{
      await exportBackup();await audioWrites;
      const previous=await listRecordings(),previousState=localStorage.getItem('preplab.v1');
      await replaceRecordings(parsed.recordings);
      try {localStorage.setItem('preplab.v1',JSON.stringify(parsed.state));}catch(e){await replaceRecordings(previous);if(previousState!==null)localStorage.setItem('preplab.v1',previousState);throw Error('儲存空間不足，已還原原有資料。');}
      h.setState(parsed.state);await loadAudio();h.closeDialog();h.go('dashboard');h.toast('完整備份已還原，可以繼續練習');
    });
  }
  document.addEventListener('change',e=>{if(e.target.id==='backup-file'&&e.target.files[0])task(()=>restore(e.target.files[0]));});
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;
    if(busy&&action!=='close-dialog'){e.preventDefault();e.stopImmediatePropagation();h.toast('正在處理，請稍候。');return;}
    if(voice?.busy&&['next','followup','finish-early','confirm-finish','mic'].includes(action)){e.preventDefault();e.stopImmediatePropagation();h.toast('請先結束語音回答並等待文字紀錄完成，或斷開語音。');return;}
    const custom=['settings','save-access','backup-export','backup-import','ai-feedback','ai-compare','voice-connect','voice-record','voice-play','voice-close'];
    if(action==='followup'&&h.current()?.mode==='ai')custom.push('followup');
    if(!custom.includes(action)) {if(['next','pause','confirm-finish','confirm-clear','tour-start'].includes(action))disconnect();return;}
    e.preventDefault();e.stopImmediatePropagation();
    if(action==='voice-record'){if(voice?.recording)voice.stop();else voice?.start(h.draft().followupShown?'followup':'main');return;}
    if(action==='voice-close'){disconnect();return;}
    if(action==='voice-play'){voice?.play()?.catch(()=>h.toast('無法播放聲音，請重新連線。'));return;}
    if(action==='backup-import'){$('#backup-file').click();return;}
    task(async()=>{
      if(action==='settings'){await settings();return;}
      if(action==='save-access'){setAccessToken($('#access-token').value);await settings();h.toast(hasAccessToken()?'存取碼已套用':'已清除存取碼');return;}
      if(action==='backup-export'){await exportBackup();h.toast('完整備份已下載');return;}
      if(action==='followup'){
        const s=h.current(),q=h.question(),d=h.draft();if(s.paused||d.followupShown)return;if(!d.text.trim())throw Error('請先輸入回答重點。');
        disconnect();const r=await interviewRequest({action:'followup',profile:s.profile,question:q,answer:d},`${s.id}:${q.id}`);
        if(h.current()?.id!==s.id||h.question()?.id!==q.id)return;
        d.followupShown=true;d.followupPrompt=r.data.followup;d.followupMeta=r.meta;h.save();h.render();return;
      }
      if(action==='ai-feedback'||action==='ai-compare'){
        const s=h.selectedReport(),q=s.questions.find(q=>q.id===id),a=s.answers.find(a=>a.questionId===id);if(!a)return;
        const r=await interviewRequest({action:action==='ai-feedback'?'feedback':'compare',profile:s.profile,question:q,answer:action==='ai-feedback'?a:{text:a.retakeText,code:a.retakeCode,followupText:''},...(action==='ai-compare'?{previousAnswer:a}:{})},`${s.id}:${id}`);
        a[action==='ai-feedback'?'aiFeedback':'aiComparison']=r;h.save();h.render();return;
      }
      if(action==='voice-connect'){
        const s=h.current(),q=h.question(),d=h.draft();if(!s||s.paused)return;await disconnect();await h.stopMic();
        const valid=()=>h.current()?.id===s.id&&h.question()?.id===q.id;
        voice=new InterviewVoice({onState:value=>{voiceStatus=value;paintVoice();},onError:message=>h.toast(message),onTranscript:(text,slot)=>{if(!valid())return;const field=slot==='main'?'text':'followupText';d[field]=[d[field],text].filter(Boolean).join('\n');h.save();const el=$(slot==='main'?'#answer':'#followup-answer');if(el)el.value=d[field];},onFollowup:prompt=>{if(!valid()||d.followupShown||!prompt.trim())return;d.followupShown=true;d.followupPrompt=prompt;h.save();h.render();},onRecording:(blob,slot)=>saveAudio(blob,{sessionId:s.id,questionId:q.id,slot})});
        await voice.connect({profile:s.profile,question:q,followupPrompt:d.followupShown?d.followupPrompt:''});
      }
    });
  },true);
  window.addEventListener('hashchange',()=>{if(location.hash!=='#room')disconnect();});
  window.addEventListener('beforeunload',()=>disconnect());
  async function ready(){await refresh();try{await loadAudio();}catch(e){h.toast(e.message);}h.render();}
  return {afterRender,start,task,ready,disconnect,saveAudio,loadAudio,deleteSessionRecordings,clearRecordings,waitAudio:()=>audioWrites,isBusy:()=>busy||!!voice?.busy};
}
