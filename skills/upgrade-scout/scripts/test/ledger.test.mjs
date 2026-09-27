import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_offline.mjs';
import { validateReply, emptyLedger, merge, pick, record, blindExport, attachBlind, jevRequests, attachJev, exportMd } from '../ledger.mjs';
import { append, verify, diff } from '../history.mjs';
import { validate } from '../lib/schema.mjs';

const reviewer = (subject, status = 'implemented') => ({
  role: 'repo-reviewer', contract: 'upgrade-scout/repo-reviewer@2', run_id: 'r1', subject, status: 'ok',
  claims: [
    { id: 'rr1', text_ko: `${subject}에 fail-closed 검증기가 있다`, kind: 'fact', evidence: [{ type: 'file', ref: `${subject}:src/jev.ts:30-45` }], recheck: { cmd: 'rg -n validate src', expect: '>=1' }, confidence: 'high' },
    { id: 'rr2', text_ko: `${subject}에 LICENSE 파일이 없다`, kind: 'license', evidence: [], confidence: 'low' },
  ],
  review: { repo: { name: subject, license: 'MIT', review_depth: 'clone' }, items: [{ id: `RR-${subject}-01`, capability_ko: '응답 검증기', summary_en: 'Fail-closed validation of Jev answers', status, fit: 8, cost: 7, risk: 8, difficulty: 'S', port_mode: 'adapt' }] },
});
const asText = (obj) => `요약입니다.\n\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\n\n## Critical Files\n- src/jev.ts`;

test('validateReply: one json block with a Plan-style trailer; contract errors are reported', () => {
  const ok = validateReply('repo-reviewer', asText(reviewer('hunch')));
  assert.equal(ok.ok, true, ok.errors.join('; '));
  const bad = reviewer('hunch');
  bad.review.items[0].fit = 11;
  bad.claims[0].kind = 'rumor';
  const r = validateReply('repo-reviewer', asText(bad));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('fit')));
  assert.ok(r.errors.some((e) => e.includes('kind')));
  assert.equal(validateReply('repo-reviewer', '```json\n{}\n```\n```json\n{}\n```').ok, false, 'two blocks are rejected');
});

test('merge: ids, dedupe by text+evidence, conflicts; pick favours license/absence and low confidence', () => {
  let L = merge(emptyLedger('r1'), [{ role: 'repo-reviewer', data: reviewer('hunch') }, { role: 'repo-reviewer', data: reviewer('hunch') }]);
  assert.equal(L.claims.length, 2, 'duplicates merged');
  assert.equal(L.claims[0].id, 'C-001');
  assert.equal(L.claims[0].sources.length, 2);
  L = merge(L, [{ role: 'repo-reviewer', data: reviewer('hunch', 'claimed-only') }]);
  assert.equal(L.conflicts.length, 1);
  const p = pick(L, 5);
  assert.equal(p[0].kind, 'license');
});

test('record: refutation writes a repair log and queues the subject; blind and jev reconciliation', () => {
  let L = merge(emptyLedger('r1'), [{ role: 'repo-reviewer', data: reviewer('hunch') }]);
  L = record(L, { claim: 'C-002', cmd: 'ls LICENSE', exit: 0, excerpt: 'LICENSE', verdict: 'refuted', correction: 'MIT LICENSE 있음', at: '2026-09-26T00:00:00Z' });
  assert.equal(L.repair_log[0].id, 'F-01');
  assert.deepEqual(L.queue, ['hunch']);
  assert.throws(() => record(L, { claim: 'C-999', verdict: 'confirmed' }), /없다/);
  const blind = blindExport(L);
  assert.equal(blind[0].fit, undefined, 'blind export hides main scores');
  let L2 = attachBlind(merge(emptyLedger('r2'), [{ role: 'repo-reviewer', data: reviewer('jev-mcp') }]), [{ item_id: 'RR-jev-mcp-01', fit: 5, cost: 7, risk: 8 }]);
  assert.equal(L2.items[0].blind_diff, 3);
  assert.deepEqual(L2.queue, ['jev-mcp']);
  const qset = { id: 'scorer-questions', version: 'v1', model: 'jev-1.13.0', questions: { fit: { type: 'score', instructions: 'x', criteria: ['a', 'b', 'c', 'd', 'e'] } } };
  const { requests, skipped } = jevRequests(L2, qset);
  assert.equal(requests.length, 1);
  assert.equal(skipped.length, 0);
  assert.equal(JSON.stringify(requests[0].state).includes('"fit"'), false, 'our scores never enter Jev state');
  L2 = attachJev(L2, { rows: [{ id: 'RR-jev-mcp-01', status: 'ok', answers: { fit: { score: 1, confidence: 0.8 } } }] });
  assert.equal(L2.items[0].jev.advisory, 2.5);
  assert.match(exportMd(L), /F-01/);
});

