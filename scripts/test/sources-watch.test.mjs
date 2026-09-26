import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixture } from './_offline.mjs';
import { watch, toItems, diffItems, checkAlerts, loadRegistry } from '../sources-watch.mjs';

const REG = fixture('sources', 'registry.fixture.json');

test('first run is a baseline (nothing counted as new); snapshots only with --update; blocked is unavailable', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-state-'));
  const r1 = await watch(REG, { stateDir: state, fixtures: fixture('sources', 'run1'), now: '2026-09-26T00:00:00Z' });
  const by = Object.fromEntries(r1.sources.map((s) => [s.id, s]));
  assert.equal(by['docs-sitemap'].status, 'baseline');
  assert.equal(by['docs-sitemap'].counts.new, 0);
  assert.equal(by.hn.counts.total, 4);
  assert.equal(by.blocked.status, 'unavailable', 'not "no change"');
  assert.equal(fs.existsSync(path.join(state, 'sources')), false, 'no --update → no writes');
  await watch(REG, { stateDir: state, fixtures: fixture('sources', 'run1'), update: true, now: '2026-09-26T00:00:00Z' });
  assert.ok(fs.existsSync(path.join(state, 'sources', 'fixture', 'hn.json')));
  const noWrite = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-state-'));
  await watch(REG, { stateDir: noWrite, fixtures: fixture('sources', 'run1'), update: true, noWrite: true, now: 'x' });
  assert.equal(fs.existsSync(path.join(noWrite, 'sources')), false, '--no-write wins over --update');
});

test('second run: new/changed/removed, version and page alerts, zero items is parse-suspect', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-state-'));
  await watch(REG, { stateDir: state, fixtures: fixture('sources', 'run1'), update: true, now: '2026-09-26T00:00:00Z' });
  const r2 = await watch(REG, { stateDir: state, fixtures: fixture('sources', 'run2'), now: '2026-09-30T00:00:00Z' });
  const by = Object.fromEntries(r2.sources.map((s) => [s.id, s]));
  assert.deepEqual(by['docs-sitemap'].counts, { total: 2, new: 1, changed: 1, removed: 1 });
  assert.equal(by.catalog.status, 'ok');
  assert.equal(by.catalog.counts.changed, 0);
  assert.equal(by.hn.status, 'parse-suspect');
  assert.ok(by.npm.alerts.some((a) => a.id === 'version'));
  assert.deepEqual(by.models.alerts.map((a) => a.id).sort(), ['new-model', 'price']);
  assert.ok(r2.summary.alerts >= 3);
});

test('helpers: date fallback on baseline, alert polarity, registry validation', () => {
  const items = toItems('sitemap', fs.readFileSync(fixture('sources', 'sitemap.xml'), 'utf8'));
  const d = diffItems(null, items, { since: '2026-09-20' });
  assert.equal(d.counts.recent, 1, 'lastmod newer than --since is reported as recent, not new');
  assert.deepEqual(checkAlerts('price $0.042', [{ id: 'p', re: '0\\.042', expect: true }]), []);
  assert.equal(checkAlerts('price $0.05', [{ id: 'p', re: '0\\.042', expect: true }]).length, 1);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-reg-')), 'r.json');
  fs.writeFileSync(tmp, JSON.stringify({ sources: [{ id: 'a', url: 'u', method: 'bogus' }] }));
  assert.throws(() => loadRegistry(tmp), /method/);
  const { reg } = loadRegistry('jev');
  assert.ok(reg.sources.length >= 15, 'shipped jev registry loads');
  assert.ok(reg.sources.some((s) => s.id === 'hackernoon-101' && s.method === 'html-numbered-list'));
  assert.ok(reg.sources.some((s) => s.id === 'catalog-kydlikebtc' && s.method === 'catalog-json'));
});
