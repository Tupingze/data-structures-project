/** Versioned, portable backups. Validation never silently truncates or drops data. */
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
export const MAX_STATE_BYTES = 3 * 1024 * 1024;
export const MAX_RECORDINGS = 2000;
const MAX_DEPTH = 40;
const badNames = new Set(['__proto__', 'prototype', 'constructor']);
const secretNames = new Set(['apikey', 'openaiapikey', 'accesstoken', 'appaccesstoken', 'authorization', 'clientsecret', 'secretkey', 'bearertoken']);
const fail = (message) => { throw new Error(message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = (value) => new TextEncoder().encode(value).byteLength;

function inspectJSON(value, depth = 0, seen = new Set()) {
  if (depth > MAX_DEPTH) fail('備份資料巢狀層級過深。');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') fail('備份只能包含可保存的 JSON 資料。');
  if (seen.has(value)) fail('備份資料包含循環參照。');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) fail('備份包含不支援的物件。');
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (badNames.has(key)) fail('備份包含不安全的欄位名稱。');
    if (secretNames.has(key.replace(/[-_\s]/g, '').toLowerCase())) fail('備份中不可包含 API 金鑰或登入憑證。請先移除機密設定。');
    inspectJSON(value[key], depth + 1, seen);
  }
  seen.delete(value);
}

