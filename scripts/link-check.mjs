#!/usr/bin/env node
// link-check — 인용할 링크·리포가 실제로 있는지 확인한다. 리포트에 죽은 링크를 싣지 않기 위해서다.
//   node link-check.mjs <urls.json|article.html> [--parser html-numbered-list] [--profile] [--concurrency 6] [--format json|md]
//   node link-check.mjs --urls https://github.com/a/b,https://example.org
// 판정: ok · missing(없음 또는 비공개) · unverified(403·429 — 막혔을 뿐 없다는 뜻이 아니다) · unknown(네트워크 실패)
// GitHub는 github.com HTML·비세션 API가 막힌 환경이 많아 `git ls-remote`로 존재를 보고, --profile이면
// raw.githubusercontent.com에서 README·LICENSE·매니페스트를 읽는다(API 호출 없음).
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested, nowIso } from './lib/cli.mjs';
import { httpRequest, isOffline, setOffline } from './lib/net.mjs';
import { githubRepoOf, cleanUrl, PARSERS } from './lib/parsers.mjs';
import { stripHtml } from './lib/text.mjs';

const HELP = `link-check.mjs <input> [--parser html-numbered-list] [--profile] [--concurrency N] [--format json|md] [--offline]
input: URL 배열 JSON · {items:[{url}]} · HTML(--parser와 함께) · 또는 --urls a,b
GitHub 리포는 git ls-remote로 존재·기본 브랜치·HEAD를 보고, --profile이면 raw에서 README·LICENSE·매니페스트를 읽는다.`;

/** git ls-remote --symref <url> HEAD — 비동기, 프롬프트 없이 실패하게. */
export function lsRemote(repoUrl, { timeoutMs = 25000, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', SSH_ASKPASS: 'echo' };
    const child = spawnImpl('git', ['ls-remote', '--symref', `${repoUrl}.git`, 'HEAD'], { env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ status: 'unknown', error: 'timeout' }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ status: 'unknown', error: String(e.message) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(classifyLsRemote(code, out, err));
    });
  });
}

/** ls-remote 결과 해석 — 테스트할 수 있게 분리. */
export function classifyLsRemote(code, stdout, stderr) {
  if (code === 0) {
    const branch = (/ref:\s+refs\/heads\/(\S+)\s+HEAD/.exec(stdout) || [])[1] || null;
    const sha = (/^([0-9a-f]{40})\s+HEAD$/m.exec(stdout) || [])[1] || null;
    return sha ? { status: 'ok', defaultBranch: branch, head: sha } : { status: 'ok', defaultBranch: branch, head: null, note: '빈 리포' };
  }
  const e = String(stderr);
  if (/not found|could not read Username|terminal prompts disabled|Authentication failed|403/i.test(e)) {
    return { status: 'missing', note: '없음 또는 비공개', error: e.trim().split('\n').pop()?.slice(0, 160) };
  }
  return { status: 'unknown', error: e.trim().split('\n').pop()?.slice(0, 160) || `exit ${code}` };
}

/** 로그인 벽 호스트 — 게시물이 지워져도 200 껍데기를 돌려주므로 200을 "있음"으로 치지 않는다. */
const LOGIN_WALL = /(^|\.)(x\.com|twitter\.com|threads\.net|linkedin\.com|instagram\.com|facebook\.com)$/i;

export function classifyHttp(status, url = '') {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* 호스트를 모르면 일반 규칙 */ }
  if (status >= 200 && status < 400) return LOGIN_WALL.test(host) ? 'unverified' : 'ok';
  if (status === 404 || status === 410) return 'missing';
  if (status === 401 || status === 403 || status === 429 || status === 999) return 'unverified';
  return 'unknown';
}

const MANIFESTS = [
  ['package.json', 'node'], ['pyproject.toml', 'python'], ['requirements.txt', 'python'], ['Cargo.toml', 'rust'],
  ['go.mod', 'go'], ['Gemfile', 'ruby'], ['composer.json', 'php'], ['pom.xml', 'java'], ['build.sbt', 'scala'], ['Package.swift', 'swift'], ['mix.exs', 'elixir'],
  ['.claude-plugin/plugin.json', 'claude-plugin'], ['.claude-plugin/marketplace.json', 'claude-marketplace'], ['SKILL.md', 'skill'], ['.mcp.json', 'mcp'],
];

async function rawText(owner, repo, branch, file) {
  const r = await httpRequest(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`, { timeoutMs: 15000 });
  return r.status === 200 ? r.body : null;
}

/** README 첫 제목·첫 문단, LICENSE 첫 줄, 매니페스트, Jev 호출 흔적을 모은다. */
export async function profileRepo(owner, repo, branch) {
  const b = branch || 'main';
  let readme = null;
  for (const f of ['README.md', 'readme.md', 'README.MD', 'README', 'README.rst']) { readme = await rawText(owner, repo, b, f); if (readme) break; }
  let license = null;
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE']) {
    const t = await rawText(owner, repo, b, f);
    if (t) { license = guessLicense(t); break; }
  }
  const kinds = [];
  let pkg = null;
  for (const [file, kind] of MANIFESTS) {
    const t = await rawText(owner, repo, b, file);
    if (t) { kinds.push(kind); if (file === 'package.json') pkg = t; }
  }
  const r = readme || '';
  const lines = r.split(/\r?\n/);
  const title = (lines.find((l) => /^#\s+/.test(l)) || '').replace(/^#\s+/, '').trim() || null;
  const para = lines.filter((l) => l.trim() && !/^(#|!\[|\[!\[|<|>|```|\||-{3,})/.test(l.trim())).slice(0, 3).join(' ');
  const hay = r + (pkg || '');
  return {
    readme: Boolean(readme),
    title,
    intro: stripHtml(para).slice(0, 320),
    license,
    stack: [...new Set(kinds)],
    jev: {
      mentions: (r.match(/\bjev\b/gi) || []).length,
      api: /api\.typesafe\.ai|\/v1\/systemone/i.test(hay),
      sdk: /@typesafe-ai\/sdk|typesafe-sdk|TypeSafeClient/i.test(hay),
      questionTypes: ['noul', 'choice', 'score'].filter((q) => new RegExp(`\\b${q}\\b`, 'i').test(r)),
    },
  };
}