test('history: append-only hash chain, tamper detection, diff of top5', () => {
  let h = { schema: 'upgrade-scout/history@1', records: [] };
  h = append(h, { target: 'tvse', vars: { DEPTH: 'standard' }, top5: ['a', 'b'], jev_verdicts: { high: 8 } }, '2026-09-25T00:00:00Z');
  h = append(h, { target: 'tvse', vars: { DEPTH: 'deep' }, top5: ['a', 'c'], jev_verdicts: { high: 10 } }, '2026-09-26T00:00:00Z');
  assert.equal(verify(h).ok, true);
  const d = diff(h.records);
  assert.deepEqual(d.top5_added, ['c']);
  assert.deepEqual(d.top5_dropped, ['b']);
  assert.equal(d.jev_verdicts.high, 2);
  const tampered = structuredClone(h);
  tampered.records[0].top5 = ['z'];
  assert.equal(verify(tampered).ok, false);
  assert.throws(() => append(tampered, { target: 't', vars: {}, top5: [] }, 'x'), /사슬/);
  assert.throws(() => append(h, { target: 't' }, 'x'), /vars/);
});

test('schema: $ref, enum, additionalProperties, patterns', () => {
  const s = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { $ref: '#/$defs/id' }, b: { enum: [1, 2] } }, $defs: { id: { type: 'string', pattern: '^C-\\d{3}$' } } };
  assert.deepEqual(validate(s, { a: 'C-001', b: 2 }), []);
  assert.equal(validate(s, { a: 'X', b: 3, c: 1 }).length, 3);
});

test('jev-analyst alias: v3.0 replies are accepted as capability-analyst', () => {
  const reply = { role: 'jev-analyst', contract: 'upgrade-scout/jev-analyst@2', run_id: 'r', status: 'ok', claims: [],
    capability: { subject: 'TypeSafe Jev', sheet: { primitives: ['choice'], limits: [], cost: '$0.042/1M', languages: 'en best', sources: [{ url: 'https://docs.typesafe.ai', checked: '2026-09-26' }] }, points: [], not_fit: [] } };
  const res = validateReply('jev-analyst', JSON.stringify(reply));
  assert.equal(res.ok, true, res.errors.join('\n'));
  assert.equal(res.data.role, 'capability-analyst');
});

test('jev-analyst alias: a genuine v3.0 payload (key `jev`, no `capability`) is migrated', () => {
  const reply = { role: 'jev-analyst', contract: 'upgrade-scout/jev-analyst@2', run_id: 'r', status: 'ok', claims: [],
    jev: { subject: 'TypeSafe Jev', sheet: { primitives: ['choice'], limits: [], cost: '$0.042/1M', languages: 'en best', sources: [{ url: 'https://docs.typesafe.ai', checked: '2026-09-26' }] }, points: [], not_fit: [] } };
  const res = validateReply('jev-analyst', JSON.stringify(reply));
  assert.equal(res.ok, true, res.errors.join('\n'));
  assert.equal(res.data.role, 'capability-analyst');
  assert.equal(res.data.contract, 'upgrade-scout/capability-analyst@2');
  assert.equal('jev' in res.data, false);
  assert.equal(res.data.capability.subject, reply.jev.subject);
});

test('capability points with axes become score items; NOT_FIT does not', () => {
  const L = merge(emptyLedger('r'), [{ role: 'capability-analyst', data: { claims: [], capability: { subject: 'Jev', sheet: {}, not_fit: [], points: [
    { id: 'CP01', ref: 'a.ts:1', decision_ko: '댓글 의도 분류', primitive: 'choice', triage: 'DIRECT', gates: {}, axes: { fit: 9, cost: 7, risk: 8 }, lang: 0.9 },
    { id: 'CP02', ref: 'b.ts:1', decision_ko: '날짜 비교', primitive: 'none', triage: 'NOT_FIT', gates: {}, axes: { fit: 1, cost: 1, risk: 1 } },
  ] } } }]);
  assert.deepEqual(L.items.map((i) => i.id), ['CP01']);
  assert.equal(L.items[0].source, 'capability:Jev');
  assert.equal(L.items[0].lang, 0.9);
});

