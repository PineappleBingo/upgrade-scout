#!/usr/bin/env node
// ledger — 증거 원장. 서브에이전트 답을 계약으로 검사해 합치고, 재확인할 주장을 고르고, 결과를 기록한다.
//   node ledger.mjs validate <role> <reply.txt|json>            답에서 json 블록 하나를 꺼내 계약 검사
//   node ledger.mjs merge <ledger.json> <role>=<reply> …         합치기(주장 C-### 부여 · 증거로 중복 제거 · 충돌 표시)
//   node ledger.mjs pick <ledger.json> [--k 15]                  재확인할 강한 주장 K개
//   node ledger.mjs record <ledger.json> --claim C-003 --cmd "…" --exit 0 --excerpt "…" --verdict refuted --by main [--correction "…"]
//   node ledger.mjs blind <ledger.json>                          블라인드 채점용 항목(메인 점수 없음)
//   node ledger.mjs attach-blind <ledger.json> <scores.json>     블라인드 점수 붙이기(차 ≥2면 재확인 대기열)
//   node ledger.mjs jev-requests <ledger.json> --questions q.json 보조 채점 요청 만들기(영어 요약이 있는 항목만)
//   node ledger.mjs attach-jev <ledger.json> <jev-run.json>      Jev 보조 점수 붙이기(합계는 바꾸지 않음)
//   node ledger.mjs export <ledger.json> [--format md|json|items]
// 원장 파일을 고치는 명령은 --no-write면 결과만 출력한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested, nowIso } from './lib/cli.mjs';
import { extractJsonBlock, sha256, canonicalJson } from './lib/text.mjs';
import { validate as schemaValidate } from './lib/schema.mjs';
import { listPacks } from './lib/packs.mjs';

const HELP = `ledger.mjs validate|merge|pick|record|blind|attach-blind|jev-requests|attach-jev|export …
주장은 C-###, 수리는 F-##. 반박된 주장은 수리 로그로 남기고 딸린 항목은 다시 채점한다.`;

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS = path.resolve(here, '..', 'assets', 'contracts');
const SKILL_DIR = path.resolve(here, '..');
export const ROLE_KEY = { 'target-cartographer': 'map', 'repo-reviewer': 'review', 'web-researcher': 'research', 'capability-analyst': 'capability', 'design-mapper': 'mapping', 'plugin-skill-scout': 'scouting', verifier: 'checks', 'blind-scorer': 'scores', 'report-drafter': 'sections' };
export const ROLE_ALIAS = { 'jev-analyst': 'capability-analyst' };

export function emptyLedger(runId) {
  return { schema: 'upgrade-scout/ledger@1', run_id: runId, claims: [], items: [], conflicts: [], rechecks: [], repair_log: [], queue: [] };
}

/** 답 글에서 json 블록 하나를 꺼내 봉투 + 역할 계약으로 검사한다. Plan 에이전트가 덧붙이는 꼬리 글은 무시한다. */
export function validateReply(roleIn, text) {
  const role = ROLE_ALIAS[roleIn] || roleIn;
  if (!ROLE_KEY[role]) return { ok: false, errors: [`알 수 없는 역할 ${roleIn}`] };
  let data;
  try { data = typeof text === 'string' ? extractJsonBlock(text) : structuredClone(text); } catch (e) { return { ok: false, errors: [e.message] }; }
  if (data && ROLE_ALIAS[data.role]) {
    data.role = ROLE_ALIAS[data.role];
    if (typeof data.contract === 'string') data.contract = data.contract.replace(/^upgrade-scout\/[a-z-]+@/, `upgrade-scout/${data.role}@`);
    if (data.jev && !data.capability) { data.capability = data.jev; delete data.jev; }
  }
  const env = JSON.parse(fs.readFileSync(path.join(CONTRACTS, 'envelope.schema.json'), 'utf8'));
  const own = JSON.parse(fs.readFileSync(path.join(CONTRACTS, `${role}.schema.json`), 'utf8'));
  const errors = [...schemaValidate(env, data), ...schemaValidate(own, data)];
  if (data?.role && data.role !== role) errors.push(`$.role ${data.role} ≠ ${role}`);
  const packName = role === 'capability-analyst' ? data?.capability?.pack : null;
  if (packName) {
    const pack = listPacks(SKILL_DIR).find((p) => p.name === packName);
    if (!pack) errors.push(`$.capability.pack: 팩 ${packName}가 없다`);
    else if (pack.contractExt) {
      const ext = JSON.parse(fs.readFileSync(path.join(pack.dir, pack.contractExt), 'utf8'));
      (data.capability.points || []).forEach((p, i) => {
        if (['NOT_FIT', 'NOT_FOR_JEV'].includes(p.triage)) return;
        errors.push(...schemaValidate(ext, p.pack_scores ?? {}, ext, `$.capability.points[${i}].pack_scores`));
      });
    }
  }
  return { ok: errors.length === 0, errors, data };
}

