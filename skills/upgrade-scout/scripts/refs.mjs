#!/usr/bin/env node
// refs — 레퍼런스 유형 판별(리포 · 설계 문서 · 모델 능력 · 생태계)과 팩 트리거 대조. 네트워크 없음, 쓰기 없음.
//   node refs.mjs classify [--focus "…"] [--pack-mode <팩>=<mode> …] [--skill-dir d] [<ref…>]
//   node refs.mjs vars '<변수 JSON>'
// 확신이 없는 판별은 ask에 모아 메인이 사용자에게 한 번에 묻는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, helpRequested } from './lib/cli.mjs';
import { listPacks, matchPacks } from './lib/packs.mjs';

const HELP = `refs.mjs classify [--focus "…"] [--pack-mode <팩>=<mode> …] [--skill-dir d] [<ref…>]   (ref가 없으면 --focus만으로)
refs.mjs vars '<변수 JSON>'   v3.0·v2.0 변수(CANDIDATES · UI_SCOPE · PLUGIN_SCOPE · JEV_MODE)를 v3.1 이름으로 옮기고 notes에 적는다
유형: repo(GitHub 리포 · owner/repo · 로컬 git 폴더) · design(마크다운 · 문서 · 아티팩트) · capability(문서/API 사이트, 팩 도메인) ·
ecosystem(GitHub 토픽 · awesome 목록 · 레이더 인덱스) · unknown. confident=false는 ask 목록으로.
--pack-mode(반복 가능, vars의 packs.<팩>.mode): off는 트리거가 맞아도 팩을 끄고, off가 아닌 값은 트리거 없이도 켠다(SKILL.md §6).`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_DIR = path.resolve(HERE, '..');
const DOC_EXT = /\.(md|mdx|markdown|txt|rst|html?|pdf)$/i;
const out = (ref, type, confident, why) => ({ ref, type, confident, why });

export function classifyRef(ref, { cwd = process.cwd() } = {}) {
  const r = String(ref).trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(r)) {
    const p = path.resolve(cwd, r);
    if (fs.existsSync(p)) {
      if (fs.statSync(p).isDirectory()) return fs.existsSync(path.join(p, '.git')) ? out(r, 'repo', true, 'local git repo') : out(r, 'repo', false, 'local folder without .git');
      if (DOC_EXT.test(p)) return out(r, 'design', true, 'local document');
      return out(r, 'unknown', false, 'local file of unknown kind');
    }
    if (/^[\w.-]+\/[\w.-]+$/.test(r)) return out(r, 'repo', true, 'owner/repo shorthand');
    return out(r, 'unknown', false, 'not a URL and not found locally');
  }
  let u;
  try { u = new URL(r); } catch { return out(r, 'unknown', false, 'bad URL'); }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'raw.githubusercontent.com' && /(^|\/)(index|meta)\.json$|\/data\/?$/.test(u.pathname)) return out(r, 'ecosystem', true, 'radar index');
  if (host === 'github.com') {
    if (parts[0] === 'topics') return out(r, 'ecosystem', true, 'GitHub topic');
    if (parts.length >= 2 && /^awesome[-_]/i.test(parts[1])) return out(r, 'ecosystem', true, 'awesome list');
    if (parts[2] === 'blob' && DOC_EXT.test(u.pathname)) return out(r, 'design', true, 'document in a repo');
    if (parts.length >= 2) return out(r, 'repo', true, 'GitHub repo');
  }
  if (host === 'claude.ai' && parts[0] === 'artifact') return out(r, 'design', false, 'artifact — design doc or report?');
  if (/^docs\./.test(host) || parts.some((s) => ['docs', 'api', 'reference', 'pricing', 'models'].includes(s)) || /llms\.txt$/.test(u.pathname)) return out(r, 'capability', false, 'docs or API site');
  if (DOC_EXT.test(u.pathname)) return out(r, 'design', false, 'web document');
  return out(r, 'design', false, 'web page — confirm the kind');
}

