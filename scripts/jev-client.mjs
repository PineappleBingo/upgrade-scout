#!/usr/bin/env node
// jev-client — Jev(TypeSafe System One) 요청을 검사·추정·실행·검증한다. 기본은 dry-run(네트워크 없음).
//   node jev-client.mjs lint     <req.json|reqs.jsonl> [--live]
//   node jev-client.mjs dry-run  <req…> | --qset q.json --states s.jsonl
//   node jev-client.mjs run      <req…> --live [--max-requests 20] [--max-input-tokens 300000] [--max-usd 0.02]
//                                [--model jev-1.13.0] [--concurrency 4] [--timeout 25000] [--cache dir] [--cassette dir]
//   node jev-client.mjs replay   <req…> --cassette dir        (기록된 응답으로 키 없이 재현)
//   node jev-client.mjs validate <req.json> <resp.json>
//   node jev-client.mjs health   --live                         (GET /v1/models — 키 상태)
//   node jev-client.mjs cost     --tokens 120000
// 규칙: 키는 출력하지 않는다. 형식이 틀린 응답은 판정으로 세지 않는다(fail-closed). 전송 실패는 부정 답이 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, helpRequested } from './lib/cli.mjs';
import { httpRequest, isOffline } from './lib/net.mjs';
import { canonicalJson, sha256, estimateTokens, hasCJK } from './lib/text.mjs';

const HELP = `jev-client.mjs lint|dry-run|run|replay|validate|health|cost …
dry-run이 기본이다. run은 --live + TYPESAFE_API_KEY + 상한(요청·입력 토큰·달러)이 모두 있어야 한다.`;

export const PRICE_PER_MTOK = 0.042;
export const DEFAULT_MODEL = 'jev-1.13.0';
export const LIMITS = { choiceMax: 255, scoreMin: 2, scoreMax: 10, stateAndLongest: 32000, total: 64000 };
export const TOL = { sum: 0.02, score: 0.05 };
export const UNDECIDED = [0.4, 0.6];
const FORBIDDEN_STATE_KEYS = /^(our_?score|synergy|total|score_main|main_score|fit|cost|risk|verdict|rank|j_?score)$/i;
const NO_MATCH = /^(none|other|unclear|unsupported|no_?match|nomatch|n\/a|not_useful|insufficient|says_nothing|abstain|__no_match__|__review__)$/i;

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/* ─── 요청 읽기 ───────────────────────────────────────── */
export function loadRequests(files, { qset, states } = {}) {
  const reqs = [];
  if (qset) {
    const q = JSON.parse(fs.readFileSync(qset, 'utf8'));
    const lines = fs.readFileSync(states, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    lines.forEach((l, i) => {
      const s = JSON.parse(l);
      reqs.push({ id: s.id || `row-${i + 1}`, model: q.model || DEFAULT_MODEL, state: s.state ?? s, questions: q.questions, meta: { questionSet: q.id || path.basename(qset), version: q.version || null } });
    });
    return reqs;
  }
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const trimmed = text.trim();
    if (f.endsWith('.jsonl')) trimmed.split(/\r?\n/).filter(Boolean).forEach((l) => reqs.push(JSON.parse(l)));
    else {
      const data = JSON.parse(trimmed);
      (Array.isArray(data) ? data : [data]).forEach((r) => reqs.push(r));
    }
  }
  return reqs.map((r, i) => ({ id: r.id || `req-${i + 1}`, ...r }));
}

/* ─── 린트 ───────────────────────────────────────────── */
const WORD = [
  { code: 'L002', re: /\b(how many|count(ing)?|number of|sum of|average|total|percent(age)?|more than \d|less than \d|at least \d|greater than|fewer than|ratio)\b/i, msg: '셈·수 비교 문구 — Jev는 세지 못한다. 코드에서 세고 버킷을 넘긴다' },
  { code: 'L003', re: /\b(before|after|since|until|days? ago|weeks? ago|months? ago|\d{4}-\d{2}-\d{2}|older than|newer than)\b/i, msg: '날짜 비교 문구 — 날짜는 코드에서 비교한다' },
  { code: 'L004', re: /\b(not|never|no)\b[^.?!]*\b(not|never|no|without)\b/i, msg: '이중 부정·간접 표현 — 직접 쓴다' },
  { code: 'L005', re: /\b(and then|which in turn|if .{0,40} then .{0,40} if)\b/i, msg: '다단계 추론 — 질문을 나눈다' },
];

