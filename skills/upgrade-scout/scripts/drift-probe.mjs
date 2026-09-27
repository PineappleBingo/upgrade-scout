#!/usr/bin/env node
// drift-probe — 대상이 부르는 외부 CLI·HTTP·SDK를 정적으로 뽑고(scan), 실제 --help·OpenAPI·문서와 대조한다(compare).
//   node drift-probe.mjs scan <repo> [--format md]
//   node drift-probe.mjs compare <scan.json> --help-dir <dir>        (<dir>/<cli>.txt 에 `<cli> --help` 출력을 저장해 둔다)
//   node drift-probe.mjs compare <scan.json> --openapi spec.json
//   node drift-probe.mjs compare-doc --doc api.md --expect-keys state,questions,criteria
// 이 스크립트는 아무것도 실행하지 않는다. --help 출력은 메인 세션이 직접 떠서 파일로 넘긴다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { textFiles, lineIndex, CODE_EXT, isTestPath } from './lib/walk.mjs';

const HELP = `drift-probe.mjs scan <repo> | compare <scan.json> (--help-dir d | --openapi f) | compare-doc --doc f --expect-keys a,b
조용히 실패하는 연동(없는 서브커맨드·플래그, 바뀐 경로)을 찾는다. 실행은 하지 않는다.`;

