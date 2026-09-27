import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './_offline.mjs';
import { loadIndex, freshness, filterItems, rankItems, liveDelta } from '../radar.mjs';

const DIR = fixture('radar');

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