function textOf(v) { return typeof v === 'string' ? v : JSON.stringify(v ?? ''); }

export function lintRequest(req, { live = false } = {}) {
  const issues = [];
  const add = (level, code, qid, msg) => issues.push({ level, code, qid, msg });
  const qs = req.questions || {};
  const ids = Object.keys(qs);
  if (!ids.length) add('error', 'L000', null, '질문이 없다');
  if (!req.state && req.state !== '') add('error', 'L000', null, 'state가 없다');
  if (hasCJK(textOf(req.state))) add(live ? 'error' : 'warn', 'L001', null, 'state에 한글·CJK — 영어 버킷으로 바꾸거나 골든으로 검증한 뒤에만');
  const scanKeys = (o, p = '') => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (FORBIDDEN_STATE_KEYS.test(k)) add('error', 'L011', null, `state에 우리 점수 필드 "${p}${k}" — 보조 채점기가 우리 점수를 보면 독립 의견이 아니다`);
      scanKeys(v, `${p}${k}.`);
    }
  };
  scanKeys(req.state);
  const untrustedKeys = /(readme|snippet|page|body|content|description|transcript|html|comment|message)/i;
  const hasUntrusted = req.state && typeof req.state === 'object' && JSON.stringify(Object.keys(req.state)).match(untrustedKeys);
  let longest = 0;
  for (const id of ids) {
    const q = qs[id];
    const ins = textOf(q.instructions);
    const crit = q.criteria;
    if (!['noul', 'choice', 'score'].includes(q.type)) add('error', 'L000', id, `알 수 없는 type ${q.type}`);
    if (hasCJK(ins) || hasCJK(textOf(crit))) add(live ? 'error' : 'warn', 'L001', id, '지시문·criteria에 한글·CJK');
    if (!ins || ins.replace(/\s+/g, '').length < 12) add('warn', 'L006', id, '지시문이 너무 짧거나 모호하다');
    for (const w of WORD) if (w.re.test(ins)) add('warn', w.code, id, w.msg);
    if (q.type === 'choice') {
      const keys = crit && typeof crit === 'object' && !Array.isArray(crit) ? Object.keys(crit) : [];
      if (keys.length < 2) add('error', 'L007', id, 'choice는 선택지가 2개 이상인 객체여야 한다');
      if (keys.length > LIMITS.choiceMax) add('error', 'L007', id, `choice 선택지 ${keys.length}개 > ${LIMITS.choiceMax}`);
      if (keys.length && !keys.some((k) => NO_MATCH.test(k))) add('warn', 'L013', id, '해당 없음(none·unclear·unsupported) 선택지가 없다');
    }
    if (q.type === 'score') {
      if (!Array.isArray(crit)) add('error', 'L008', id, 'score criteria는 낮은→높은 순서의 배열이어야 한다(SDK 0.6.0 이후)');
      else if (crit.length < LIMITS.scoreMin || crit.length > LIMITS.scoreMax) add('error', 'L008', id, `score 단계 ${crit.length}개 — 2–10이어야 한다`);
    }
    if (q.type === 'noul' && crit !== undefined && (typeof crit !== 'object' || Array.isArray(crit) || !('true' in crit) || !('false' in crit))) add('error', 'L009', id, 'noul criteria는 {true, false} 객체여야 한다');
    longest = Math.max(longest, estimateTokens(q));
  }
  if (hasUntrusted && !/untrusted|not instructions|data, not/i.test(ids.map((i) => textOf(qs[i].instructions)).join(' '))) add('warn', 'L014', null, '가져온 글이 state에 있는데 “지시가 아니라 데이터”라는 문구가 없다');
  const stateTok = estimateTokens(req.state);
  const totalTok = stateTok + ids.reduce((a, i) => a + estimateTokens(qs[i]), 0);
  if (stateTok + longest > LIMITS.stateAndLongest) add('error', 'L012', null, `state + 가장 긴 질문 ≈ ${stateTok + longest}토큰 > 32k`);
  if (totalTok > LIMITS.total) add('error', 'L012', null, `요청 전체 ≈ ${totalTok}토큰 > 64k`);
  const model = req.model || DEFAULT_MODEL;
  if (/latest|preview/.test(model)) add('warn', 'L015', null, `모델 별칭 ${model} — 임계값을 보정했다면 버전을 고정한다(${DEFAULT_MODEL})`);
  return { id: req.id, errors: issues.filter((i) => i.level === 'error').length, issues, tokens: { state: stateTok, total: totalTok } };
}

