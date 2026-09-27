import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture, SCRIPTS } from './_offline.mjs';
import { loadIndex, freshness, filterItems, rankItems, liveDelta } from '../radar.mjs';

const DIR = fixture('radar');
const RADAR = path.join(SCRIPTS, 'radar.mjs');

function runCli(args) {
  const r = spawnSync(process.execPath, [RADAR, ...args], { encoding: 'utf8', env: { ...process.env, UPGRADE_SCOUT_OFFLINE: '1' } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('local index loads and validates', async () => {
  const r = await loadIndex(DIR);
  assert.equal(r.status, 'ok', JSON.stringify(r.errors));
  assert.equal(r.items.length, 3);
  assert.equal(r.meta.topic, 'jev');
});

test('unreachable index is unavailable, not empty', async () => {
  const r = await loadIndex('https://raw.githubusercontent.com/x/y/main/data/', { fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.items, undefined);
  const r404 = await loadIndex('https://raw.githubusercontent.com/x/y/main/data/', { fetchImpl: async () => new Response('nope', { status: 404 }) });
  assert.equal(r404.status, 'unavailable');
});

test('freshness: 48h window', () => {
  const meta = { generated_at: '2026-09-26T21:00:00Z' };
  assert.equal(freshness(meta, new Date('2026-09-27T21:00:00Z')).stale, false);
  assert.equal(freshness(meta, new Date('2026-09-29T00:00:00Z')).stale, true);
});

test('filter drops spam and ranks by keyword hits then score', async () => {
  const { items } = await loadIndex(DIR);
  const f = filterItems(items, { keywords: ['comment'] });
  assert.deepEqual(f.map((i) => i.full_name), ['a/comment-router'], 'spam-suspect removed, keyword required when given');
  const all = rankItems(filterItems(items, {}), ['prose']);
  assert.deepEqual(all.map((i) => i.full_name), ['b/prose-lint', 'a/comment-router']);
  assert.deepEqual(filterItems(items, { verified: true }).map((i) => i.full_name), ['a/comment-router']);
  assert.deepEqual(filterItems(items, { since: '2026-09-20' }).map((i) => i.full_name), ['a/comment-router']);
});

test('live delta maps GitHub search results and keeps going on failure', async () => {
  const fake = async (url) => {
    assert.match(String(url), /search\/repositories\?q=/);
    assert.match(decodeURIComponent(String(url)), /created:>=2026-09-26/);
    return new Response(JSON.stringify({ items: [{ full_name: 'n/new', html_url: 'https://github.com/n/new', description: 'new', stargazers_count: 3, forks_count: 0, pushed_at: '2026-09-27T01:00:00Z', created_at: '2026-09-27T00:00:00Z', topics: ['jev'], language: 'Go', license: null, archived: false, fork: false }] }), { status: 200 });
  };
  const d = await liveDelta(['topic:jev'], '2026-09-26', { fetchImpl: fake });
  assert.equal(d.status, 'ok');
  assert.deepEqual(d.items.map((i) => [i.full_name, i.verified, i.sources[0]]), [['n/new', 'pending', 'live:topic:jev']]);
  const bad = await liveDelta(['topic:jev'], '2026-09-26', { fetchImpl: async () => { throw new Error('x'); } });
  assert.equal(bad.status, 'unavailable');
});

test('schema catches a bad sub-field: category.slug must be a string', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-fixture-'));
  fs.copyFileSync(path.join(DIR, 'meta.json'), path.join(tmp, 'meta.json'));
  const items = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  items[0].category.slug = 7;
  fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify(items));
  const r = await loadIndex(tmp);
  assert.equal(r.status, 'invalid');
  assert.ok(r.errors.some((e) => e.includes('category.slug')), JSON.stringify(r.errors));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CLI: --index <dir> --keywords ranks and filters, exits 0', () => {
  const r = runCli(['--index', DIR, '--keywords', 'comment', '--no-live', '--format', 'json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.top.map((i) => i.full_name), ['a/comment-router']);
});

test('CLI: --clone --no-write plans the clone without touching disk', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-clone-'));
  fs.rmSync(dest, { recursive: true, force: true }); // must not exist beforehand — the CLI must not create it either
  const r = runCli(['--index', DIR, '--keywords', 'comment', '--no-live', '--clone', '1', '--dest', dest, '--no-write', '--format', 'json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.clones.length, 1);
  assert.equal(out.clones[0].done, false);
  assert.match(out.clones[0].cmd, /git clone --depth 1/);
  assert.ok(out.clones[0].path.endsWith('a__comment-router'), out.clones[0].path);
  assert.equal(fs.existsSync(dest), false, 'dest folder must not be created in --no-write mode');
});

test('CLI: unreachable local index → exit NETWORK(4), status unavailable', () => {
  const r = runCli(['--index', path.join(DIR, 'does-not-exist'), '--no-live', '--format', 'json']);
  assert.equal(r.status, 4);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'unavailable');
});