const evKey = (c) => sha256(canonicalJson({ t: c.text_ko?.trim(), e: (c.evidence || []).map((e) => e.ref || e.url).sort() })).slice(0, 12);
const nextId = (arr, prefix, width) => `${prefix}${String(arr.length + 1).padStart(width, '0')}`;

/** 역할 답들을 원장에 합친다. 같은 문장·같은 근거의 주장은 하나로, 같은 항목에 상반된 상태는 충돌로. */
export function merge(ledger, replies) {
  const L = structuredClone(ledger);
  const byKey = new Map(L.claims.map((c) => [c.key, c]));
  for (const { role, data } of replies) {
    for (const c of data.claims || []) {
      const key = evKey(c);
      if (byKey.has(key)) { byKey.get(key).sources.push(`${role}:${c.id}`); continue; }
      const claim = { id: nextId(L.claims, 'C-', 3), key, role, local_id: c.id, subject: data.subject || null, text_ko: c.text_ko, kind: c.kind, evidence: c.evidence || [], recheck: c.recheck || null, confidence: c.confidence, status: 'open', sources: [`${role}:${c.id}`] };
      L.claims.push(claim);
      byKey.set(key, claim);
    }
    if (role === 'repo-reviewer') {
      for (const it of data.review.items) {
        const prev = L.items.find((x) => x.id === it.id);
        if (prev && prev.status !== it.status) L.conflicts.push({ item: it.id, a: prev.status, b: it.status, note_ko: '같은 항목에 상반된 구현 상태' });
        if (!prev) L.items.push({ id: it.id, label: it.capability_ko, source: data.review.repo.name, fit: it.fit, cost: it.cost, risk: it.risk, grade: it.status === 'implemented' ? 'A' : it.status === 'claimed-only' ? 'C' : 'B', caps: it.status === 'claimed-only' ? ['claims-only'] : [], summary_en: it.summary_en || null, status: it.status, port_mode: it.port_mode });
      }
    }
    if (role === 'capability-analyst') {
      const cap = data.capability || {};
      for (const p of cap.points || []) {
        if (p.triage === 'NOT_FIT' || p.triage === 'NOT_FOR_JEV' || !p.axes) continue;
        if (L.items.some((x) => x.id === p.id)) continue;
        L.items.push({ id: p.id, label: p.decision_ko, source: `capability:${cap.subject}`, fit: p.axes.fit, cost: p.axes.cost, risk: p.axes.risk, grade: 'B', caps: [], ...(typeof p.lang === 'number' ? { lang: p.lang } : {}), summary_en: null, status: 'proposed' });
      }
    }
    if (role === 'design-mapper') {
      const m = data.mapping || {};
      for (const p of m.missing_pieces || []) {
        if (L.items.some((x) => x.id === p.id)) continue;
        L.items.push({ id: p.id, label: p.title_ko, source: `design:${m.source?.title || m.source?.ref || '?'}`, fit: p.fit, cost: p.cost, risk: p.risk, grade: 'B', caps: [], summary_en: null, status: 'proposed' });
      }
    }
    if (role === 'target-cartographer') {
      for (const p of data.map?.agents?.principles || []) {
        if (!['partial', 'missing'].includes(p.verdict) || !p.fix) continue;
        const id = `AA-${p.key}`;
        if (L.items.some((x) => x.id === id)) continue;
        L.items.push({ id, label: p.fix.title_ko, source: 'agent-architecture', fit: p.fix.fit, cost: p.fix.cost, risk: p.fix.risk, grade: 'B', caps: [], summary_en: null, status: 'proposed' });
      }
    }
  }
  return L;
}

