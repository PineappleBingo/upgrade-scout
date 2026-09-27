#!/usr/bin/env node
// radar — 레이더 인덱스(radar-index/1)를 받아 신선도를 보고, 생성 이후 새 리포를 즉석 검색으로 보충하고,
// FOCUS 키워드로 걸러 상위 N을 낸다. --clone이면 상위 N을 얕게 클론해 repo-reviewer에게 넘길 경로를 낸다.
//   node radar.mjs [--index <url|dir>] [--pack jev] [--keywords a,b] [--category slug] [--since YYYY-MM-DD] [--verified]
//                  [--top 10] [--no-live] [--clone N --dest dir] [--no-write] [--format json|md]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { validate } from './lib/schema.mjs';
import { listPacks } from './lib/packs.mjs';

const HELP = `radar.mjs [--index <url|dir>] [--pack jev] [--keywords a,b] [--category slug] [--since YYYY-MM-DD] [--verified] [--top 10]
          [--no-live] [--clone N --dest dir] [--no-write] [--format json|md]
인덱스를 못 받으면 status=unavailable("빈 목록" 아님). 생성 48시간이 넘으면 stale 경고. 즉석 보충은 팩의 radar_queries(GitHub 검색).`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'assets', 'radar-index.schema.json'), 'utf8'));

