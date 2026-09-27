#!/usr/bin/env node
// score-table — 합계·등급·판정은 스크립트가 계산한다(LLM이 합계를 쓰지 않는다).
//   node score-table.mjs <items.json|ledger.json> [--weights 40,30,30] [--format json|md|html] [--top 20] [--mode synergy|jev]
// 입력: { items: [{ id, label, source?, fit, cost, risk, lang?, grade?, caps?, blind?: {fit,cost,risk}, jev?: {...}, j?: {J1..J12} }] }
//   fit·cost·risk는 0–10(높을수록 좋음: cost 10 = 가장 싸다, risk 10 = 가장 안전). J1–J12는 0–2.
import fs from 'node:fs';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';

const HELP = `score-table.mjs <items.json> [--weights 40,30,30] [--mode synergy|jev] [--format json|md|html] [--top N]
synergy: (0.4·적합 + 0.3·비용 + 0.3·리스크) × 언어 계수(lang, 기본 1). 상한: 강제 제약 위반 → 3, 주장만 있는 근거 → 6.
jev: J1–J12(각 0–2) 가중 합 0–100. 관문: J1=0 → reject, J3=0 → code. ≥70 high · 50–69 mid · <50 low.`;

export const J_CRITERIA = [
  { id: 'J1', weight: 14, ko: '답 공간이 닫혀 있다(≤255 선택지 · 2–10 등급 · 예/아니오)', gate: 'reject' },
  { id: 'J2', weight: 10, ko: '지금 LLM이 JSON 라벨·점수만 돌려주는 자리를 대신한다' },
  { id: 'J3', weight: 12, ko: '산술이 아닌 의미 판단(카운팅·날짜·숫자 비교·정확 조회 아님)', gate: 'code' },
  { id: 'J4', weight: 8, ko: '반복된다(요소·세그먼트·턴마다)' },
  { id: 'J5', weight: 8, ko: '지연·비용 압력이 있다' },
  { id: 'J6', weight: 10, ko: 'state가 짧은 영어로 만들어진다(추가 번역 LLM 없이, ≤6k자)' },
  { id: 'J7', weight: 8, ko: '해당 없음·폴백 선택지를 둘 수 있다' },
  { id: 'J8', weight: 10, ko: '틀려도 회복되거나 게이트가 막는다' },
  { id: 'J9', weight: 6, ko: '보정 데이터가 있다(사람 라벨 ≥30)' },
  { id: 'J10', weight: 4, ko: '적대적 텍스트 노출이 낮다' },
  { id: 'J11', weight: 6, ko: '기존 게이트에 맞고 스위치로 끌 수 있다' },
  { id: 'J12', weight: 4, ko: 'KPI를 잴 수 있다' },
];

export function synergy(item, weights = [40, 30, 30]) {
  const [wf, wc, wr] = weights.map((w) => w / 100);
  for (const k of ['fit', 'cost', 'risk']) {
    const v = item[k];
    if (typeof v !== 'number' || v < 0 || v > 10) throw new Error(`${item.id}: ${k}는 0–10 숫자여야 합니다 (받은 값 ${v})`);
  }
  let total = +(wf * item.fit + wc * item.cost + wr * item.risk).toFixed(2);
  const caps = [];
  // 언어 계수: 근거가 다른 언어에서 잰 수치일 때만(언어별 감사가 있을 때). 곱한 뒤 상한을 건다.
  if (item.lang !== undefined && item.lang !== null) {
    if (typeof item.lang !== 'number' || !(item.lang > 0 && item.lang <= 1)) throw new Error(`${item.id}: lang(언어 계수)은 0 초과 1 이하 숫자여야 합니다 (받은 값 ${item.lang})`);
    if (item.lang < 1) { total = +(total * item.lang).toFixed(2); caps.push(`언어 계수 ×${item.lang}`); }
  }
  if ((item.caps || []).includes('hard-constraint')) { total = Math.min(total, 3); caps.push('강제 제약 위반 → 3'); }
  if ((item.caps || []).includes('claims-only') || item.grade === 'C') { total = Math.min(total, 6); caps.push('주장만 있는 근거 → 6'); }
  let blindDiff = null;
  if (item.blind) {
    blindDiff = Math.max(...['fit', 'cost', 'risk'].map((k) => Math.abs((item.blind[k] ?? item[k]) - item[k])));
  }
  return { total, caps, blindDiff, recheck: blindDiff !== null && blindDiff >= 2 };
}

