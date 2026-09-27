#!/usr/bin/env node
// score-table — 합계·등급·판정은 스크립트가 계산한다(LLM이 합계를 쓰지 않는다).
//   node score-table.mjs <items.json|ledger.json> [--weights 40,30,30] [--format json|md|html] [--top 20]
//                        [--mode synergy|<팩 이름>] [--criteria <기준표.json>]
// synergy: 입력 { items: [{ id, label, source?, fit, cost, risk, lang?, grade?, caps?, blind?, jev? }] } — 0–10, 높을수록 좋음.
// --mode <팩>: 그 팩의 provides.scorer 기준표(예: packs/jev/criteria.json)로 item[spec.field]의 축 점수를 가중 합 0–100.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { listPacks } from './lib/packs.mjs';

const HELP = `score-table.mjs <items.json> [--weights 40,30,30] [--mode synergy|<팩>] [--criteria c.json] [--format json|md|html] [--top N]
synergy: (0.4·적합 + 0.3·비용 + 0.3·리스크) × 언어 계수(lang, 기본 1). 상한: 강제 제약 위반 → 3, 주장만 있는 근거 → 6.
--mode <팩>(예: jev): 팩 기준표의 축별 점수 가중 합 0–100. 관문은 기준표 순서대로(예: J1=0 → reject, J3=0 → code). 밴드는 기준표 bands.
--criteria: 팩 없이 기준표 파일을 직접 준다.`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');
export const DEFAULT_JEV_CRITERIA = path.join(SKILL_DIR, 'packs', 'jev', 'criteria.json');

export function loadCriteria(file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(spec.criteria) || !spec.criteria.length) throw new Error(`${file}: criteria 배열이 필요합니다`);
  const sum = spec.criteria.reduce((a, c) => a + c.weight, 0);
  if (sum !== 100) throw new Error(`${file}: 가중치 합이 100이어야 합니다(받은 값 ${sum})`);
  if (!Array.isArray(spec.scale) || spec.scale.length < 2) throw new Error(`${file}: scale이 필요합니다`);
  if (!spec.field) throw new Error(`${file}: field가 필요합니다`);
  if (!spec.bands || typeof spec.bands.high !== 'number' || typeof spec.bands.mid !== 'number') throw new Error(`${file}: bands.high·mid가 필요합니다`);
  return spec;
}

export function criteriaScore(scores, spec) {
  const top = Math.max(...spec.scale);
  let sum = 0;
  for (const c of spec.criteria) {
    const v = scores?.[c.id];
    if (!spec.scale.includes(v)) throw new Error(`${c.id}는 ${spec.scale.join(', ')} 중 하나여야 합니다 (받은 값 ${v})`);
    sum += c.weight * (v / top);
  }
  const total = Math.round(sum * 10) / 10;
  const gate = spec.criteria.find((c) => c.gate && scores[c.id] === 0);
  const verdict = gate ? gate.gate : total >= spec.bands.high ? 'high' : total >= spec.bands.mid ? 'mid' : 'low';
  return { total, verdict };
}

// 호환(v3.0): Jev 기준표를 기본으로 쓰는 이름들.
let jevSpec = null;
const jev = () => (jevSpec ??= loadCriteria(DEFAULT_JEV_CRITERIA));
export const J_CRITERIA = fs.existsSync(DEFAULT_JEV_CRITERIA) ? jev().criteria : [];
export const jevScore = (j) => criteriaScore(j, jev());

export function synergy(item, weights = [40, 30, 30]) {
  const [wf, wc, wr] = weights.map((w) => w / 100);
  for (const k of ['fit', 'cost', 'risk']) {
    const v = item[k];
    if (typeof v !== 'number' || v < 0 || v > 10) throw new Error(`${item.id}: ${k}는 0–10 숫자여야 합니다 (받은 값 ${v})`);
  }
  let total = +(wf * item.fit + wc * item.cost + wr * item.risk).toFixed(2);
  const caps = [];
  if (item.lang !== undefined && item.lang !== null) {
    if (typeof item.lang !== 'number' || !(item.lang > 0 && item.lang <= 1)) throw new Error(`${item.id}: lang(언어 계수)은 0 초과 1 이하 숫자여야 합니다 (받은 값 ${item.lang})`);
    if (item.lang < 1) { total = +(total * item.lang).toFixed(2); caps.push(`언어 계수 ×${item.lang}`); }
  }
  if ((item.caps || []).includes('hard-constraint')) { total = Math.min(total, 3); caps.push('강제 제약 위반 → 3'); }
  if ((item.caps || []).includes('claims-only') || item.grade === 'C') { total = Math.min(total, 6); caps.push('주장만 있는 근거 → 6'); }
  let blindDiff = null;
  if (item.blind) blindDiff = Math.max(...['fit', 'cost', 'risk'].map((k) => Math.abs((item.blind[k] ?? item[k]) - item[k])));
  return { total, caps, blindDiff, recheck: blindDiff !== null && blindDiff >= 2 };
}

