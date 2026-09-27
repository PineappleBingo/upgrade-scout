#!/usr/bin/env node
// sources-watch — 레지스트리의 소스를 실행마다 다시 받아 지난 스냅샷과 비교한다(새 항목·바뀐 항목·사라진 항목·경보).
//   node sources-watch.mjs --registry jev|plugins|<path> (팩 이름 또는 코어 레지스트리) [--only a,b] [--state-dir d] [--update] [--no-write]
//                          [--offline --fixtures dir] [--since 2026-09-20] [--format json|md]
// 원칙: 받지 못한 것은 "확인 불가"(unavailable)이지 "변화 없음"이 아니다. 목록 파서가 갑자기 0건이면 parse-suspect.
// 스냅샷은 --update일 때만 쓴다(계획 모드·no-write에서는 절대 쓰지 않음).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested, nowIso } from './lib/cli.mjs';
import { httpRequest, isOffline, setOffline } from './lib/net.mjs';
import { PARSERS, parseDelimited } from './lib/parsers.mjs';
import { sha256, canonicalJson, stripHtml } from './lib/text.mjs';
import { lsRemote } from './link-check.mjs';

const HELP = `sources-watch.mjs --registry jev|plugins|<path> (팩 이름 또는 코어 레지스트리) [--only ids] [--state-dir d] [--update] [--no-write] [--offline --fixtures d] [--since YYYY-MM-DD] [--format md]
상태: ok · baseline(첫 실행) · unavailable(받지 못함 — 변화 없음이 아님) · parse-suspect(0건) · skipped(오프라인).`;

const here = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(here, '..');

export function registryPath(ref) {
  if (/[\\/]|\.json$/.test(ref)) return ref;
  const inPack = path.join(SKILL_DIR, 'packs', ref, 'registry.json');
  return fs.existsSync(inPack) ? inPack : path.join(SKILL_DIR, 'assets', 'registry', `${ref}.json`);
}

export function loadRegistry(ref) {
  const file = registryPath(ref);
  const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(reg.sources)) throw new Error(`${file}: sources 배열이 없습니다`);
  const ids = new Set();
  for (const s of reg.sources) {
    if (!s.id || !s.url || !s.method) throw new Error(`${file}: 소스에 id·url·method가 필요합니다 (${JSON.stringify(s).slice(0, 80)})`);
    if (ids.has(s.id)) throw new Error(`${file}: 소스 id 중복 ${s.id}`);
    ids.add(s.id);
    if (!['page-hash', 'git-head', ...Object.keys(PARSERS)].includes(s.method)) throw new Error(`${s.id}: 알 수 없는 method ${s.method}`);
  }
  return { file, reg };
}

/** 소스 본문 → 비교 가능한 항목 목록 [{ key, sig, label, date? }] */
export function toItems(method, body, source = {}) {
  if (method === 'page-hash') {
    const text = stripHtml(String(body).replace(/\r\n/g, '\n'));
    return [{ key: 'page', sig: sha256(text).slice(0, 16), label: `${text.length}자` }];
  }
  if (method === 'git-head') return [{ key: 'HEAD', sig: String(body).slice(0, 40), label: String(body).slice(0, 7) }];
  if (method === 'csv' || method === 'tsv') {
    const rows = parseDelimited(String(body), { delimiter: method === 'tsv' ? '\t' : ',', idColumn: source.id_column });
    return rows.map((r) => ({ key: r.id, sig: sha256(canonicalJson(r.fields)).slice(0, 16), label: r.title, date: r.date }));
  }
  const parsed = PARSERS[method](String(body).replace(/\r\n/g, '\n'));
  if (method === 'npm' || method === 'pypi') return parsed.latest ? [{ key: 'latest', sig: parsed.latest, label: parsed.latest, date: parsed.time }] : [];
  if (method === 'sitemap') return parsed.map((p) => ({ key: p.loc, sig: p.lastmod || '', label: p.loc.replace(/^https?:\/\/[^/]+/, ''), date: p.lastmod }));
  if (method === 'catalog-json') return parsed.map((e) => ({ key: e.id, sig: sha256(canonicalJson({ u: e.url, s: e.summary, l: e.link_status, p: e.patterns, q: e.question_types })).slice(0, 16), label: e.title, date: e.first_seen }));
  if (method === 'html-numbered-list') return parsed.map((e) => ({ key: `${e.n}`, sig: sha256(`${e.name}|${e.url}`).slice(0, 16), label: `#${e.n} ${e.name}`, url: e.url }));
  if (method === 'marketplace-json') return parsed.map((e) => ({ key: e.name, sig: sha256(`${e.version}|${e.source}|${e.description}`).slice(0, 16), label: `${e.name}${e.version ? '@' + e.version : ''}` }));
  return parsed.map((e) => ({ key: e.url, sig: sha256(e.title || '').slice(0, 12), label: e.title }));
}