/** 재확인할 주장 K개 — 없음·숫자·라이선스 주장, 상위 항목·충돌에 딸린 주장, 낮은 확신 순. */
export function pick(ledger, k = 15) {
  const top = new Set([...ledger.items].sort((a, b) => (b.fit * 0.4 + b.cost * 0.3 + b.risk * 0.3) - (a.fit * 0.4 + a.cost * 0.3 + a.risk * 0.3)).slice(0, 5).map((i) => i.source));
  const conflicted = new Set(ledger.conflicts.map((c) => c.item));
  const queued = new Set(ledger.queue || []);
  const w = (c) => (['absence', 'number', 'license'].includes(c.kind) ? 3 : 0) + (top.has(c.subject) ? 2 : 0) + (conflicted.has(c.subject) || queued.has(c.subject) ? 2 : 0) + (c.confidence === 'low' ? 2 : c.confidence === 'mid' ? 1 : 0) + (c.evidence.length === 0 ? 2 : 0);
  return ledger.claims.filter((c) => c.status === 'open' && c.kind !== 'opinion').map((c) => ({ id: c.id, weight: w(c), kind: c.kind, text_ko: c.text_ko, recheck: c.recheck })).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, k);
}

/** 재확인 결과 기록. 반박이면 수리 로그 F-##를 남기고 딸린 항목을 다시 채점 대기열에 올린다. */
export function record(ledger, { claim, cmd, exit = null, excerpt = '', verdict, by = 'main', correction = '', at }) {
  const L = structuredClone(ledger);
  const c = L.claims.find((x) => x.id === claim);
  if (!c) throw new Error(`주장 ${claim}이 없다`);
  if (!['confirmed', 'refuted', 'partial', 'unverifiable'].includes(verdict)) throw new Error(`verdict ${verdict}`);
  L.rechecks.push({ claim, cmd, exit, excerpt: String(excerpt).slice(0, 300), verdict, by, at });
  c.status = verdict;
  if (verdict === 'refuted') {
    L.repair_log.push({ id: nextId(L.repair_log, 'F-', 2), claim, original: c.text_ko, correction, evidence: cmd });
    if (c.subject && !L.queue.includes(c.subject)) L.queue.push(c.subject);
  }
  return L;
}

export function blindExport(ledger) {
  return ledger.items.map((i) => ({ item_id: i.id, label: i.label, source: i.source, grade: i.grade, status: i.status, port_mode: i.port_mode, evidence: ledger.claims.filter((c) => c.subject === i.source && c.status !== 'refuted').slice(0, 5).map((c) => ({ kind: c.kind, text_ko: c.text_ko })) }));
}

export function attachBlind(ledger, scores) {
  const L = structuredClone(ledger);
  for (const s of scores) {
    const it = L.items.find((i) => i.id === s.item_id);
    if (!it) continue;
    it.blind = { fit: s.fit, cost: s.cost, risk: s.risk };
    const diff = Math.max(...['fit', 'cost', 'risk'].map((k) => Math.abs(s[k] - it[k])));
    it.blind_diff = diff;
    if (diff >= 2 && !L.queue.includes(it.source)) L.queue.push(it.source);
  }
  return L;
}

/** 보조 채점 요청 — 영어 요약(summary_en)이 있는 항목만. 우리 점수는 state에 넣지 않는다. */
export function jevRequests(ledger, qset) {
  const reqs = [], skipped = [];
  for (const it of ledger.items) {
    if (!it.summary_en) { skipped.push({ item: it.id, reason: '영어 요약 없음' }); continue; }
    reqs.push({ id: it.id, model: qset.model, meta: { questionSet: qset.id, version: qset.version }, state: { target_need: ledger.target_need_en || null, candidate: { name: it.source, capability: it.summary_en, status: it.status, port_mode: it.port_mode } }, questions: qset.questions });
  }
  return { requests: reqs, skipped };
}

/** Jev 결과를 보조 열로 붙인다. 점수(0–4 기대값)×2.5를 메인 합계와 비교해 차 ≥2.5이고 confidence ≥0.6이면 재확인 대기열. */
export function attachJev(ledger, run, { scoreKey = 'fit' } = {}) {
  const L = structuredClone(ledger);
  for (const row of run.rows || []) {
    const it = L.items.find((i) => i.id === row.id);
    if (!it) continue;
    if (row.status !== 'ok' && row.status !== 'cached' && row.status !== 'replayed') { it.jev = { skipped: row.status }; continue; }
    const a = row.answers?.[scoreKey];
    if (!a || typeof a.score !== 'number') { it.jev = { skipped: 'no-score' }; continue; }
    it.jev = { score: a.score, confidence: a.confidence ?? null, advisory: Math.round(a.score * 2.5 * 10) / 10 };
    const main = it.fit;
    if (Math.abs(it.jev.advisory - main) >= 2.5 && (a.confidence ?? 0) >= 0.6 && !L.queue.includes(it.source)) L.queue.push(it.source);
  }
  return L;
}