export function classifyAll(refs, { focus = '', skillDir = DEFAULT_SKILL_DIR, cwd = process.cwd(), modes = {} } = {}) {
  const packs = listPacks(skillDir);
  // 팩 mode(SKILL.md §6): off는 트리거가 맞아도 끄고, off가 아닌 명시 mode는 트리거 없이도 켠다.
  const matched = matchPacks(packs, { refs, focus }).filter((m) => modes[m.name] !== 'off');
  for (const p of packs) if (modes[p.name] && modes[p.name] !== 'off' && !matched.some((m) => m.name === p.name)) matched.push({ name: p.name, why: `mode:${modes[p.name]}` });
  const hostsByPack = new Map(packs.filter((p) => matched.some((m) => m.name === p.name)).map((p) => [p.name, p.triggerUrls]));
  const classified = refs.map((ref) => {
    const c = classifyRef(ref, { cwd });
    let host = null;
    try { host = new URL(ref).hostname.toLowerCase(); } catch { /* 로컬 */ }
    for (const [name, urls] of hostsByPack) {
      if (host && urls.some((u) => host === u || host.endsWith(`.${u}`))) return { ...c, type: 'capability', confident: true, why: `pack ${name} domain`, pack: name };
    }
    return c;
  });
  return { refs: classified, packs: matched, ask: classified.filter((c) => !c.confident).map((c) => c.ref) };
}

/** v3.0·v2.0 변수 이름을 v3.1로 옮긴다. 옮긴 것은 notes에 적어 run.json에 남긴다. 별칭은 v4에서 뺀다. */
export function normalizeVars(v = {}) {
  const out = { ...v };
  const notes = [];
  const refs = [...(v.REFERENCES || [])];
  if ('CANDIDATES' in v) {
    for (const c of v.CANDIDATES || []) if (!refs.includes(c)) refs.push(c);
    notes.push('CANDIDATES → REFERENCES');
    delete out.CANDIDATES;
  }
  out.REFERENCES = refs;
  const lenses = new Set(v.LENSES || []);
  if ('UI_SCOPE' in v) {
    if (v.UI_SCOPE === 'on') lenses.add('ui');
    notes.push(`UI_SCOPE=${v.UI_SCOPE} → LENSES`);
    delete out.UI_SCOPE;
  }
  if ('PLUGIN_SCOPE' in v) {
    if (v.PLUGIN_SCOPE !== 'off') { lenses.add('plugins'); out.plugins = { scope: v.PLUGIN_SCOPE }; }
    notes.push(`PLUGIN_SCOPE=${v.PLUGIN_SCOPE} → LENSES`);
    delete out.PLUGIN_SCOPE;
  }
  out.LENSES = [...lenses];
  if ('JEV_MODE' in v) {
    const mode = { analyze: 'lens', accelerate: 'lens+scorer' }[v.JEV_MODE] || v.JEV_MODE;
    out.packs = { ...(v.packs || {}), jev: { ...(v.packs?.jev || {}), mode } };
    notes.push(`JEV_MODE=${v.JEV_MODE} → packs.jev.mode=${mode}`);
    delete out.JEV_MODE;
  }
  return { vars: out, notes };
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2), { multi: ['pack-mode'] });
  if (helpRequested(flags)) { process.stdout.write(HELP + '\n'); process.exit(EXIT.OK); }
  const [cmd, ...refs] = _;
  if (cmd === 'vars' && refs[0]) {
    let v;
    try { v = JSON.parse(refs[0]); } catch (e) { fail(`JSON이 아닙니다: ${e.message}`); }
    emit(normalizeVars(v));
    process.exit(EXIT.OK);
  }
  if (cmd !== 'classify' || (!refs.length && !flags.focus)) { process.stdout.write(HELP + '\n'); process.exit(EXIT.USAGE); }
  const skillDir = flags['skill-dir'] ? path.resolve(String(flags['skill-dir'])) : DEFAULT_SKILL_DIR;
  if (!fs.existsSync(skillDir)) fail(`폴더가 없습니다: ${skillDir}`);
  const pairs = (flags['pack-mode'] || []).map((s) => /^([\w-]+)=(\S+)$/.exec(String(s)));
  if (pairs.some((m) => !m)) fail('--pack-mode는 <팩>=<mode> 모양이어야 합니다');
  emit(classifyAll(refs, { focus: flags.focus ? String(flags.focus) : '', skillDir, modes: Object.fromEntries(pairs.map((m) => [m[1], m[2]])) }));
}