/** 이전 스냅샷과 비교. 스냅샷이 없으면 baseline(전부 "새 항목"으로 세지 않는다). */
export function diffItems(prev, items, { since } = {}) {
  if (!prev) {
    const recent = since ? items.filter((i) => i.date && i.date.slice(0, 10) >= since) : [];
    return { baseline: true, counts: { total: items.length, new: 0, changed: 0, removed: 0, recent: recent.length }, new: [], changed: [], removed: [], recent: recent.map((i) => i.label) };
  }
  const before = new Map(prev.items.map((i) => [i.key, i]));
  const after = new Map(items.map((i) => [i.key, i]));
  const added = items.filter((i) => !before.has(i.key));
  const changed = items.filter((i) => before.has(i.key) && before.get(i.key).sig !== i.sig);
  const removed = prev.items.filter((i) => !after.has(i.key));
  return { baseline: false, counts: { total: items.length, new: added.length, changed: changed.length, removed: removed.length }, new: added.map((i) => i.label), changed: changed.map((i) => i.label), removed: removed.map((i) => i.label) };
}

/** 페이지 본문에 대한 경보 — { id, re, expect } : expect=true면 없을 때, false면 있을 때 울린다. */
export function checkAlerts(body, alerts = []) {
  const text = String(body);
  const out = [];
  for (const a of alerts) {
    const hit = new RegExp(a.re, a.flags || 'i').test(text);
    if (a.expect === true && !hit) out.push({ id: a.id, note: a.note || `기대한 문구가 사라짐: /${a.re}/` });
    if (a.expect !== true && hit) out.push({ id: a.id, note: a.note || `새 문구 감지: /${a.re}/` });
  }
  return out;
}

function snapPath(stateDir, registryId, sourceId) {
  return path.join(stateDir, 'sources', registryId, `${sourceId}.json`);
}

async function fetchSource(s, { fixtures }) {
  if (fixtures) {
    const cand = fs.readdirSync(fixtures).find((f) => f.startsWith(`${s.id}.`));
    if (!cand) return { status: 0, body: '', note: '픽스처 없음' };
    return { status: 200, body: fs.readFileSync(path.join(fixtures, cand), 'utf8') };
  }
  if (s.method === 'git-head') {
    const r = await lsRemote(s.url.replace(/\.git$/, ''));
    return r.status === 'ok' ? { status: 200, body: r.head || '' } : { status: 0, body: '', note: r.error || r.note };
  }
  const r = await httpRequest(s.url, { timeoutMs: 30000, headers: { accept: s.method === 'catalog-json' || s.method === 'npm' || s.method === 'pypi' ? 'application/json' : '*/*' } });
  return { status: r.status, body: r.body, note: r.error };
}