function text(value, field, max = 30000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${field}格式不正確或過長。`);
}
function identifier(value, field) {
  text(value, field, 200, true);
  if (badNames.has(value) || /[\u0000-\u001f]/.test(value)) fail(`${field}含不支援的識別字。`);
}
function date(value, field) {
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value))) fail(`${field}日期格式不正確。`);
}
function profile(value) {
  if (!isObject(value)) fail('面試背景格式不正確。');
  for (const key of ['name', 'role', 'difficulty', 'resume', 'jd']) {
    if (value[key] !== undefined) text(value[key], `面試背景 ${key}`, key === 'resume' || key === 'jd' ? 30000 : 300);
  }
  if (value.count !== undefined && (!Number.isInteger(value.count) || value.count < 1 || value.count > 100)) fail('練習題數格式不正確。');
}
function question(value) {
  if (!isObject(value)) fail('題目格式不正確。');
  identifier(value.id, '題目編號');
  for (const key of ['title', 'category', 'level', 'prompt', 'code', 'followup', 'hint']) text(value[key], `題目 ${key}`, key === 'code' ? 50000 : 30000, key === 'title' || key === 'prompt');
  if (!['基礎', '進階'].includes(value.level)) fail('題目難度格式不正確。');
  if (!Array.isArray(value.checks) || value.checks.length > 100) fail('題目提示規則格式不正確。');
  for (const check of value.checks) {
    if (!isObject(check)) fail('題目提示規則格式不正確。');
    text(check.label, '提示名稱', 500);
    if (!Array.isArray(check.keywords) || check.keywords.length > 100) fail('提示字詞格式不正確。');
    check.keywords.forEach((keyword) => text(keyword, '提示字詞', 1000));
  }
}
/** Shared import validation. Return the original object without dropping extensions. */
export function validateQuestion(value) {
  inspectJSON(value);
  question(value);
  return value;
}
function questionList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail('題庫必須包含 1–100 題。');
  const ids = new Set();
  for (const q of value) { question(q); if (ids.has(q.id)) fail('同一題庫內的題目編號不能重複。'); ids.add(q.id); }
  return ids;
}
function aiList(value, label, fields = null) {
  if (!Array.isArray(value) || value.length > 100) fail(`${label}格式不正確。`);
  for (const item of value) {
    if (!fields) { text(item, label); continue; }
    if (!isObject(item)) fail(`${label}項目格式不正確。`);
    for (const field of fields) text(item[field], `${label} ${field}`, 100000);
  }
}
function aiResult(value, comparison) {
  const label = comparison ? 'AI 重答比較' : 'AI 回饋';
  if (!isObject(value) || !isObject(value.data) || !isObject(value.meta)) fail(`${label}格式不正確。`);
  text(value.data.summary, `${label}摘要`);
  text(value.meta.model, `${label}模型`, 200, true);
  if (value.meta.promptVersion !== undefined) text(value.meta.promptVersion, `${label}提示詞版本`, 200);
  if (value.meta.generatedAt !== undefined) date(value.meta.generatedAt, `${label}建立`);
  if (value.meta.usage !== undefined && value.meta.usage !== null) {
    if (!isObject(value.meta.usage)) fail(`${label}用量格式不正確。`);
    for (const key of ['input_tokens', 'output_tokens', 'total_tokens']) {
      const count = value.meta.usage[key];
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) fail(`${label}用量格式不正確。`);
    }
  }
  if (comparison) {
    aiList(value.data.changes, `${label}變化`, ['point', 'before', 'after']);
    aiList(value.data.remaining, `${label}待改善項目`);
  } else {
    aiList(value.data.strengths, `${label}優點`, ['point', 'evidence']);
    aiList(value.data.improvements, `${label}建議`, ['point', 'evidence', 'suggestion']);
    aiList(value.data.unassessed, `${label}未評估項目`);
  }
}
function answer(value) {
  if (!isObject(value)) fail('回答格式不正確。');
  for (const key of ['text', 'code', 'followupText', 'followupPrompt', 'retakeText', 'retakeCode']) {
    if (value[key] !== undefined) text(value[key], `回答 ${key}`, 100000);
  }
  if (value.followupShown !== undefined && typeof value.followupShown !== 'boolean') fail('追問狀態格式不正確。');
  // Null denotes no result. A present result must support every report renderer field.
  if (value.aiFeedback != null) aiResult(value.aiFeedback, false);
  if (value.aiComparison != null) aiResult(value.aiComparison, true);
}
function session(value, active) {
  if (!isObject(value)) fail('面試紀錄格式不正確。');
  identifier(value.id, '面試編號');
  profile(value.profile);
  date(value.startedAt, '面試開始');
  if (value.finishedAt !== undefined) date(value.finishedAt, '面試完成');
  if (!active && !value.finishedAt) fail('已完成紀錄缺少完成時間。');
  const ids = questionList(value.questions);
  if (!Number.isInteger(value.index) || value.index < 0 || value.index >= value.questions.length) fail('面試題目進度格式不正確。');
  if (value.elapsed !== undefined && (!Number.isFinite(value.elapsed) || value.elapsed < 0)) fail('面試計時格式不正確。');
  if (value.paused !== undefined && typeof value.paused !== 'boolean') fail('面試暫停狀態格式不正確。');
  if (!Array.isArray(value.answers) || value.answers.length > value.questions.length) fail('面試回答數量不正確。');
  const answered = new Set();
  for (const a of value.answers) {
    answer(a);
    if (!ids.has(a.questionId) || answered.has(a.questionId)) fail('回答對應的題目不存在或重複。');
    answered.add(a.questionId);
  }
  if (!isObject(value.drafts)) fail('回答草稿格式不正確。');
  for (const [id, draft] of Object.entries(value.drafts)) {
    if (!ids.has(id)) fail('草稿對應的題目不存在。');
    answer(draft);
  }
  return ids;
}

export function validateState(state) {
  inspectJSON(state);
  if (!isObject(state)) fail('備份缺少應用程式資料。');
  if (bytes(JSON.stringify(state)) > MAX_STATE_BYTES) fail('文字資料超過 3 MB，無法安全還原到瀏覽器。請先分別匯出舊紀錄。');
  profile(state.profile);
  questionList(state.questions);
  if (!Array.isArray(state.history) || state.history.length > 500) fail('歷史紀錄最多可還原 500 場。');
  const sessions = new Map();
  for (const entry of state.history) {
    if (sessions.has(entry.id)) fail('面試編號重複。');
    sessions.set(entry.id, session(entry, false));
  }
  if (state.active !== null) {
    if (sessions.has(state.active?.id)) fail('進行中的面試編號與歷史紀錄重複。');
    const ids = session(state.active, true);
    sessions.set(state.active.id, ids);
  }
  return sessions;
}

/** Stable key order makes integrity verification independent of JSON formatting. */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
}
async function checksum(value) {
  if (!globalThis.crypto?.subtle) fail('此瀏覽器無法驗證備份。請使用 HTTPS 或 localhost 開啟網站。');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(value)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function toBase64(buffer) {
  const data = new Uint8Array(buffer);
  let result = '';
  for (let offset = 0; offset < data.length; offset += 32768) result += String.fromCharCode(...data.subarray(offset, offset + 32768));
  return btoa(result);
}
function fromBase64(value, expected) {
  if (typeof value !== 'string' || value.length !== Math.ceil(expected / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('錄音編碼不正確。');
  let raw;
  try { raw = atob(value); } catch { fail('錄音編碼不正確。'); }
  if (raw.length !== expected) fail('錄音大小與內容不符。');
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function validateRecording(record) {
  if (!isObject(record)) fail('錄音資料格式不正確。');
  identifier(record.id, '錄音編號');
  identifier(record.sessionId, '錄音面試編號');
  identifier(record.questionId, '錄音題目編號');
  date(record.createdAt, '錄音建立');
  if (!(record.blob instanceof Blob)) fail('錄音缺少二進位內容。');
  if (record.blob.size > MAX_AUDIO_BYTES) fail('單一錄音超過 50 MB。');
  if (record.blob.type && !/^audio\/[a-z0-9.+-]+(?:;[^\r\n]*)?$/i.test(record.blob.type)) fail('只支援音訊格式的錄音。');
  const { blob, ...metadata } = record;
  inspectJSON(metadata);
  return record;
}
export function validateRecordings(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDINGS) fail('錄音數量超過 2000 筆。');
  let total = 0;
  const ids = new Set();
  for (const record of records) {
    validateRecording(record);
    if (ids.has(record.id)) fail('錄音編號重複。');
    ids.add(record.id);
    total += record.blob.size;
    if (total > MAX_AUDIO_BYTES) fail('錄音總量超過 50 MB。請先匯出備份並整理舊紀錄。');
  }
  return total;
}
function validateReferences(records, sessions) {
  for (const r of records) if (!sessions.get(r.sessionId)?.has(r.questionId)) fail('錄音對應的面試或題目不存在，無法無損還原。');
}

export async function createBackup(state, recordings = []) {
  const sessions = validateState(state);
  validateRecordings(recordings);
  validateReferences(recordings, sessions);
  const packed = [];
  for (const { blob, ...metadata } of recordings) packed.push({ ...metadata, mimeType: blob.type, size: blob.size, encoding: 'base64', data: toBase64(await blob.arrayBuffer()) });
  const payload = { app: 'PrepLab', formatVersion: BACKUP_FORMAT_VERSION, appVersion: '2.0.0', exportedAt: new Date().toISOString(), state: JSON.parse(JSON.stringify(state)), recordings: packed };
  const result = { ...payload, checksum: { algorithm: 'SHA-256', value: await checksum(payload) } };
  if (bytes(JSON.stringify(result)) > MAX_BACKUP_BYTES) fail('完整備份超過 80 MB。');
  return result;
}

/** Validates everything before returning. Callers must not overwrite stores before this resolves. */
export async function parseBackup(input) {
  let data;
  if (typeof input === 'string') {
    if (bytes(input) > MAX_BACKUP_BYTES) fail('備份檔案超過 80 MB。');
    try { data = JSON.parse(input); } catch { fail('備份不是有效的 JSON 檔案。'); }
  } else {
    inspectJSON(input);
    if (bytes(JSON.stringify(input)) > MAX_BACKUP_BYTES) fail('備份檔案超過 80 MB。');
    data = JSON.parse(JSON.stringify(input));
  }
  inspectJSON(data);
  if (!isObject(data)) fail('備份格式不正確。');
  if (!Object.hasOwn(data, 'app') && Object.hasOwn(data, 'profile') && Object.hasOwn(data, 'questions') && Object.hasOwn(data, 'history')) {
    validateState(data);
    return { state: data, recordings: [], legacy: true, summary: { questions: data.questions.length, sessions: data.history.length, active: Boolean(data.active), recordings: 0, audioBytes: 0 } };
  }
  if (data.app !== 'PrepLab') fail('這不是 PrepLab 完整備份。');
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) fail('備份版本不支援，請使用對應或更新版本的 PrepLab 還原。');
  date(data.exportedAt, '備份匯出');
  const { checksum: saved, ...payload } = data;
  if (!isObject(saved) || saved.algorithm !== 'SHA-256' || typeof saved.value !== 'string' || !/^[a-f0-9]{64}$/.test(saved.value)) fail('備份缺少有效的完整性檢查碼。');
  if (await checksum(payload) !== saved.value) fail('備份完整性檢查失敗，檔案可能受損或遭到修改。');
  const sessions = validateState(data.state);
  if (!Array.isArray(data.recordings) || data.recordings.length > MAX_RECORDINGS) fail('錄音清單格式或數量不正確。');
  const recordings = [];
  let total = 0;
  for (const r of data.recordings) {
    if (!isObject(r) || r.encoding !== 'base64' || !Number.isInteger(r.size) || r.size < 0 || r.size > MAX_AUDIO_BYTES || typeof r.mimeType !== 'string') fail('錄音格式不正確。');
    total += r.size;
    if (total > MAX_AUDIO_BYTES) fail('錄音總量超過 50 MB。');
    const { data: base64, encoding, size, mimeType, ...metadata } = r;
    const blob = new Blob([fromBase64(base64, size)], { type: mimeType });
    if (blob.type !== mimeType) fail('錄音 MIME 類型格式不正確。');
    recordings.push({ ...metadata, blob });
  }
  validateRecordings(recordings);
  validateReferences(recordings, sessions);
  return { state: data.state, recordings, legacy: false, summary: { questions: data.state.questions.length, sessions: data.state.history.length, active: Boolean(data.state.active), recordings: recordings.length, audioBytes: total } };
}