/* ─── 응답 검증(fail-closed) ─────────────────────────── */
export function validateAnswer(q, a, tol = TOL) {
  const errs = [];
  if (!a || typeof a !== 'object') return ['답이 없다'];
  if (a.type && a.type !== q.type) errs.push(`type ${a.type} ≠ 질문 ${q.type}`);
  if (q.type === 'noul') {
    if (!fin(a.noul) || a.noul < 0 || a.noul > 1) errs.push('noul이 [0,1] 유한수가 아니다');
    return errs;
  }
  const probs = a.probabilities;
  if (!probs || typeof probs !== 'object') return [...errs, 'probabilities가 없다'];
  const pk = Object.keys(probs).sort();
  const vals = Object.values(probs);
  if (!vals.every((p) => fin(p) && p >= 0 && p <= 1)) errs.push('확률이 [0,1] 유한수가 아니다');
  const sum = vals.reduce((s, p) => s + (fin(p) ? p : 0), 0);
  if (Math.abs(sum - 1) > tol.sum) errs.push(`확률 합 ${sum.toFixed(4)} — 1±${tol.sum} 밖`);
  if (a.confidence !== undefined && a.confidence !== null && (!fin(a.confidence) || a.confidence < 0 || a.confidence > 1)) errs.push('confidence가 [0,1] 밖');
  if (q.type === 'choice') {
    const keys = Object.keys(q.criteria || {}).sort();
    if (canonicalJson(pk) !== canonicalJson(keys)) errs.push('확률 키가 선택지 키와 다르다');
    if (!keys.includes(a.choice)) errs.push(`choice "${a.choice}"가 선택지에 없다`);
    const max = Math.max(...vals.filter(fin));
    if (fin(probs[a.choice]) && probs[a.choice] < max - 1e-9) errs.push('choice가 최대 확률 선택지가 아니다');
  }
  if (q.type === 'score') {
    const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
    const want = Array.from({ length: n }, (_, i) => String(i)).sort();
    if (canonicalJson(pk) !== canonicalJson(want)) errs.push(`확률 키가 0..${n - 1}이 아니다`);
    if (a.legend && canonicalJson(Object.keys(a.legend).sort()) !== canonicalJson(want)) errs.push('legend 키가 단계와 다르다');
    if (!fin(a.score) || a.score < 0 || a.score > n - 1) errs.push(`score ${a.score}가 [0, ${n - 1}] 밖`);
    else {
      const ev = Object.entries(probs).reduce((s, [k, p]) => s + Number(k) * (fin(p) ? p : 0), 0);
      if (Math.abs(ev - a.score) > tol.score) errs.push(`score ${a.score}와 확률 기대값 ${ev.toFixed(3)}의 차이 > ${tol.score}`);
    }
  }
  return errs;
}

/** 응답 전체 검증 — 질문 키 집합이 정확히 같아야 하고, 하나라도 틀리면 요청 전체를 판정으로 세지 않는다. */
export function validateResponse(req, resp, tol = TOL) {
  const errors = [];
  const answers = resp?.answers;
  if (!answers || typeof answers !== 'object') return { ok: false, errors: ['answers가 없다'] };
  const want = Object.keys(req.questions).sort();
  const got = Object.keys(answers).sort();
  for (const k of want) if (!got.includes(k)) errors.push(`${k}: 답이 빠졌다`);
  for (const k of got) if (!want.includes(k)) errors.push(`${k}: 묻지 않은 답`);
  const out = {};
  for (const k of want) {
    if (!answers[k]) continue;
    const e = validateAnswer(req.questions[k], answers[k], tol);
    e.forEach((m) => errors.push(`${k}: ${m}`));
    out[k] = { ...answers[k], band: bandOf(req.questions[k], answers[k]) };
  }
  return { ok: errors.length === 0, errors, answers: errors.length ? undefined : out };
}