export async function watch(registryRef, { only, stateDir, update = false, noWrite = false, fixtures, since, now } = {}) {
  const { reg } = loadRegistry(registryRef);
  const regId = reg.id || path.basename(String(registryRef), '.json');
  const sel = only ? reg.sources.filter((s) => only.includes(s.id)) : reg.sources;
  const results = [];
  for (const s of sel) {
    const row = { id: s.id, tier: s.tier || null, method: s.method, url: s.url };
    if (isOffline() && !fixtures) { results.push({ ...row, status: 'skipped', note: '오프라인' }); continue; }
    const got = await fetchSource(s, { fixtures });
    row.http = got.status;
    if (got.status !== 200) {
      results.push({ ...row, status: 'unavailable', note: got.status === 403 ? '403 — 차단(확인 불가, 변화 없음 아님)' : got.note || `HTTP ${got.status}` });
      continue;
    }
    let items;
    try { items = toItems(s.method, got.body, s); } catch (e) { results.push({ ...row, status: 'parse-suspect', note: `파싱 실패: ${e.message}` }); continue; }
    const sp = stateDir ? snapPath(stateDir, regId, s.id) : null;
    let prev = sp && fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null;
    // 레지스트리에서 방법·URL을 바꾸면 옛 스냅샷과는 비교할 수 없다 — 새 기준선으로 본다.
    let reset = null;
    if (prev && ((prev.method && prev.method !== s.method) || (prev.url && prev.url !== s.url))) { reset = '방법·URL이 바뀌어 새 기준선'; prev = null; }
    const listy = !['page-hash', 'git-head', 'npm', 'pypi'].includes(s.method);
    if (listy && items.length === 0) {
      results.push({ ...row, status: 'parse-suspect', note: prev ? `이전 ${prev.items.length}건 → 0건` : '0건 — 페이지 구조가 바뀌었는지 확인' });
      continue;
    }
    const d = diffItems(prev, items, { since });
    const alerts = checkAlerts(got.body, s.alerts);
    if ((s.method === 'npm' || s.method === 'pypi') && s.pinned && items[0] && items[0].sig !== s.pinned) alerts.push({ id: 'version', note: `고정값 ${s.pinned} → 현재 ${items[0].sig}` });
    results.push({ ...row, status: d.baseline ? 'baseline' : 'ok', ...d, alerts, ...(reset ? { note: reset } : {}) });
    if (update && !noWrite && sp) {
      fs.mkdirSync(path.dirname(sp), { recursive: true });
      fs.writeFileSync(sp, JSON.stringify({ id: s.id, method: s.method, url: s.url, at: now, items }, null, 1));
    }
  }
  const tally = (st) => results.filter((r) => r.status === st).length;
  return { as_of: now, registry: regId, pinned: reg.pinned || null, summary: { sources: results.length, ok: tally('ok'), baseline: tally('baseline'), unavailable: tally('unavailable'), parse_suspect: tally('parse-suspect'), skipped: tally('skipped'), alerts: results.reduce((a, r) => a + (r.alerts?.length || 0), 0) }, sources: results };
}

export function toMarkdown(res) {
  const rows = res.sources.map((r) => [r.id, r.tier || '-', r.status, r.counts ? `${r.counts.total} (새 ${r.counts.new} · 바뀜 ${r.counts.changed} · 사라짐 ${r.counts.removed})` : '-', (r.alerts || []).map((a) => a.note).join('; ') || r.note || '']);
  return [`# sources-watch — ${res.registry} · ${res.as_of}`, '', mdTable(['소스', '등급', '상태', '항목', '경보·비고'], rows)].join('\n');
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2), { bool: ['update', 'no-write', 'offline', 'help', 'h'] });
  if (helpRequested(flags) || !flags.registry) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (flags.offline) setOffline(true);
  const stateDir = flags['state-dir'] || process.env.SCOUT_STATE || path.join(os.homedir(), '.cache', 'upgrade-scout');
  let res;
  try {
    res = await watch(flags.registry, { only: flags.only ? String(flags.only).split(',') : null, stateDir, update: Boolean(flags.update), noWrite: Boolean(flags['no-write']), fixtures: flags.fixtures || null, since: flags.since || null, now: nowIso(flags) });
  } catch (e) { fail(e.message, EXIT.PRECONDITION); }
  if (flags.format === 'md') emit(toMarkdown(res), 'md'); else emit(res);
  process.exit(res.summary.alerts || res.summary.parse_suspect ? EXIT.FINDINGS : EXIT.OK);
}