async function getJson(src, name, fetchImpl) {
  if (!/^https?:\/\//.test(src)) return JSON.parse(fs.readFileSync(path.join(src, name), 'utf8'));
  const url = new URL(name, src.endsWith('/') ? src : `${src}/`).href;
  const res = await (fetchImpl || fetch)(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function loadIndex(src, { fetchImpl } = {}) {
  let meta;
  let items;
  try {
    meta = await getJson(src, 'meta.json', fetchImpl);
    items = await getJson(src, 'index.json', fetchImpl);
  } catch (e) {
    return { status: 'unavailable', reason: e.message };
  }
  const errors = [
    ...validate({ ...SCHEMA.$defs.meta, $defs: SCHEMA.$defs }, meta),
    ...(Array.isArray(items) ? items.flatMap((it, i) => validate({ ...SCHEMA.$defs.item, $defs: SCHEMA.$defs }, it, undefined, `$[${i}]`)) : ['$: 배열이어야 한다']),
  ];
  if (errors.length) return { status: 'invalid', meta, errors: errors.slice(0, 20) };
  return { status: 'ok', meta, items };
}

export function freshness(meta, now = new Date(), maxHours = 48) {
  const ageHours = Math.round(((now - new Date(meta.generated_at)) / 36e5) * 10) / 10;
  return { ageHours, stale: ageHours > maxHours };
}

const hay = (it) => [it.full_name, it.description, ...(it.keywords || []), ...(it.topics || []), it.summary_ko?.what, it.summary_ko?.decision].filter(Boolean).join(' ').toLowerCase();
const hits = (it, keywords) => keywords.filter((k) => hay(it).includes(k.toLowerCase())).length;

export function filterItems(items, { keywords = [], category, since, verified } = {}) {
  return items.filter((it) => {
    if ((it.flags || []).includes('spam-suspect')) return false;
    if (category && it.category?.slug !== category) return false;
    if (since && String(it.first_seen) < since) return false;
    if (verified && it.verified !== 'code') return false;
    if (keywords.length && hits(it, keywords) === 0) return false;
    return true;
  });
}

export function rankItems(items, keywords = []) {
  return [...items].sort((a, b) => (hits(b, keywords) * 2 + b.score) - (hits(a, keywords) * 2 + a.score) || b.stars - a.stars);
}

export async function liveDelta(queries, sinceDate, { fetchImpl, token = process.env.GITHUB_TOKEN } = {}) {
  const seen = new Map();
  try {
    for (const q of queries) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`${q} created:>=${sinceDate}`)}&sort=updated&per_page=30`;
      const res = await (fetchImpl || fetch)(url, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const r of body.items || []) {
        if (seen.has(r.full_name)) continue;
        seen.set(r.full_name, { full_name: r.full_name, url: r.html_url, description: r.description, summary_ko: null, category: { slug: 'unsorted', label: '미분류', emoji: '🆕', confidence: null }, keywords: [], topics: r.topics || [], language: r.language, license: r.license?.spdx_id ?? null, stars: r.stargazers_count, forks: r.forks_count, stars_7d_delta: null, pushed_at: r.pushed_at, created_at: r.created_at, first_seen: sinceDate, sources: [`live:${q}`], verified: 'pending', decision_types: [], flags: [r.archived ? 'archived' : null, r.fork ? 'fork' : null].filter(Boolean), score: 0 });
      }
    }
  } catch (e) {
    return { status: 'unavailable', reason: e.message, items: [...seen.values()] };
  }
  return { status: 'ok', items: [...seen.values()] };
}

function toMd(res) {
  const rows = res.top.map((i) => [i.full_name, `⭐ ${i.stars} · 🍴 ${i.forks}`, i.category.emoji + ' ' + i.category.label, i.verified, i.summary_ko?.what || i.description || '']);
  return [`# radar — ${res.status} · ${res.topic ?? '?'} · 생성 ${res.generated_at ?? '?'}${res.stale ? ' · ⚠️ 오래됨' : ''} · 즉석 보충 ${res.live.count}(${res.live.status})`, '', mdTable(['리포', '별·포크', '분야', '검증', '요약'], rows)].join('\n');
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2), { bool: ['verified', 'no-live', 'no-write', 'help', 'h'] });
  if (helpRequested(flags)) { process.stdout.write(HELP + '\n'); process.exit(EXIT.OK); }
  const pack = flags.pack ? listPacks(SKILL_DIR).find((p) => p.name === String(flags.pack)) : null;
  if (flags.pack && !pack) fail(`팩이 없습니다: ${flags.pack}`);
  const src = flags.index ? String(flags.index) : pack?.radarIndex;
  if (!src) fail('--index 또는 radar_index가 있는 --pack이 필요합니다');
  const keywords = flags.keywords ? String(flags.keywords).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const idx = await loadIndex(src);
  if (idx.status !== 'ok') { emit({ status: idx.status, reason: idx.reason || null, errors: idx.errors || null, top: [] }); process.exit(EXIT.NETWORK); }
  const fresh = freshness(idx.meta);
  const since = String(idx.meta.generated_at).slice(0, 10);
  const live = flags['no-live'] || !pack?.radarQueries.length ? { status: 'skipped', items: [] } : await liveDelta(pack.radarQueries, since);
  const known = new Set(idx.items.map((i) => i.full_name));
  const merged = [...idx.items, ...live.items.filter((i) => !known.has(i.full_name))];
  const top = rankItems(filterItems(merged, { keywords, category: flags.category, since: flags.since, verified: flags.verified }), keywords).slice(0, Number(flags.top) || 10);
  const res = { status: 'ok', topic: idx.meta.topic, generated_at: idx.meta.generated_at, ...fresh, live: { status: live.status, count: live.items.filter((i) => !known.has(i.full_name)).length }, top };
  if (flags.clone) {
    const n = Number(flags.clone);
    const dest = flags.dest ? String(flags.dest) : null;
    if (!dest) fail('--clone에는 --dest가 필요합니다');
    res.clones = top.slice(0, n).map((i) => {
      const to = path.join(dest, i.full_name.replace('/', '__'));
      const cmd = ['git', 'clone', '--depth', '1', i.url, to];
      if (flags['no-write']) return { repo: i.full_name, path: to, cmd: cmd.join(' '), done: false };
      const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
      return { repo: i.full_name, path: to, done: r.status === 0, error: r.status === 0 ? null : (r.stderr || '').trim().split('\n').pop() };
    });
  }
  if ((flags.format || 'json') === 'md') emit(toMd(res), 'text');
  else emit(res);
}
