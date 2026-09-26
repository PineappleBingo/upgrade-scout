import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './_offline.mjs';
import { parseNumberedList, parseSitemap, parseMarkdownLinks, parseCatalogJson, parseNpm, parsePypi, cleanUrl, githubRepoOf } from '../lib/parsers.mjs';
import { classifyLsRemote, classifyHttp, guessLicense, checkAll } from '../link-check.mjs';

const read = (name) => fs.readFileSync(fixture('sources', name), 'utf8');

test('parseNumberedList: sections, names, tracking params stripped, link-less items kept', () => {
  const items = parseNumberedList(read('numbered-list.html'));
  assert.deepEqual(items.map((i) => i.n), [1, 2, 99, 100]);
  assert.equal(items[0].section, 'Classification & Routing');
  assert.equal(items[0].url, 'https://github.com/usenotra/notra');
  assert.equal(items[0].desc, 'Moved classifiers off an LLM & onto Jev.');
  assert.equal(items[1].name, 'jev-router (prismhq)');
  assert.equal(items[1].url, 'https://github.com/prismhq/jev-router');
  assert.equal(items[1].links.length, 2, 'description links are kept as extra links');
  assert.equal(items[2].section, 'Finance, Legal & Moderation');
  assert.equal(items[3].url, null);
  assert.equal(items[3].name, 'No link item');
});

test('url helpers', () => {
  assert.equal(cleanUrl('https://a.test/x?ref=hn&utm_medium=y&keep=1'), 'https://a.test/x?keep=1');
  assert.deepEqual(githubRepoOf('https://github.com/Owner/Repo.git/tree/main/x'), { owner: 'Owner', repo: 'Repo', url: 'https://github.com/Owner/Repo' });
  assert.equal(githubRepoOf('https://github.com/topics/jev'), null);
  assert.equal(githubRepoOf('https://gitlab.com/a/b'), null);
});

test('sitemap, llms.txt, catalog, npm, pypi parsers', () => {
  assert.deepEqual(parseSitemap(read('sitemap.xml')), [
    { loc: 'https://docs.example.test/models', lastmod: '2026-09-22' },
    { loc: 'https://docs.example.test/api', lastmod: null },
  ]);
  const links = parseMarkdownLinks(read('llms.txt'));
  assert.equal(links.length, 2, 'duplicate URL counted once');
  assert.equal(links[1].url, 'https://docs.example.test/primitives/noul');
  assert.equal(links[0].section, 'Primitives');
  const cat = parseCatalogJson(read('catalog.json'));
  assert.equal(cat.length, 2);
  assert.equal(cat[0].id, 'jev-trade');
  assert.deepEqual(cat[0].question_types, ['choice']);
  assert.equal(cat[1].official, true);
  assert.deepEqual(parseNpm({ 'dist-tags': { latest: '0.6.0' }, time: { '0.6.0': '2026-09-15T00:00:00Z' }, versions: { '0.5.7': {}, '0.6.0': {} } }), { latest: '0.6.0', time: '2026-09-15T00:00:00Z', versions: 2 });
  assert.equal(parsePypi({ info: { version: '0.7.1' }, releases: { '0.7.1': [{ upload_time_iso_8601: '2026-09-21T00:00:00Z' }] } }).time, '2026-09-21T00:00:00Z');
});

test('link-check classification: ls-remote, http, login walls, licenses', () => {
  const ok = classifyLsRemote(0, 'ref: refs/heads/main\tHEAD\n' + 'a'.repeat(40) + '\tHEAD\n', '');
  assert.deepEqual(ok, { status: 'ok', defaultBranch: 'main', head: 'a'.repeat(40) });
  assert.equal(classifyLsRemote(128, '', 'remote: Repository not found.\nfatal: repository not found').status, 'missing');
  assert.equal(classifyLsRemote(128, '', 'fatal: could not read Username for https://github.com: terminal prompts disabled').status, 'missing');
  assert.equal(classifyLsRemote(128, '', 'fatal: unable to access: Could not resolve host').status, 'unknown');
  assert.equal(classifyHttp(200, 'https://docs.test/a'), 'ok');
  assert.equal(classifyHttp(200, 'https://x.com/a/status/1'), 'unverified', 'login wall 200 is not proof');
  assert.equal(classifyHttp(404), 'missing');
  assert.equal(classifyHttp(403), 'unverified', '403 means blocked, not dead');
  assert.equal(guessLicense('MIT License\n\nCopyright (c) 2026'), 'MIT');
  assert.equal(guessLicense('                                 Apache License\n                           Version 2.0, January 2004'), 'Apache-2.0');
});

test('checkAll is offline-safe and never sends requests in tests', async () => {
  const res = await checkAll(['https://github.com/a/b?ref=x', 'https://github.com/a/b', 'https://docs.test/'], { concurrency: 2 });
  assert.equal(res.summary.total, 2, 'tracking params collapse duplicates');
  assert.ok(res.rows.every((r) => r.status === 'unknown' && r.note === '오프라인'));
});
