import { MAX_AUDIO_BYTES, MAX_RECORDINGS, validateRecording, validateRecordings } from './portability.js';

const DB_NAME = 'preplab.audio.v1';
const STORE = 'recordings';
let databasePromise;
function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('瀏覽器不支援錄音保存；請使用支援 IndexedDB 的瀏覽器。'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onerror = () => { databasePromise = null; reject(new Error('無法開啟錄音儲存空間。')); };
    request.onblocked = () => { databasePromise = null; reject(new Error('請關閉其他 PrepLab 分頁後再試。')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
  });
  return databasePromise;
}
async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    let reason;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => {};
    tx.onabort = () => reject(reason || new Error(tx.error?.name === 'QuotaExceededError' ? '錄音保存空間不足；資料未寫入，請先匯出備份。' : '錄音保存失敗；原有資料未變更。'));
    try {
      operation(tx.objectStore(STORE), (value) => { result = value; }, (error) => { reason = error; tx.abort(); });
    } catch (error) { reason = error; tx.abort(); }
  });
}

export async function putRecording(input) {
  const record = { ...input, createdAt: input.createdAt ?? new Date().toISOString() };
  validateRecording(record);
  return transaction('readwrite', (store, done, abort) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const remaining = request.result.filter((r) => r.id !== record.id);
      if (remaining.length >= MAX_RECORDINGS || remaining.reduce((sum, r) => sum + r.blob.size, 0) + record.blob.size > MAX_AUDIO_BYTES) {
        abort(new Error('錄音總量超過 50 MB 或 2000 筆；請先匯出備份並整理舊紀錄。'));
        return;
      }
      store.put(record);
      done(record);
    };
  });
}
export async function getRecording(id) {
  return transaction('readonly', (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result ?? null);
  });
}
export async function listRecordings() {
  return transaction('readonly', (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done(request.result);
  });
}
/** A single IndexedDB transaction: quota/error abort restores the entire previous store. */
export async function replaceRecordings(records) {
  validateRecordings(records);
  return transaction('readwrite', (store, done) => {
    store.clear();
    for (const record of records) store.put(record);
    done(records.length);
  });
}
export async function deleteSessionRecordings(sessionId) {
  return transaction('readwrite', (store, done) => {
    let deleted = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(deleted); return; }
      if (cursor.value.sessionId === sessionId) { cursor.delete(); deleted++; }
      cursor.continue();
    };
  });
}
export async function clearRecordings() {
  return transaction('readwrite', (store) => { store.clear(); });
}