/** 표시용 대역 — noul 0.4–0.6은 “판단 없음”(읽지 못한 입력에 약 0.5가 나온다는 실측 사례가 있다). */
export function bandOf(q, a) {
  if (q.type === 'noul') return a.noul >= UNDECIDED[0] && a.noul <= UNDECIDED[1] ? 'undecided' : a.noul > UNDECIDED[1] ? 'yes' : 'no';
  if (!fin(a.confidence)) return 'unknown';
  return a.confidence >= 0.9 ? 'act' : a.confidence >= 0.5 ? 'caution' : 'review';
}

export const cacheKey = (req, model) => sha256(canonicalJson({ v: req.meta?.version ?? null, model, state: req.state, questions: req.questions }));
export const costUsd = (tokens) => Math.round((tokens / 1e6) * PRICE_PER_MTOK * 1e8) / 1e8;

/* ─── 실행 ───────────────────────────────────────────── */
function classifyStatus(status) {
  if (status === 401 || status === 403) return { kind: 'auth', retry: false };
  if (status === 400 || status === 404 || status === 422) return { kind: 'usage', retry: false };
  if (status === 429 || status === 408) return { kind: 'retryable', retry: true };
  if (status === 529 || status === 503 || status === 502 || status === 500 || status === 504) return { kind: 'retryable', retry: true };
  if (status === 0) return { kind: 'network', retry: true };
  return { kind: 'other', retry: false };
}