const SPAWN = /\b(spawn|spawnSync|execFile|execFileSync|exec|execSync|subprocess\.(?:run|Popen|call|check_output))\s*\(\s*(?:\[\s*)?["'`]([\w@./:-]+)["'`]\s*,?\s*(\[[^\]]*\])?/g;
const NPX = /["'`]npx["'`]\s*,\s*\[([^\]]*)\]|\bnpx\s+(-y\s+)?([@\w./-]+(?:@[\w.-]+)?)/g;
const URL_RE = /["'`](https?:\/\/[^"'`\s${}]+)["'`]/g;

function localPackages(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return new Set([...Object.keys(j.dependencies || {}), ...Object.keys(j.devDependencies || {})]);
  } catch { return new Set(); }
}

export function scan(root) {
  const calls = [];
  const local = localPackages(root);
  for (const [rel, text] of textFiles(root, { exts: CODE_EXT })) {
    if (isTestPath(rel)) continue;
    const li = lineIndex(text);
    const lines = text.split('\n');
    const inComment = (idx) => /^\s*(\/\/|\*|#|\/\*)/.test(lines[li(idx) - 1] || '');
    let m;
    SPAWN.lastIndex = 0;
    while ((m = SPAWN.exec(text))) {
      if (inComment(m.index)) continue;
      const flags = m[3] ? [...m[3].matchAll(/["'`](-{1,2}[\w-]+)(?:=[^"'`]*)?["'`]/g)].map((f) => f[1]) : [];
      const sub = m[3] ? [...m[3].matchAll(/["'`]([a-z][\w-]*)["'`]/g)].map((f) => f[1]).slice(0, 2) : [];
      calls.push({ kind: 'cli', name: path.basename(m[2]), subcommands: sub, flags: [...new Set(flags)], ref: `${rel}:${li(m.index)}` });
    }
    // spawn(IDENT, …) — 같은 파일의 const IDENT = …"cmd"… 를 따라가 이름을 얻는다.
    for (const sm of text.matchAll(/\b(spawn|spawnSync|execFile|execFileSync)\s*\(\s*([A-Za-z_]\w*)\s*,/g)) {
      if (inComment(sm.index)) continue;
      const def = new RegExp(`const\\s+${sm[2]}\\s*=\\s*([^;\\n]+)`).exec(text);
      const lit = def && /["'`]([\w.-]+)["'`]\s*;?\s*$/.exec(def[1].trim());
      if (lit) calls.push({ kind: 'cli', name: lit[1].replace(/\.cmd$/, ''), subcommands: [], flags: [], ref: `${rel}:${li(sm.index)}`, via: sm[2] });
    }
    NPX.lastIndex = 0;
    while ((m = NPX.exec(text))) {
      if (inComment(m.index)) continue;
      const pkg = m[1] ? (m[1].match(/["'`]([@\w./-]+(?:@[\w.-]+)?)["'`]/g) || []).map((x) => x.slice(1, -1)).find((x) => !x.startsWith('-')) : m[3];
      if (!pkg) continue;
      const bare = pkg.replace(/(.)@[^/]*$/, '$1');
      calls.push({ kind: 'npx', name: pkg, pinned: /@\d/.test(pkg.replace(/^@/, '')) || local.has(bare), ref: `${rel}:${li(m.index)}` });
    }
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      if (inComment(m.index)) continue;
      const url = m[1];
      if (/localhost|127\.0\.0\.1|example\.(com|org)|schema\.org|w3\.org/.test(url)) continue;
      const before = text.slice(Math.max(0, m.index - 80), m.index);
      const method = /\bpost\b|method:\s*["']POST/i.test(before + text.slice(m.index, m.index + 200)) ? 'POST' : 'GET';
      calls.push({ kind: 'http', url, method, ref: `${rel}:${li(m.index)}` });
    }
  }
  const unpinned = calls.filter((c) => c.kind === 'npx' && !c.pinned).map((c) => c.ref);
  return { root: path.resolve(root), calls, notes: unpinned.length ? [{ kind: 'unpinned-npx', refs: unpinned, note: 'npx 패키지 버전이 고정되지 않음 — 공급망·동작 변경 위험' }] : [] };
}

/** CLI 호출의 서브커맨드·플래그가 저장된 --help 출력에 있는지. */
export function compareHelp(scanResult, helpDir) {
  const drift = [];
  for (const c of scanResult.calls.filter((x) => x.kind === 'cli')) {
    const file = path.join(helpDir, `${c.name}.txt`);
    if (!fs.existsSync(file)) continue;
    const help = fs.readFileSync(file, 'utf8');
    for (const f of c.flags) if (!new RegExp(`(^|[\\s,])${f.replace(/[-]/g, '\\-')}(?=[\\s,=\\[<]|$)`, 'm').test(help)) drift.push({ ref: c.ref, cli: c.name, missing_flag: f });
    for (const s of c.subcommands) if (!new RegExp(`(^|\\s)${s}(\\s|$)`, 'm').test(help)) drift.push({ ref: c.ref, cli: c.name, missing_subcommand: s });
  }
  return drift;
}

export function compareOpenapi(scanResult, spec) {
  const paths = Object.keys(spec.paths || {});
  const toRe = (p) => new RegExp(`${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);
  const drift = [];
  for (const c of scanResult.calls.filter((x) => x.kind === 'http')) {
    let p;
    try { p = new URL(c.url).pathname; } catch { continue; }
    if (!paths.some((sp) => toRe(sp).test(p))) drift.push({ ref: c.ref, url: c.url, missing_path: p });
  }
  return drift;
}

export function compareDoc(docText, keys) {
  return keys.map((k) => ({ key: k, present: new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(docText) }));
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (cmd === 'scan') {
    if (!arg || !fs.existsSync(arg)) fail('대상 저장소 경로가 필요합니다', EXIT.PRECONDITION);
    const r = scan(arg);
    if (flags.format === 'md') {
      emit([`# drift-probe scan — ${r.root}`, '', mdTable(['종류', '이름/URL', '서브·플래그', '위치'], r.calls.map((c) => [c.kind, c.name || `${c.method} ${c.url}`, [...(c.subcommands || []), ...(c.flags || [])].join(' '), c.ref])), ...r.notes.map((n) => `\n⚠ ${n.note}: ${n.refs.join(', ')}`)].join('\n'), 'md');
    } else emit(r);
  } else if (cmd === 'compare') {
    if (!arg || !fs.existsSync(arg)) fail('scan 결과 JSON 경로가 필요합니다', EXIT.PRECONDITION);
    const s = JSON.parse(fs.readFileSync(arg, 'utf8'));
    const drift = flags['help-dir'] ? compareHelp(s, flags['help-dir']) : flags.openapi ? compareOpenapi(s, JSON.parse(fs.readFileSync(flags.openapi, 'utf8'))) : fail('--help-dir 또는 --openapi가 필요합니다');
    emit({ drift });
    process.exit(drift.length ? EXIT.FINDINGS : EXIT.OK);
  } else if (cmd === 'compare-doc') {
    if (!flags.doc || !flags['expect-keys']) fail('--doc 와 --expect-keys가 필요합니다');
    const res = compareDoc(fs.readFileSync(flags.doc, 'utf8'), String(flags['expect-keys']).split(','));
    emit({ keys: res });
    process.exit(res.some((r) => !r.present) ? EXIT.FINDINGS : EXIT.OK);
  } else fail(`알 수 없는 명령: ${cmd}`);
}