export function exportMd(ledger) {
  const rc = mdTable(['주장', '명령', '종료', '판정', '누가'], ledger.rechecks.map((r) => [r.claim, r.cmd, r.exit ?? '-', r.verdict, r.by]));
  const fx = mdTable(['수리', '주장', '원래', '고친 것', '근거'], ledger.repair_log.map((f) => [f.id, f.claim, f.original, f.correction, f.evidence]));
  const cf = mdTable(['항목', 'A', 'B', '비고'], ledger.conflicts.map((c) => [c.item, c.a, c.b, c.note_ko]));
  const open = ledger.claims.filter((c) => c.status === 'open').length;
  return [`# 재확인 로그 — ${ledger.run_id}`, '', `주장 ${ledger.claims.length} · 재확인 ${ledger.rechecks.length} · 반박 ${ledger.repair_log.length} · 미확인 ${open}`, '', rc, '', '## 수리 로그', '', fx, '', '## 충돌', '', cf].join('\n');
}

function load(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function save(f, L, noWrite) { if (!noWrite) fs.writeFileSync(f, JSON.stringify(L, null, 1) + '\n'); return L; }

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2), { bool: ['no-write', 'help', 'h'] });
  const [cmd, ...args] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  const nw = Boolean(flags['no-write']);
  try {
    if (cmd === 'validate') {
      const [role, file] = args;
      const r = validateReply(role, fs.readFileSync(file, 'utf8'));
      emit({ ok: r.ok, errors: r.errors });
      process.exit(r.ok ? EXIT.OK : EXIT.FINDINGS);
    }
    const [file, ...rest] = args;
    if (!file) fail('원장 파일 경로가 필요합니다');
    let L = fs.existsSync(file) ? load(file) : emptyLedger(flags['run-id'] || path.basename(file, '.json'));
    if (cmd === 'merge') {
      const replies = [];
      for (const pair of rest) {
        const [role, f] = pair.split('=');
        const v = validateReply(role, fs.readFileSync(f, 'utf8'));
        if (!v.ok) { emit({ ok: false, role, file: f, errors: v.errors }); process.exit(EXIT.FINDINGS); }
        replies.push({ role, data: v.data });
      }
      L = save(file, merge(L, replies), nw);
      emit({ claims: L.claims.length, items: L.items.length, conflicts: L.conflicts.length });
    } else if (cmd === 'pick') emit({ picks: pick(L, Number(flags.k) || 15) });
    else if (cmd === 'record') {
      L = save(file, record(L, { claim: flags.claim, cmd: flags.cmd, exit: flags.exit !== undefined ? Number(flags.exit) : null, excerpt: flags.excerpt || '', verdict: flags.verdict, by: flags.by || 'main', correction: flags.correction || '', at: nowIso(flags) }), nw);
      emit({ rechecks: L.rechecks.length, repairs: L.repair_log.length, queue: L.queue });
    } else if (cmd === 'blind') emit({ items: blindExport(L) });
    else if (cmd === 'attach-blind') { L = save(file, attachBlind(L, load(rest[0]).scores || load(rest[0])), nw); emit({ queue: L.queue }); }
    else if (cmd === 'jev-requests') { if (!flags.questions) fail('--questions q.json'); emit(jevRequests(L, load(flags.questions))); }
    else if (cmd === 'attach-jev') { L = save(file, attachJev(L, load(rest[0])), nw); emit({ queue: L.queue, jev: L.items.map((i) => ({ id: i.id, jev: i.jev || null })) }); }
    else if (cmd === 'export') {
      if (flags.format === 'md') emit(exportMd(L), 'md');
      else if (flags.format === 'items') emit({ items: L.items });
      else emit(L);
    } else fail(`알 수 없는 명령: ${cmd}`);
  } catch (e) { fail(e.message, EXIT.PRECONDITION); }
}
