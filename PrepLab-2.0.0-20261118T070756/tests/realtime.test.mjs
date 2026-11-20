import test from 'node:test';
import assert from 'node:assert/strict';
import { InterviewVoice } from '../dist/realtime.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const interview = { profile: { role: '工程師' }, question: { id: 'q1', prompt: '說明你的方法。' } };

function runtime(t, { media, sdp, recorderFails = false } = {}) {
  const calls = [], recorders = [], peers = [];
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Channel {
    constructor() { this.readyState = 'connecting'; this.sent = []; }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 'closed'; this.onclose?.(); }
  }
  class Peer {
    constructor() { peers.push(this); this.connectionState = 'new'; }
    addTrack() {}
    createDataChannel() { return this.channel = new Channel(); }
    async createOffer() { return { type: 'offer', sdp: 'mock-offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.channel.readyState = 'open'; this.channel.onopen?.(); }
    close() { this.connectionState = 'closed'; }
  }
  class Recorder {
    constructor() { if (recorderFails) throw new Error('mock recorder unavailable'); this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.stopRequested = true; }
    finish(value = 'saved audio') { this.ondataavailable?.({ data: new Blob([value], { type: this.mimeType }) }); this.onstop?.(); }
  }
  class Audio { play() { return Promise.resolve(); } pause() {} }
  const values = {
    window: { RTCPeerConnection: Peer, MediaRecorder: Recorder },
    navigator: { mediaDevices: { getUserMedia: async () => media ? media.promise : stream } },
    RTCPeerConnection: Peer, MediaRecorder: Recorder, Audio,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/realtime-token') return Response.json({ value: 'mock-ephemeral-token' });
      if (url === 'https://api.openai.com/v1/realtime/calls') return sdp ? sdp(options) : new Response('mock-answer');
      throw new Error('Unexpected mock request');
    },
  };
  for (const [key, value] of Object.entries(values)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  return { calls, recorders, peers, track, stream };
}

async function ready(voice) {
  await voice.connect(interview);
  assert.equal(voice.status, 'speaking');
  voice.handle({ type: 'response.done', response: { status: 'completed' } });
  assert.equal(voice.status, 'ready');
}

test('close immediately stops transport and waits for final audio and asynchronous persistence, including repeated close', async t => {
  const r = runtime(t), persisted = deferred(), saved = [];
  const voice = new InterviewVoice({ onRecording: async (blob, slot) => { saved.push({ text: await blob.text(), slot }); await persisted.promise; } });
  await ready(voice);
  voice.start('main');
  const recorder = r.recorders[0];
  const first = voice.close(), second = voice.close();
  assert.equal(first, second);
  assert.equal(r.track.stopped, true);
  assert.equal(r.peers[0].channel.readyState, 'closed');
  assert.equal(recorder.stopRequested, true);
  let finished = false; first.then(() => { finished = true; });
  await tick(); assert.equal(finished, false);
  recorder.finish();
  await tick(); assert.deepEqual(saved, [{ text: 'saved audio', slot: 'main' }]);
  assert.equal(finished, false);
  persisted.resolve(); await first;
  assert.equal(finished, true);
});

test('close includes audio from stop even when MediaRecorder is already inactive', async t => {
  const r = runtime(t), saved = [];
  const voice = new InterviewVoice({ onRecording: (blob, slot) => saved.push(slot) });
  await ready(voice); voice.start('followup'); voice.startedAt -= 1000; voice.stop();
  const closing = voice.close();
  assert.equal(r.recorders[0].state, 'inactive');
  r.recorders[0].finish(); await closing;
  assert.deepEqual(saved, ['followup']);
});

test('late microphone permission after cancellation releases tracks and never requests a token', async t => {
  const media = deferred(), r = runtime(t, { media });
  const voice = new InterviewVoice();
  const connecting = voice.connect(interview); await tick();
  await voice.close(); media.resolve(r.stream); await connecting;
  assert.equal(r.track.stopped, true);
  assert.equal(r.calls.length, 0);
  assert.equal(voice.status, 'disconnected');
});

test('SDP failure safely handles the unopened channel promise and releases microphone', async t => {
  const r = runtime(t, { sdp: () => new Response('', { status: 503 }) }), errors = [];
  const voice = new InterviewVoice({ onError: message => errors.push(message) });
  await voice.connect(interview); await tick();
  assert.equal(errors.length, 1); assert.match(errors[0], /503/);
  assert.equal(r.track.stopped, true); assert.equal(voice.status, 'disconnected');
});

test('cancellation during SDP fetch settles both connection promises without error notification', async t => {
  const entered = deferred(), errors = [];
  const r = runtime(t, { sdp: options => { entered.resolve(); return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })); } });
  const voice = new InterviewVoice({ onError: message => errors.push(message) });
  const connecting = voice.connect(interview); await entered.promise;
  await voice.close(); await connecting; await tick();
  assert.deepEqual(errors, []); assert.equal(r.track.stopped, true);
});

test('turn remains busy until both response and transcription arrive, regardless of order', async t => {
  const r = runtime(t), transcripts = [], followups = [];
  const voice = new InterviewVoice({ onTranscript: (text, slot) => transcripts.push({ text, slot }), onFollowup: text => followups.push(text) });
  await ready(voice);
  for (const [slot, transcriptFirst] of [['main', false], ['followup', true]]) {
    voice.start(slot); voice.startedAt -= 1000; voice.stop();
    const item = 'item-' + slot;
    voice.handle({ type: 'input_audio_buffer.committed', item_id: item });
    const transcript = { type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript: '中文回答' };
    const response = { type: 'response.done', response: { status: 'completed' } };
    if (slot === 'main') voice.handle({ type: 'response.output_audio_transcript.done', transcript: '你如何驗證？' });
    voice.handle(transcriptFirst ? transcript : response); assert.equal(voice.busy, true);
    voice.handle(transcriptFirst ? response : transcript); assert.equal(voice.busy, false);
    r.recorders.at(-1).finish();
  }
  await voice.close();
  assert.deepEqual(transcripts, [{ text: '中文回答', slot: 'main' }, { text: '中文回答', slot: 'followup' }]);
  assert.deepEqual(followups, ['你如何驗證？']);
});

test('MediaRecorder construction failure releases microphone and does not leave close pending', async t => {
  const r = runtime(t, { recorderFails: true }), errors = [];
  const voice = new InterviewVoice({ onError: message => errors.push(message) });
  await ready(voice); voice.start(); await voice.close();
  assert.equal(r.track.stopped, true); assert.equal(voice.busy, false);
  assert.deepEqual(errors, ['mock recorder unavailable']);
});

test('initial spoken question has a timeout and cannot leave the interview permanently busy', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = runtime(t), errors = [];
  const voice = new InterviewVoice({ onError: message => errors.push(message) });
  await voice.connect(interview);
  assert.equal(voice.busy, true);
  t.mock.timers.tick(45000); await voice.close();
  assert.equal(voice.busy, false); assert.equal(r.track.stopped, true);
  assert.equal(errors.length, 1); assert.match(errors[0], /等待過久/);
});