export function scoreItems(items, { weights = [40, 30, 30], mode = 'synergy', spec = null } = {}) {
  if (mode === 'jev') { mode = 'criteria'; spec = spec || jev(); } // v3.0 호출 호환
  const rows = items.map((it) => {
    if (mode === 'criteria') return { ...it, ...criteriaScore(it[spec.field], spec) };
    const s = synergy(it, weights);
    const adv = it.jev && typeof it.jev.score === 'number' ? { advisory: it.jev.score * 2.5, confidence: it.jev.confidence ?? null } : null;
    return { ...it, ...s, jevAdvisory: adv ? adv.advisory : null, jevNote: adv ? null : (it.jev?.skipped || '미실행') };
  });
  rows.sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id)));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function toMarkdown(rows, mode, spec = null) {
  if (mode === 'criteria') {
    return mdTable(['순위', 'id', '판단 지점', ...spec.criteria.map((c) => c.id), '합계', '판정'],
      rows.map((r) => [r.rank, r.id, r.label, ...spec.criteria.map((c) => r[spec.field][c.id]), r.total, r.verdict]));
  }
  return mdTable(['순위', 'id', '항목', '적합', '비용', '리스크', '시너지', '상한', '블라인드 차', '보조 점수'],
    rows.map((r) => [r.rank, r.id, r.label, r.fit, r.cost, r.risk, r.total, r.caps.join('; ') || '-', r.blindDiff ?? '-', r.jevAdvisory ?? `—(${r.jevNote})`]));
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 순위 막대 HTML 조각 — assets/report.html의 .rank 스타일. 색만으로 뜻을 전하지 않도록 값을 글자로 병기한다. */
export function toHtml(rows, mode, top = 20, spec = null) {
  const crit = mode === 'criteria';
  const max = crit ? 100 : 10;
  const body = rows.slice(0, top).map((r) => {
    const pct = Math.max(0, Math.min(100, (r.total / max) * 100)).toFixed(0);
    const band = crit ? (r.verdict === 'high' ? 'hi' : r.verdict === 'mid' ? '' : 'lo') : (r.total >= 8 ? 'hi' : r.total < 6.5 ? 'lo' : '');
    const src = r.source ? `<span class="chip src">${esc(r.source)}</span>` : '';
    const tag = crit ? ` <span class="chip">${esc(r.verdict)}</span>` : '';
    return `  <div class="row ${band}"><span class="lbl">${src}<span>${esc(r.label)}</span>${tag}</span><div class="track"><i style="width:${pct}%"></i></div><span class="v">${crit ? r.total.toFixed(0) : r.total.toFixed(1)}</span></div>`;
  }).join('\n');
  const label = crit ? (spec?.label_ko || '기준표 점수(0–100)') : '시너지 점수(0–10)';
  return `<div class="rank" role="img" aria-label="${esc(label)} 상위 ${Math.min(top, rows.length)}개">\n${body}\n</div>`;
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  if (helpRequested(flags) || !_[0]) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  let input;
  try { input = JSON.parse(fs.readFileSync(_[0], 'utf8')); } catch (e) { fail(`입력을 읽을 수 없습니다: ${e.message}`, EXIT.PRECONDITION); }
  const items = Array.isArray(input) ? input : input.items;
  if (!Array.isArray(items)) fail('items 배열이 필요합니다', EXIT.PRECONDITION);
  const weights = flags.weights ? String(flags.weights).split(',').map(Number) : [40, 30, 30];
  if (weights.length !== 3 || weights.reduce((a, b) => a + b, 0) !== 100) fail('--weights는 합이 100인 세 수여야 합니다');
  let critFile = flags.criteria ? String(flags.criteria) : null;
  if (!critFile && flags.mode && flags.mode !== 'synergy') {
    const pack = listPacks(SKILL_DIR).find((p) => p.name === String(flags.mode));
    if (!pack?.criteria) fail(`--mode ${flags.mode}: 채점 기준표(provides.scorer)를 주는 팩이 없습니다`);
    critFile = path.join(pack.dir, pack.criteria);
  }
  const mode = critFile ? 'criteria' : 'synergy';
  let spec = null;
  let rows;
  try {
    if (critFile) spec = loadCriteria(critFile);
    rows = scoreItems(items, { weights, mode, spec });
  } catch (e) { fail(e.message, EXIT.PRECONDITION); }
  const fmt = flags.format || 'json';
  if (fmt === 'md') emit(toMarkdown(rows, mode, spec), 'md');
  else if (fmt === 'html') emit(toHtml(rows, mode, Number(flags.top) || 20, spec), 'md');
  else emit({ mode, criteria: spec ? spec.id : null, weights: spec ? spec.criteria.map((c) => [c.id, c.weight]) : weights, rows });
}
