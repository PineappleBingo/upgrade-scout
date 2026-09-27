import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './_offline.mjs';
import { listPacks, loadPack, matchPacks } from '../lib/packs.mjs';

function tmpSkill(packMd) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
  if (packMd) {
    fs.mkdirSync(path.join(dir, 'packs', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'packs', 'demo', 'pack.md'), packMd);
  }
  return dir;
}

const DEMO = `---
name: demo
version: 1.0.0
checked: 2026-09-26
env: DEMO_KEY
triggers:
  urls: docs.demo.ai, demo.ai
  keywords: demo, system one
provides:
  registry: registry.json
radar:
  index: https://example.com/data/
  live_queries: topic:demo, demo in:readme
---
데모 팩`;

test('loadPack reads nested triggers, provides, options and radar', () => {
  const p = loadPack(path.join(tmpSkill(DEMO), 'packs', 'demo'));
  assert.equal(p.name, 'demo');
  assert.deepEqual(p.triggerUrls, ['docs.demo.ai', 'demo.ai']);
  assert.deepEqual(p.triggerKeywords, ['demo', 'system one']);
  assert.deepEqual(p.radarQueries, ['topic:demo', 'demo in:readme']);
  assert.equal(p.radarIndex, 'https://example.com/data/');
  assert.equal(p.registry, 'registry.json');
  assert.equal(p.qsetLint, null);
  assert.equal(p.mode, 'auto', 'options.mode defaults to auto');
  assert.deepEqual(p.env, ['DEMO_KEY']);
});

test('matchPacks: url host or whole-word keyword only', () => {
  const packs = listPacks(tmpSkill(DEMO));
  assert.deepEqual(matchPacks(packs, { refs: ['https://docs.demo.ai/api'] }), [{ name: 'demo', why: 'url:docs.demo.ai' }]);
  assert.deepEqual(matchPacks(packs, { refs: ['https://sub.demo.ai/x'] }).map((m) => m.name), ['demo']);
  assert.deepEqual(matchPacks(packs, { focus: 'Demo를 붙일 곳' }).map((m) => m.why), ['keyword:demo']);
  assert.deepEqual(matchPacks(packs, { focus: 'use System One here' }).map((m) => m.why), ['keyword:system one']);
  assert.deepEqual(matchPacks(packs, { focus: 'demolition plan' }), [], 'substring is not a keyword hit');
  assert.deepEqual(matchPacks(packs, { refs: ['https://notdemo.ai/'] }), [], 'host suffix must be a real subdomain');
});

test('unrelated focus: judging and scoring words do not load a pack', () => {
  const packs = listPacks(tmpSkill(DEMO));
  assert.deepEqual(matchPacks(packs, { focus: '판단 로직을 점수화하고 judge와 score를 붙이고 싶다' }), []);
});

test('no packs folder → empty list', () => {
  assert.deepEqual(listPacks(tmpSkill(null)), []);
});