export function jevScore(j) {
  let sum = 0;
  for (const c of J_CRITERIA) {
    const v = j?.[c.id];
    if (![0, 1, 2].includes(v)) throw new Error(`${c.id}는 0, 1, 2 중 하나여야 합니다 (받은 값 ${v})`);
    sum += c.weight * (v / 2);
  }
  const total = Math.round(sum * 10) / 10;
  let verdict;
  if (j.J1 === 0) verdict = 'reject';
  else if (j.J3 === 0) verdict = 'code';
  else verdict = total >= 70 ? 'high' : total >= 50 ? 'mid' : 'low';
  return { total, verdict };
}

export function scoreItems(items, { weights = [40, 30, 30], mode = 'synergy' } = {}) {
  const rows = items.map((it) => {
    if (mode === 'jev') return { ...it, ...jevScore(it.j) };
    const s = synergy(it, weights);
    const jev = it.jev && typeof it.jev.score === 'number' ? { advisory: it.jev.score * 2.5, confidence: it.jev.confidence ?? null } : null;
    return { ...it, ...s, jevAdvisory: jev ? jev.advisory : null, jevNote: jev ? null : (it.jev?.skipped || '미실행') };
  });
  rows.sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id)));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function toMarkdown(rows, mode) {
  if (mode === 'jev') {
    return mdTable(['순위', 'id', '판단 지점', ...J_CRITERIA.map((c) => c.id), '합계', '판정'],
      rows.map((r) => [r.rank, r.id, r.label, ...J_CRITERIA.map((c) => r.j[c.id]), r.total, r.verdict]));
  }
  return mdTable(['순위', 'id', '항목', '적합', '비용', '리스크', '시너지', '상한', '블라인드 차', 'Jev 보조'],
    rows.map((r) => [r.rank, r.id, r.label, r.fit, r.cost, r.risk, r.total, r.caps.join('; ') || '-', r.blindDiff ?? '-', r.jevAdvisory ?? `—(${r.jevNote})`]));
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 순위 막대 HTML 조각 — assets/report.html의 .rank 스타일을 쓴다. 색만으로 뜻을 전하지 않도록 값을 글자로 병기한다. */
export function toHtml(rows, mode, top = 20) {
  const max = mode === 'jev' ? 100 : 10;
  const body = rows.slice(0, top).map((r) => {
    const pct = Math.max(0, Math.min(100, (r.total / max) * 100)).toFixed(0);
    const band = mode === 'jev' ? (r.verdict === 'high' ? 'hi' : r.verdict === 'mid' ? '' : 'lo') : (r.total >= 8 ? 'hi' : r.total < 6.5 ? 'lo' : '');
    const src = r.source ? `<span class="chip src">${esc(r.source)}</span>` : '';
    const tag = mode === 'jev' ? ` <span class="chip">${esc(r.verdict)}</span>` : '';
    return `  <div class="row ${band}"><span class="lbl">${src}<span>${esc(r.label)}</span>${tag}</span><div class="track"><i style="width:${pct}%"></i></div><span class="v">${mode === 'jev' ? r.total.toFixed(0) : r.total.toFixed(1)}</span></div>`;
  }).join('\n');
  return `<div class="rank" role="img" aria-label="${mode === 'jev' ? 'Jev 적합도(0–100)' : '시너지 점수(0–10)'} 상위 ${Math.min(top, rows.length)}개">\n${body}\n</div>`;
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
  const mode = flags.mode === 'jev' ? 'jev' : 'synergy';
  let rows;
  try { rows = scoreItems(items, { weights, mode }); } catch (e) { fail(e.message, EXIT.PRECONDITION); }
  const fmt = flags.format || 'json';
  if (fmt === 'md') emit(toMarkdown(rows, mode), 'md');
  else if (fmt === 'html') emit(toHtml(rows, mode, Number(flags.top) || 20), 'md');
  else emit({ mode, weights: mode === 'jev' ? J_CRITERIA.map((c) => [c.id, c.weight]) : weights, rows });
}
