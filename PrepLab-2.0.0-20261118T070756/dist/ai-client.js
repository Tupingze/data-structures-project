// Credentials live only in memory. They are never part of a backup or localStorage.
let accessToken = '';
export function setAccessToken(value) { accessToken = String(value || '').trim(); }
export function hasAccessToken() { return Boolean(accessToken); }
export function authHeaders() { return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}; }

export async function requestIdFor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'req-' + [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function apiRequest(path, body, { timeout = 65000, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin', signal: controller.signal,
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('後端沒有回傳可讀取的資料。請確認已啟動完整伺服器。'); }
    if (!response.ok) {
      const fallback = response.status === 401 ? '需要網站存取碼，請在資料與連線設定輸入。'
        : response.status === 503 ? '後端尚未設定 OPENAI_API_KEY。請由管理者完成設定，或選擇示範模式。'
        : response.status === 429 ? '目前使用量已達限制，請稍後重試。' : 'AI 請求失敗，已保留你的回答，請重試。';
      throw new Error(result.error?.message || (typeof result.error === 'string' ? result.error : '') || fallback);
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('連線已取消或等待過久；回答仍已保存，可稍後重試。');
    if (error instanceof TypeError) throw new Error('無法連到後端，請檢查網路與伺服器。回答仍保留在此瀏覽器。');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function fetchHealth() { return apiRequest('/api/health', undefined, { timeout: 10000 }); }
export async function interviewRequest(payload, identity) {
  const requestId = await requestIdFor({ identity, payload });
  return apiRequest('/api/interview', { ...payload, requestId });
}