async function callOnce(req, { apiKey, model, baseUrl, fetchImpl, timeoutMs }) {
  const body = JSON.stringify({ model, state: req.state, questions: req.questions });
  const started = Date.now();
  const deadline = started + timeoutMs;
  let attempt = 0;
  for (;;) {
    const left = Math.max(1000, deadline - Date.now());
    const r = await httpRequest(`${baseUrl}/v1/systemone`, { method: 'POST', body, timeoutMs: left, fetchImpl, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' } });
    if (r.status === 200) {
      let json;
      try { json = JSON.parse(r.body); } catch { return { status: 'invalid', kind: 'invalid', errors: ['JSON이 아닌 응답'], latency_ms: Date.now() - started }; }
      return { status: 'ok', json, latency_ms: Date.now() - started, request_id: r.headers?.['x-typesafe-request-id'] || null };
    }
    const c = classifyStatus(r.status);
    attempt += 1;
    if (!c.retry || attempt > 2 || Date.now() >= deadline) return { status: 'error', kind: c.kind, http: r.status, latency_ms: Date.now() - started };
    const ra = Number(r.headers?.['retry-after']);
    const wait = r.status === 429 && Number.isFinite(ra) ? Math.min(ra * 1000, 10000) : 500 * 2 ** (attempt - 1);
    if (Date.now() + wait >= deadline) return { status: 'error', kind: c.kind, http: r.status, latency_ms: Date.now() - started };
    await new Promise((res) => setTimeout(res, wait));
  }
}

/**
 * 요청 묶음을 실행한다. mode: dry-run | live | replay.
 * 예산은 예약→정산: 보내기 전에 추정 토큰을 잡고, 받은 뒤 usage로 정산한다. 상한을 넘으면 budget-skipped 행.
 */
export async function runRequests(reqs, { mode = 'dry-run', apiKey, model: modelOverride, baseUrl = 'https://api.typesafe.ai', fetchImpl, caps = {}, concurrency = 4, timeoutMs = 25000, cacheDir, cassetteDir } = {}) {
  const limit = { requests: caps.requests ?? 20, tokens: caps.tokens ?? 300000, usd: caps.usd ?? 0.02 };
  const spent = { requests: 0, tokens: 0 };
  const rows = new Array(reqs.length);
  let i = 0;
  const work = async () => {
    while (i < reqs.length) {
      const k = i++;
      const req = reqs[k];
      const model = modelOverride || req.model || DEFAULT_MODEL;
      const key = cacheKey(req, model);
      const est = estimateTokens(req.state) + Object.values(req.questions || {}).reduce((a, q) => a + estimateTokens(q), 0);
      const base = { id: req.id, model, cache_key: key.slice(0, 16), est_tokens: est, est_cost_usd: costUsd(est) };
      const lint = lintRequest(req, { live: mode === 'live' });
      if (lint.errors) { rows[k] = { ...base, status: 'rejected', kind: 'lint', errors: lint.issues.filter((x) => x.level === 'error').map((x) => `${x.code} ${x.qid || ''} ${x.msg}`.trim()) }; continue; }
      if (mode === 'dry-run') { rows[k] = { ...base, status: 'dry-run', body: { model, state: req.state, questions: req.questions }, warnings: lint.issues.map((x) => `${x.code} ${x.qid || ''} ${x.msg}`.trim()) }; continue; }
      const cached = cacheDir && fs.existsSync(path.join(cacheDir, `${key}.json`)) ? JSON.parse(fs.readFileSync(path.join(cacheDir, `${key}.json`), 'utf8')) : null;
      const taped = cassetteDir && fs.existsSync(path.join(cassetteDir, `${key}.json`)) ? JSON.parse(fs.readFileSync(path.join(cassetteDir, `${key}.json`), 'utf8')).response : null;
      let json, latency = 0, requestId = null, status = 'ok';
      if (cached) { json = cached; status = 'cached'; }
      else if (mode === 'replay') {
        if (!taped) { rows[k] = { ...base, status: 'error', kind: 'no-cassette' }; continue; }
        json = taped; status = 'replayed';
      } else {
        if (spent.requests + 1 > limit.requests || spent.tokens + est > limit.tokens || costUsd(spent.tokens + est) > limit.usd) { rows[k] = { ...base, status: 'budget-skipped' }; continue; }
        spent.requests += 1; spent.tokens += est;
        const r = await callOnce(req, { apiKey, model, baseUrl, fetchImpl, timeoutMs });
        latency = r.latency_ms; requestId = r.request_id || null;
        if (r.status !== 'ok') { spent.tokens -= est; rows[k] = { ...base, status: r.status === 'invalid' ? 'invalid' : 'error', kind: r.kind, http: r.http, latency_ms: latency, errors: r.errors }; continue; }
        json = r.json;
        const used = Number(json?.usage?.input_tokens);
        if (Number.isFinite(used)) spent.tokens += used - est;
        if (cassetteDir) { fs.mkdirSync(cassetteDir, { recursive: true }); fs.writeFileSync(path.join(cassetteDir, `${key}.json`), JSON.stringify({ request: { model, state: req.state, questions: req.questions }, response: json }, null, 1)); }
      }
      const v = validateResponse(req, json);
      if (!v.ok) { rows[k] = { ...base, status: 'invalid', kind: 'invalid', errors: v.errors, latency_ms: latency }; continue; }
      if (cacheDir && status === 'ok') { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(json)); }
      const used = Number(json?.usage?.input_tokens);
      rows[k] = { ...base, status, served_model: json.model || null, answers: v.answers, usage: json.usage || null, cost_usd: Number.isFinite(used) ? costUsd(used) : null, latency_ms: latency, request_id: requestId };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, reqs.length)) }, work));
  const tally = (s) => rows.filter((r) => r.status === s).length;
  return { mode, caps: limit, spent: { requests: spent.requests, input_tokens: spent.tokens, usd: costUsd(spent.tokens) }, summary: { total: rows.length, ok: tally('ok'), cached: tally('cached'), replayed: tally('replayed'), dry: tally('dry-run'), rejected: tally('rejected'), invalid: tally('invalid'), error: tally('error'), budget_skipped: tally('budget-skipped') }, rows };
}