test('pack contract extension: jev pack_scores must carry J1–J12 (NOT_FIT exempt)', () => {
  const j = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`J${i + 1}`, 1]));
  const point = (id, extra) => ({ id, ref: 'a.ts:1', decision_ko: 'd', primitive: 'choice', triage: 'DIRECT', gates: {}, ...extra });
  const reply = (points, pack = 'jev') => ({ role: 'capability-analyst', contract: 'upgrade-scout/capability-analyst@2', run_id: 'r', status: 'ok', claims: [],
    capability: { subject: 'Jev', pack, sheet: { primitives: [], limits: [], cost: '', languages: '', sources: [{ url: 'https://docs.typesafe.ai', checked: '2026-09-26' }] }, points, not_fit: [] } });
  assert.equal(validateReply('capability-analyst', reply([point('CP01', { pack_scores: { j } })])).ok, true);
  const bad = validateReply('capability-analyst', reply([point('CP01', { pack_scores: { j: { ...j, J12: undefined } } })]));
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('\n'), /pack_scores/);
  assert.equal(validateReply('capability-analyst', reply([point('CP02', { triage: 'NOT_FIT' })])).ok, true, 'NOT_FIT needs no J scores');
  assert.match(validateReply('capability-analyst', reply([], 'nope')).errors.join('\n'), /팩 nope/);
  assert.equal(validateReply('capability-analyst', reply([point('CP03', {})], null)).ok, true, 'no pack → no extension');
});

test('design-mapper: contract validates and missing pieces join the score table', () => {
  const reply = { role: 'design-mapper', contract: 'upgrade-scout/design-mapper@2', run_id: 'r', status: 'ok',
    claims: [{ id: 'dm1', text_ko: '수리 로그가 없다', kind: 'absence', evidence: [{ type: 'cmd', ref: 'rg -n repair src' }], recheck: { cmd: 'rg -n repair src', expect: '0' }, confidence: 'mid' }],
    mapping: {
      source: { ref: 'https://example.com/playbook', title: '위임 루프 플레이북', kind: 'playbook', checked: '2026-09-26' },
      measured_claims: false,
      principles: [{ id: 'P01', text_ko: '실패를 계층으로 귀속', quote: 'attribute the failure to one layer' }],
      platform_checks: [{ assumption_ko: '스킬은 자기 파일을 고칠 수 있다', verified: 'no', url: 'https://code.claude.com/docs/en/skills', checked: '2026-09-26' }],
      mapping: [{ principle: 'P01', status: 'absent', target_refs: [], note_ko: '없음', search: 'rg -n "repair|layer" src' }],
      missing_pieces: [{ id: 'MP01', title_ko: '수리 로그', design_ko: 'append-only 기록 하나', touches: ['src/agents/rewriter.ts'], fit: 8, cost: 7, risk: 8 }],
      conflicts: [],
    } };
  const res = validateReply('design-mapper', JSON.stringify(reply));
  assert.equal(res.ok, true, res.errors.join('\n'));
  const L = merge(emptyLedger('r'), [{ role: 'design-mapper', data: res.data }]);
  assert.deepEqual(L.items.map((i) => [i.id, i.source]), [['MP01', 'design:위임 루프 플레이북']]);
  assert.equal(L.claims[0].kind, 'absence');
});

test('design-mapper: at most three missing pieces', () => {
  const pieces = [1, 2, 3, 4].map((n) => ({ id: `MP0${n}`, title_ko: 't', design_ko: 'd', touches: [], fit: 5, cost: 5, risk: 5 }));
  const reply = { role: 'design-mapper', contract: 'upgrade-scout/design-mapper@2', run_id: 'r', status: 'ok', claims: [],
    mapping: { source: { ref: 'x', title: 'x', kind: 'design' }, measured_claims: false, principles: [], platform_checks: [], mapping: [], missing_pieces: pieces, conflicts: [] } };
  assert.equal(validateReply('design-mapper', JSON.stringify(reply)).ok, false);
});
