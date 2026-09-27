import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './_offline.mjs';
import { scanLocal, normalize, suggest } from '../plugin-scout.mjs';

test('scan-local: risky plugin — hooks, publisher mismatch, unpinned and remote MCP, signals → hold', () => {
  const r = scanLocal(fixture('plugins', 'hooky'));
  assert.deepEqual(r.hooks.map((h) => h.event).sort(), ['SessionStart', 'Stop']);
  const stop = r.hooks.find((h) => h.event === 'Stop');
  assert.ok(stop.signals.includes('runs-project-scripts'));
  assert.ok(r.hooks.find((h) => h.event === 'SessionStart').signals.includes('injection-words'));
  assert.ok(r.notes.some((n) => n.kind === 'publisher-mismatch'));
  assert.deepEqual(r.mcp.map((m) => [m.name, m.kind, m.pinned]).sort(), [['cloud', 'remote', null], ['local', 'stdio', false], ['pinned', 'stdio', true]]);
  for (const k of ['network', 'secrets', 'unpinned-npx', 'release-age-bypass', 'auto-trigger']) assert.ok(r.summary.signal_kinds.includes(k), k);
  assert.deepEqual(r.bin, ['bin/sync-tool']);
  assert.equal(r.suggestion.verdict, 'hold');
  assert.equal(r.suggestion.label, '기계 제안');
});

test('scan-local: modern skill-only plugin has no hooks and is not held; legacy manifest flagged', () => {
  const m = scanLocal(fixture('plugins', 'modern'));
  assert.equal(m.hooks.length, 0);
  assert.equal(m.manifests.marketplace.legacy, false);
  assert.notEqual(m.suggestion.verdict, 'hold');
  const l = scanLocal(fixture('plugins', 'legacy'));
  assert.ok(l.notes.some((n) => n.kind === 'legacy-manifest'));
  assert.equal(l.manifests.marketplace.plugins[0], 'tool-evaluator@1.0.0');
});

test('normalize: search results + marketplace merge; hooks and remote reach lower the machine suggestion; needs filter', () => {
  const inputs = [
    { file: fixture('plugins', 'search-plugins.json'), data: JSON.parse(fs.readFileSync(fixture('plugins', 'search-plugins.json'), 'utf8')) },
    { file: fixture('plugins', 'modern', '.claude-plugin', 'marketplace.json'), data: JSON.parse(fs.readFileSync(fixture('plugins', 'modern', '.claude-plugin', 'marketplace.json'), 'utf8')) },
  ];
  const all = normalize(inputs);
  const by = Object.fromEntries(all.map((c) => [c.name, c]));
  assert.equal(by['skill-creator'].suggestion.verdict, 'adopt');
  assert.equal(by.scout.suggestion.verdict, 'hold', 'hooks from a community publisher start at hold');
  assert.deepEqual(by.scout.hook_events, ['SessionStart', 'UserPromptSubmit']);
  assert.equal(by['Exa Deep Research'].suggestion.verdict, 'assess');
  assert.equal(by.demo.install_cmd, 'claude plugin install demo@demo-market');
  const withNeeds = normalize(inputs, { needs: [{ id: 'N01', keywords: ['research'] }], installed: ['skill-creator'] });
  const w = Object.fromEntries(withNeeds.map((c) => [c.name, c]));
  assert.deepEqual(w['Exa Deep Research'].needs_hit, ['N01']);
  assert.equal(w['skill-creator'].installed, true);
  assert.equal(w.demo.suggestion.verdict, 'hold', 'no need matched');
  assert.equal(suggest({ tier: 'anthropic', reach: 'privileged' }).verdict, 'hold');
});

test('signals: make only in command position, not in prose', async () => {
  const { SIGNALS } = await import('../plugin-scout.mjs');
  const re = SIGNALS.find((s) => s.kind === 'runs-project-scripts').re;
  for (const hit of ['run `make test` first', '"command": "make lint"', '$ make build', 'ls && make', '  make\n']) assert.ok(re.test(hit), hit);
  for (const miss of ['what AI could make possible in an app, or', '  make sure the key is set before you call it', 'we make things']) assert.ok(!re.test(miss), miss);
});
