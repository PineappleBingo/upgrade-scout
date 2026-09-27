#!/usr/bin/env node
// history — 실행 기록을 덧붙이기만 하는 해시 사슬로 남긴다. 다음 실행이 “지난번과 무엇이 달라졌나”를 볼 수 있게.
//   node history.mjs append --record run.json [--state-dir d] [--no-write]
//   node history.mjs show [--target name] [--state-dir d]
//   node history.mjs diff [--target name] [--last 2]
//   node history.mjs verify [--state-dir d]
// 기록은 고치지 않는다. 사슬이 깨져 있으면 append를 거부한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, helpRequested, nowIso } from './lib/cli.mjs';
import { canonicalJson, sha256 } from './lib/text.mjs';

const HELP = `history.mjs append --record r.json | show [--target t] | diff [--target t] [--last 2] | verify   [--state-dir d]`;
const SCHEMA = 'upgrade-scout/history@1';

export function load(file) {
  if (!fs.existsSync(file)) return { schema: SCHEMA, records: [] };
  const h = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (h.schema !== SCHEMA) throw new Error(`알 수 없는 기록 형식 ${h.schema}`);
  return h;
}

const hashOf = (r) => sha256(canonicalJson({ ...r, hash: undefined }));

export function verify(h) {
  let prev = null;
  for (const [i, r] of h.records.entries()) {
    if (r.prev_hash !== prev) return { ok: false, at: i, why: 'prev_hash 불일치' };
    if (r.hash !== hashOf(r)) return { ok: false, at: i, why: '기록 내용이 바뀜' };
    prev = r.hash;
  }
  return { ok: true, count: h.records.length };
}

const REQUIRED = ['target', 'vars', 'top5'];

export function append(h, rec, at) {
  const v = verify(h);
  if (!v.ok) throw new Error(`사슬이 깨져 있어 덧붙이지 않습니다 (#${v.at}: ${v.why})`);
  for (const k of REQUIRED) if (!(k in rec)) throw new Error(`기록에 ${k}가 필요합니다`);
  const prev = h.records.at(-1)?.hash || null;
  const r = { at, ...rec, prev_hash: prev };
  r.hash = hashOf(r);
  return { ...h, records: [...h.records, r] };
}

export function diff(records) {
  if (records.length < 2) return { note: '비교할 이전 기록이 없다' };
  const [a, b] = records.slice(-2);
  const ids = (r) => (r.top5 || []).map((t) => t.id || t);
  const setA = new Set(ids(a)), setB = new Set(ids(b));
  const cnt = (r, k) => r[k] || {};
  const delta = (x, y) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [k, (y[k] || 0) - (x[k] || 0)]));
  return {
    from: a.at, to: b.at,
    top5_added: [...setB].filter((x) => !setA.has(x)), top5_dropped: [...setA].filter((x) => !setB.has(x)),
    jev_verdicts: delta(cnt(a, 'jev_verdicts'), cnt(b, 'jev_verdicts')), plugin_verdicts: delta(cnt(a, 'plugin_verdicts'), cnt(b, 'plugin_verdicts')),
    registry: delta(cnt(a, 'registry_counts'), cnt(b, 'registry_counts')),
    meta: { spawned: [a.run_meta?.spawned ?? null, b.run_meta?.spawned ?? null], failed: [a.run_meta?.failed ?? null, b.run_meta?.failed ?? null] },
  };
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2), { bool: ['no-write', 'help', 'h'] });
  const [cmd] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  const dir = flags['state-dir'] || process.env.SCOUT_STATE || path.join(os.homedir(), '.cache', 'upgrade-scout');
  const file = path.join(dir, 'history.json');
  try {
    const h = load(file);
    if (cmd === 'verify') { const v = verify(h); emit(v); process.exit(v.ok ? EXIT.OK : EXIT.FINDINGS); }
    const recs = flags.target ? h.records.filter((r) => r.target === flags.target) : h.records;
    if (cmd === 'show') emit({ file, count: recs.length, records: recs.map((r) => ({ at: r.at, target: r.target, depth: r.vars?.DEPTH, top5: (r.top5 || []).map((t) => t.id || t), hash: r.hash.slice(0, 12) })) });
    else if (cmd === 'diff') emit(diff(recs.slice(-(Number(flags.last) || 2))));
    else if (cmd === 'append') {
      if (!flags.record) fail('--record r.json이 필요합니다');
      const next = append(h, JSON.parse(fs.readFileSync(flags.record, 'utf8')), nowIso(flags));
      if (!flags['no-write']) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(next, null, 1) + '\n'); }
      emit({ file, count: next.records.length, hash: next.records.at(-1).hash.slice(0, 12), written: !flags['no-write'] });
    } else fail(`알 수 없는 명령: ${cmd}`);
  } catch (e) { fail(e.message, EXIT.PRECONDITION); }
}