/* ─── CLI ────────────────────────────────────────────── */
if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2), { bool: ['live', 'help', 'h'] });
  const [cmd, ...files] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  const apiKey = process.env.TYPESAFE_API_KEY || '';
  const baseUrl = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/$/, '');
  if (cmd === 'cost') {
    const t = Number(flags.tokens);
    if (!Number.isFinite(t)) fail('--tokens N이 필요합니다');
    emit({ input_tokens: t, usd: costUsd(t), price_per_mtok: PRICE_PER_MTOK, output: 'free' });
    process.exit(EXIT.OK);
  }
  if (cmd === 'health') {
    if (!flags.live) fail('health는 --live가 필요합니다(네트워크 호출)', EXIT.USAGE);
    if (!apiKey) fail('TYPESAFE_API_KEY가 없습니다 — 환경 설정의 비밀 변수로 넣고 새 세션에서 다시 실행', EXIT.PRECONDITION);
    if (isOffline()) fail('오프라인 모드', EXIT.NETWORK);
    const r = await httpRequest(`${baseUrl}/v1/models`, { headers: { authorization: `Bearer ${apiKey}` } });
    let models = null;
    try { models = JSON.parse(r.body); } catch { /* 본문이 JSON이 아니면 상태만 */ }
    emit({ http: r.status, ok: r.status === 200, models });
    process.exit(r.status === 200 ? EXIT.OK : r.status === 401 || r.status === 403 ? EXIT.PRECONDITION : EXIT.NETWORK);
  }
  if (cmd === 'validate') {
    if (files.length < 2) fail('validate <req.json> <resp.json>');
    const [req] = loadRequests([files[0]]);
    const resp = JSON.parse(fs.readFileSync(files[1], 'utf8'));
    const v = validateResponse(req, resp);
    emit(v);
    process.exit(v.ok ? EXIT.OK : EXIT.FINDINGS);
  }
  let reqs;
  try { reqs = loadRequests(files, { qset: flags.qset, states: flags.states }); } catch (e) { fail(`요청을 읽을 수 없습니다: ${e.message}`, EXIT.PRECONDITION); }
  if (!reqs.length) fail('요청이 없습니다');
  if (cmd === 'lint') {
    const res = reqs.map((r) => lintRequest(r, { live: Boolean(flags.live) }));
    emit({ requests: res.length, errors: res.reduce((a, r) => a + r.errors, 0), results: res });
    process.exit(res.some((r) => r.errors) ? EXIT.FINDINGS : EXIT.OK);
  }
  const common = { model: flags.model, concurrency: Number(flags.concurrency) || 4, timeoutMs: Number(flags.timeout) || 25000, cacheDir: flags.cache || null, cassetteDir: flags.cassette || null };
  if (cmd === 'dry-run') { emit(await runRequests(reqs, { ...common, mode: 'dry-run' })); process.exit(EXIT.OK); }
  if (cmd === 'replay') {
    if (!flags.cassette) fail('replay는 --cassette dir이 필요합니다');
    const res = await runRequests(reqs, { ...common, mode: 'replay' });
    emit(res);
    process.exit(res.summary.invalid || res.summary.error ? EXIT.FINDINGS : EXIT.OK);
  }
  if (cmd === 'run') {
    if (!flags.live) fail('run은 --live가 필요합니다. 먼저 dry-run 결과(요청 수·토큰·비용)를 보여 주고 동의를 받으세요', EXIT.USAGE);
    if (!apiKey) fail('TYPESAFE_API_KEY가 없습니다 — 채팅에 붙여 넣지 말고 환경 설정의 비밀 변수로 넣으세요', EXIT.PRECONDITION);
    if (isOffline()) fail('오프라인 모드', EXIT.NETWORK);
    const caps = { requests: flags['max-requests'] ? Number(flags['max-requests']) : 20, tokens: flags['max-input-tokens'] ? Number(flags['max-input-tokens']) : 300000, usd: flags['max-usd'] ? Number(flags['max-usd']) : 0.02 };
    const res = await runRequests(reqs, { ...common, mode: 'live', apiKey, baseUrl, caps });
    emit(res);
    process.exit(res.summary.invalid || res.summary.error ? EXIT.FINDINGS : EXIT.OK);
  }
  fail(`알 수 없는 명령: ${cmd}`);
}
