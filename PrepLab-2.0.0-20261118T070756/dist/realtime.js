import { apiRequest } from './ai-client.js';

/** Native speech-to-speech transport; app owns question count, slots and persistence. */
export class InterviewVoice {
  constructor({ onState = () => {}, onTranscript = () => {}, onFollowup = () => {}, onRecording = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { onState, onTranscript, onFollowup, onRecording, onError });
    this.pc = null; this.channel = null; this.stream = null; this.audio = null;
    this.recording = false; this.closed = true; this.pending = false; this.purpose = null;
    this.items = new Map(); this.pendingSlot = null; this.recorder = null;
    this.generation = 0; this.recordingDone = Promise.resolve();
  }
  setState(value) { this.status = value; this.onState(value); }
  get busy() { return this.recording || this.pending; }
  send(event) {
    if (this.channel?.readyState !== 'open') throw new Error('語音連線尚未就緒。');
    this.channel.send(JSON.stringify(event));
  }
  async connect({ profile, question, followupPrompt = '' }) {
    const previous = this.close(), generation = ++this.generation;
    await previous;
    if (generation !== this.generation) return;
    this.closed = false; this.setState('connecting');
    const valid = () => !this.closed && generation === this.generation;
    const signal = this.controller = new AbortController();
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('此瀏覽器不支援即時語音，請改用文字模式。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!valid()) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; stream.getAudioTracks().forEach(t => t.enabled = false);
      const token = await apiRequest('/api/realtime-token', { requestId: crypto.randomUUID(), profile, question }, { timeout: 30000, signal: signal.signal });
      if (!valid()) return;
      const pc = this.pc = new RTCPeerConnection(), audio = this.audio = new Audio(); audio.autoplay = true;
      pc.ontrack = event => {
        if (valid()) { audio.srcObject = event.streams[0]; audio.play().catch(() => { if (valid()) this.onError('瀏覽器暫停了播放，請按「播放語音」啟用聲音。'); }); }
      };
      pc.onconnectionstatechange = () => {
        if (valid() && ['failed', 'disconnected'].includes(pc.connectionState)) this.fail(new Error('語音連線中斷，已保留文字。請重新連線或使用文字作答。'));
      };
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const channel = this.channel = pc.createDataChannel('oai-events');
      channel.onmessage = event => { if (!valid()) return; try { this.handle(JSON.parse(event.data)); } catch (e) { this.fail(e); } };
      const opened = new Promise((resolve, reject) => {
        channel.onopen = resolve; channel.onerror = () => reject(new Error('無法建立語音資料通道。'));
        channel.onclose = () => reject(new Error('語音資料通道已關閉。'));
        signal.signal.addEventListener('abort', () => reject(new Error('語音連線已取消。')), { once: true });
      });
      // A cancellation can reject this while SDP negotiation is still awaiting fetch.
      opened.catch(() => {});
      const offer = await pc.createOffer(); if (!valid()) return;
      await pc.setLocalDescription(offer); if (!valid()) return;
      const timer = setTimeout(() => signal.abort(), 25000);
      try {
        const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp,
          headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' }, signal: signal.signal });
        if (!response.ok) throw new Error(`語音模型連線失敗（${response.status}），請確認帳戶權限與模型設定。`);
        const sdp = await response.text(); if (!valid()) return;
        await pc.setRemoteDescription({ type: 'answer', sdp }); await opened;
      } finally { clearTimeout(timer); }
      if (!valid()) return;
      this.purpose = 'question'; this.pending = true; this.responseDone = this.transcriptPending = false;
      this.watchTurn();
      this.send({ type: 'response.create', response: { output_modalities: ['audio'], instructions: `請只用繁體中文口語讀出以下面試問題，不要回答、評論或另外出題：\n${followupPrompt || question.prompt}` } });
      this.setState('speaking');
    } catch (error) { if (valid()) this.fail(error); }
  }
  watchTurn() {
    clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.fail(new Error('語音回合等待過久，請確認回答文字，並重新連線或改用文字。')), 45000);
  }
  handle(event) {
    if (this.closed) return;
    if (event.type === 'error') { this.fail(new Error(event.error?.message || '語音服務發生錯誤，請重連。')); return; }
    if (event.type === 'input_audio_buffer.committed' && this.pendingSlot) this.items.set(event.item_id, this.pendingSlot);
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const slot = this.items.get(event.item_id) || this.pendingSlot;
      if (slot) this.onTranscript(event.transcript || '', slot);
      this.items.delete(event.item_id); this.pendingSlot = null;
      this.transcriptPending = false; this.settle();
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      this.transcriptPending = false; this.pendingSlot = null;
      this.onError('這段語音未能轉成文字，請在回答欄補上重點後再提交。'); this.settle();
    }
    if (event.type === 'response.output_audio_transcript.done' && this.purpose === 'followup') {
      this.onFollowup(event.transcript || '');
    }
    if (event.type === 'response.done') {
      this.responseDone = true;
      if (event.response?.status === 'failed') this.onError('語音回答生成失敗。請改用文字追問或重新連線。');
      this.settle();
    }
  }
  settle() {
    if (!this.responseDone || this.transcriptPending) return;
    clearTimeout(this.turnTimer); this.pending = false; this.purpose = null; this.responseDone = false;
    this.setState('ready');
  }
  start(slot = 'main') {
    if (this.closed || this.busy || this.channel?.readyState !== 'open') return;
    let release;
    const done = new Promise(resolve => { release = resolve; });
    // Register before MediaRecorder starts, so even an immediate close awaits final data.
    this.recordingDone = Promise.all([this.recordingDone, done]).then(() => undefined);
    try {
      this.slot = slot; this.pendingSlot = slot; this.responseDone = false; this.transcriptPending = false;
      this.send({ type: 'input_audio_buffer.clear' }); this.stream.getAudioTracks().forEach(t => t.enabled = true);
      this.recording = true; this.startedAt = Date.now(); this.setState('listening');
      if (window.MediaRecorder) {
        const chunks = [], recorder = this.recorder = new MediaRecorder(this.stream);
        let finished = false;
        const finish = this.finishRecorder = async () => {
          if (finished) return; finished = true;
          try { if (chunks.length) await this.onRecording(new Blob(chunks, { type: recorder.mimeType }), slot); }
          catch (error) { this.onError(error.message || '錄音保存失敗，請確認儲存空間。'); }
          finally { if (this.recorder === recorder) { this.recorder = null; this.finishRecorder = null; } release(); }
        };
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = finish;
        recorder.onerror = () => this.fail(new Error('錄音發生錯誤，已停止收音。請改用文字或重新連線。'));
        recorder.start();
      } else release();
      this.recordTimer = setTimeout(() => this.stop(), 180000);
    } catch (error) { release(); this.fail(error); }
  }
  stopRecorder() {
    try { if (this.recorder?.state === 'recording') this.recorder.stop(); }
    catch { this.finishRecorder?.(); }
  }
  stop() {
    if (!this.recording) return;
    clearTimeout(this.recordTimer); this.stream?.getAudioTracks().forEach(t => t.enabled = false);
    this.stopRecorder();
    this.recording = false;
    try {
    if (Date.now() - this.startedAt < 500) { this.pendingSlot = null; this.send({ type: 'input_audio_buffer.clear' }); this.setState('ready'); return; }
    this.pending = true; this.transcriptPending = true; this.responseDone = false;
    this.purpose = this.slot === 'main' ? 'followup' : 'acknowledge';
    this.send({ type: 'input_audio_buffer.commit' });
    this.send({ type: 'response.create', response: { output_modalities: ['audio'], instructions: this.purpose === 'followup'
      ? '針對使用者剛才的回答，提出恰好一個簡短且具體的面試追問。不要替使用者作答，不要給評分，不要換下一題。'
      : '使用者已完成本題的唯一一次追問。只說「收到，你可以確認文字紀錄，再進入下一題。」不要再出題、追問或評分。' } });
    this.setState('processing');
    this.watchTurn();
    } catch (error) { this.fail(error); }
  }
  play() { return this.audio?.play(); }
  fail(error) { this.close(); this.onError(error.message || '語音連線失敗'); }
  close() {
    this.closed = true; this.generation++; clearTimeout(this.recordTimer); clearTimeout(this.turnTimer);
    this.controller?.abort(); this.stopRecorder();
    this.stream?.getTracks().forEach(t => t.stop()); this.channel?.close(); this.pc?.close();
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    this.pc = this.channel = this.stream = this.audio = null; this.pending = this.recording = false;
    this.pendingSlot = null; this.purpose = null; this.responseDone = this.transcriptPending = false;
    this.items.clear(); this.setState('disconnected');
    return this.recordingDone;
  }
}