export function guessLicense(text) {
  const t = String(text).slice(0, 600);
  const table = [[/MIT License|Permission is hereby granted, free of charge/i, 'MIT'], [/Apache License[\s,]+Version 2\.0/i, 'Apache-2.0'],
    [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'], [/GNU LESSER GENERAL PUBLIC LICENSE/i, 'LGPL'], [/GNU GENERAL PUBLIC LICENSE/i, 'GPL'],
    [/Mozilla Public License/i, 'MPL-2.0'], [/BSD 3-Clause|Redistribution and use in source and binary forms/i, 'BSD'],
    [/Creative Commons Attribution 4\.0|CC BY 4\.0/i, 'CC-BY-4.0'], [/CC0|Creative Commons Zero/i, 'CC0'], [/The Unlicense|unlicense\.org/i, 'Unlicense'], [/ISC License/i, 'ISC']];
  for (const [re, id] of table) if (re.test(t)) return id;
  return 'other';
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** 링크 하나를 확인한다. GitHub 리포면 ls-remote, 아니면 HTTP GET. */
export async function checkOne(url, { profile = false, lsRemoteImpl = lsRemote } = {}) {
  const gh = githubRepoOf(url);
  if (isOffline()) return { url, kind: gh ? 'github' : 'web', status: 'unknown', note: '오프라인' };
  if (gh) {
    const r = await lsRemoteImpl(gh.url);
    const row = { url, repo: `${gh.owner}/${gh.repo}`, kind: 'github', ...r };
    if (profile && r.status === 'ok') row.profile = await profileRepo(gh.owner, gh.repo, r.defaultBranch);
    return row;
  }
  const r = await httpRequest(url, { timeoutMs: 20000 });
  const status = r.status ? classifyHttp(r.status, url) : 'unknown';
  const note = status === 'unverified' && r.status < 400 ? '로그인 벽 — 200이어도 게시물 존재를 보장하지 않음' : undefined;
  return { url, kind: 'web', status, http: r.status, error: r.error, ...(note ? { note } : {}) };
}

export async function checkAll(urls, { concurrency = 6, profile = false, lsRemoteImpl } = {}) {
  const uniq = [...new Set(urls.map(cleanUrl))];
  const rows = await pool(uniq, concurrency, (u) => checkOne(u, { profile, lsRemoteImpl }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { summary: { total: rows.length, ok: count('ok'), missing: count('missing'), unverified: count('unverified'), unknown: count('unknown') }, rows };
}

function loadInput(file, parser) {
  const text = fs.readFileSync(file, 'utf8');
  if (parser) {
    const fn = PARSERS[parser];
    if (!fn) fail(`알 수 없는 파서: ${parser}`);
    const items = fn(text);
    return { items, urls: items.flatMap((it) => (it.url ? [it.url] : [])) };
  }
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.items || data.rows || [];
  return { items: arr, urls: arr.map((x) => (typeof x === 'string' ? x : x.url)).filter(Boolean) };
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2), { bool: ['profile', 'offline', 'help', 'h'] });
  if (helpRequested(flags) || (!_[0] && !flags.urls)) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (flags.offline) setOffline(true);
  let items = [], urls = [];
  if (flags.urls) urls = String(flags.urls).split(',').map((s) => s.trim()).filter(Boolean);
  else {
    if (!fs.existsSync(_[0])) fail(`입력 파일이 없습니다: ${_[0]}`, EXIT.PRECONDITION);
    ({ items, urls } = loadInput(_[0], flags.parser));
  }
  const res = await checkAll(urls, { concurrency: Number(flags.concurrency) || 6, profile: Boolean(flags.profile) });
  const byUrl = new Map(res.rows.map((r) => [r.url, r]));
  const joined = items.length && items[0] && typeof items[0] === 'object'
    ? items.map((it) => ({ ...it, check: it.url ? byUrl.get(cleanUrl(it.url)) || null : { status: 'no-link' } }))
    : null;
  const out = { checkedAt: nowIso(flags), ...res, ...(joined ? { items: joined } : {}) };
  if (flags.format === 'md') {
    emit(mdTable(['상태', '링크', '리포', '라이선스', '스택', '비고'], res.rows.map((r) => [r.status, r.url, r.repo || '-', r.profile?.license || '-', (r.profile?.stack || []).join(' ') || '-', r.note || r.error || ''])), 'md');
  } else emit(out);
  process.exit(res.summary.missing ? EXIT.FINDINGS : EXIT.OK);
}
