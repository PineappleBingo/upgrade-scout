// 네트워크 도우미 — fetch 우선, 프록시 환경에서 fetch가 실패하면 GET만 curl로 폴백한다.
// 오프라인 모드(`--offline` 또는 UPGRADE_SCOUT_OFFLINE=1)에서는 어떤 요청도 보내지 않는다.
import { spawnSync } from 'node:child_process';

export class OfflineError extends Error {
  constructor(url) { super(`오프라인 모드라 요청하지 않았습니다: ${url}`); this.name = 'OfflineError'; }
}

export function isOffline() {
  return process.env.UPGRADE_SCOUT_OFFLINE === '1';
}

export function setOffline(on) {
  if (on) process.env.UPGRADE_SCOUT_OFFLINE = '1';
}

const UA = 'upgrade-scout/2.0 (+https://github.com/PineappleBingo/claude-sync-kit)';

/**
 * HTTP 요청. 반환 { ok, status, headers, body }. 네트워크 실패는 status 0으로 돌려주고 throw하지 않는다
 * (호출자가 "확인 불가"로 기록해야 하므로). 오프라인이면 OfflineError를 던진다.
 */
export async function httpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 20000, fetchImpl } = {}) {
  // 주입한 fetch는 실제 네트워크가 아니므로(테스트·카세트) 오프라인 가드를 적용하지 않는다.
  if (isOffline() && !fetchImpl) throw new OfflineError(url);
  const f = fetchImpl || globalThis.fetch;
  const hdrs = { 'user-agent': UA, ...headers };
  try {
    const res = await f(url, { method, headers: hdrs, body, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    const h = {};
    res.headers?.forEach?.((v, k) => { h[k] = v; });
    return { ok: res.ok, status: res.status, headers: h, body: text };
  } catch (err) {
    if (method === 'GET' && !fetchImpl && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
      const r = curlGet(url, { headers: hdrs, timeoutMs });
      if (r) return r;
    }
    return { ok: false, status: 0, headers: {}, body: '', error: String(err?.cause?.code || err?.message || err) };
  }
}

function curlGet(url, { headers, timeoutMs }) {
  const args = ['-sS', '-L', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-w', '\n__STATUS__%{http_code}'];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url);
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  const idx = r.stdout.lastIndexOf('\n__STATUS__');
  if (idx < 0) return null;
  const status = Number(r.stdout.slice(idx + 11));
  return { ok: status >= 200 && status < 300, status, headers: {}, body: r.stdout.slice(0, idx), via: 'curl' };
}

/** `git ls-remote <url> HEAD` — GitHub API가 막힌 환경에서도 공개 리포의 존재·HEAD를 확인한다. */
export function gitHead(repoUrl, { timeoutMs = 20000 } = {}) {
  if (isOffline()) throw new OfflineError(repoUrl);
  const r = spawnSync('git', ['ls-remote', repoUrl, 'HEAD'], { encoding: 'utf8', timeout: timeoutMs });
  if (r.status !== 0) return { ok: false, error: (r.stderr || '').trim().slice(0, 200) };
  const sha = (r.stdout.split(/\s+/)[0] || '').trim();
  return { ok: /^[0-9a-f]{40}$/.test(sha), sha };
}
