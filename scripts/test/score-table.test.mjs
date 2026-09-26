import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_offline.mjs';
import { synergy, jevScore, scoreItems, toHtml, toMarkdown, J_CRITERIA } from '../score-table.mjs';

test('J weights sum to 100', () => {
  assert.equal(J_CRITERIA.reduce((a, c) => a + c.weight, 0), 100);
});

test('synergy 40/30/30, caps and blind difference', () => {
  assert.equal(synergy({ id: 'a', fit: 10, cost: 5, risk: 5 }).total, 7);
  assert.equal(synergy({ id: 'b', fit: 10, cost: 10, risk: 10, caps: ['hard-constraint'] }).total, 3);
  assert.equal(synergy({ id: 'c', fit: 10, cost: 10, risk: 10, grade: 'C' }).total, 6);
  const d = synergy({ id: 'd', fit: 8, cost: 6, risk: 6, blind: { fit: 5, cost: 6, risk: 7 } });
  assert.equal(d.blindDiff, 3);
  assert.equal(d.recheck, true);
  assert.throws(() => synergy({ id: 'e', fit: 11, cost: 1, risk: 1 }), /0–10/);
});

test('jev score: gates before bands', () => {
  const all2 = Object.fromEntries(J_CRITERIA.map((c) => [c.id, 2]));
  assert.deepEqual(jevScore(all2), { total: 100, verdict: 'high' });
  assert.equal(jevScore({ ...all2, J1: 0 }).verdict, 'reject');
  assert.equal(jevScore({ ...all2, J3: 0 }).verdict, 'code');
  const mid = Object.fromEntries(J_CRITERIA.map((c) => [c.id, 1]));
  assert.deepEqual(jevScore(mid), { total: 50, verdict: 'mid' });
  assert.throws(() => jevScore({ ...all2, J5: 3 }), /J5/);
});

test('scoreItems ranks deterministically; jev advisory never zero-filled', () => {
  const rows = scoreItems([
    { id: 'x', label: 'X', fit: 5, cost: 5, risk: 5 },
    { id: 'y', label: 'Y', fit: 9, cost: 8, risk: 8, jev: { score: 3, confidence: 0.7 } },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['y', 'x']);
  assert.equal(rows[0].jevAdvisory, 7.5);
  assert.equal(rows[1].jevAdvisory, null);
  assert.match(toMarkdown(rows, 'synergy'), /—\(미실행\)/);
  const html = toHtml(rows, 'synergy');
  assert.match(html, /role="img"/);
  assert.match(html, /8\.4/);
});

test('language coefficient multiplies before caps and is validated', () => {
  assert.equal(synergy({ id: 'l1', fit: 10, cost: 10, risk: 10, lang: 0.9 }).total, 9);
  const capped = synergy({ id: 'l2', fit: 10, cost: 10, risk: 10, lang: 0.9, grade: 'C' });
  assert.equal(capped.total, 6);
  assert.ok(capped.caps.some((c) => c.includes('언어 계수')));
  assert.equal(synergy({ id: 'l3', fit: 8, cost: 6, risk: 6, lang: 1 }).caps.length, 0);
  assert.throws(() => synergy({ id: 'l4', fit: 1, cost: 1, risk: 1, lang: 1.2 }), /언어 계수/);
  assert.throws(() => synergy({ id: 'l5', fit: 1, cost: 1, risk: 1, lang: 0 }), /언어 계수/);
});
