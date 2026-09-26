#!/usr/bin/env node
// inventory — 대상 저장소의 규모·매니페스트·LLM SDK·환경 키 이름·문서·제약(규칙 문장)을 JSON으로.
// 사용: node inventory.mjs <repo> [--format json|md] [--top 12]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { listFiles, readText } from './lib/walk.mjs';

const HELP = `inventory.mjs <repo> [--format json|md] [--top N]
대상 저장소를 읽기만 한다. 출력: git·파일 규모·매니페스트(engines·scripts·deps)·LLM SDK·
.env.example의 키 이름(값은 읽지 않음)·문서·제약 문장(반드시/절대/금지/must/never)·CI·테스트 명령.`;

const LLM_SDKS = [
  ['anthropic', /@anthropic-ai\/sdk|\banthropic\b/],
  ['openai', /\bopenai\b/],
  ['google-genai', /@google\/genai|google-generativeai|generativelanguage\.googleapis/],
  ['ollama', /\bollama\b/],
  ['typesafe-jev', /@typesafe-ai\/sdk|typesafe-sdk|api\.typesafe\.ai|systemone/],
  ['vercel-ai', /(^|["'\/])ai["']|@ai-sdk\//],
  ['langchain', /langchain/],
];

const STRONG = /(반드시|절대|금지|말 것|않는다|필수|\bmust\b|\bnever\b|\bdo not\b|\bdon't\b)/i;
const HARD = /(반드시|절대|금지|\bmust\b|\bnever\b)/i;
const RULE_HEADING = /(rule|규칙|룰|금기|constraint|제약|guardrail)/i;

export function inventory(root, { top = 12 } = {}) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`디렉터리가 아닙니다: ${root}`);
  const files = listFiles(root);
  const byExt = {};
  const byTop = {};
  let totalLines = 0;
  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase() || '(none)';
    const text = readText(path.join(root, rel));
    const lines = text ? text.split('\n').length : 0;
    totalLines += lines;
    (byExt[ext] ||= { files: 0, lines: 0 });
    byExt[ext].files++; byExt[ext].lines += lines;
    const topDir = rel.includes('/') ? rel.split('/')[0] : '(root)';
    (byTop[topDir] ||= { files: 0, lines: 0 });
    byTop[topDir].files++; byTop[topDir].lines += lines;
  }
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].lines - a[1].lines).slice(0, top));

  const manifests = [];
  for (const rel of files) {
    const base = path.basename(rel);
    const full = path.join(root, rel);
    if (base === 'package.json' && !rel.includes('node_modules')) {
      try {
        const j = JSON.parse(readText(full));
        manifests.push({
          path: rel, kind: 'npm', name: j.name || null, engines: j.engines || null,
          scripts: j.scripts || {}, deps: Object.keys(j.dependencies || {}).sort(),
          devDeps: Object.keys(j.devDependencies || {}).sort(),
        });
      } catch { manifests.push({ path: rel, kind: 'npm', error: 'JSON 파싱 실패' }); }
    } else if (base === 'pyproject.toml') {
      const t = readText(full) || '';
      const req = /requires-python\s*=\s*"([^"]+)"/.exec(t)?.[1] || null;
      const deps = [...t.matchAll(/^\s*"([A-Za-z0-9_.\-\[\]]+)\s*[<>=~!]?[^"]*",?\s*$/gm)].map((m) => m[1]);
      manifests.push({ path: rel, kind: 'python', requiresPython: req, deps });
    } else if (base === 'requirements.txt' || base === 'go.mod' || base === 'Cargo.toml') {
      manifests.push({ path: rel, kind: base });
    }
  }

  const sdkHits = {};
  for (const m of manifests) {
    const hay = [...(m.deps || []), ...(m.devDeps || [])].join(' ');
    for (const [name, re] of LLM_SDKS) if (re.test(hay)) (sdkHits[name] ||= new Set()).add(m.path);
  }
  for (const rel of files) {
    if (!/\.(ts|tsx|js|mjs|py)$/.test(rel)) continue;
    const t = readText(path.join(root, rel)) || '';
    for (const [name, re] of LLM_SDKS) {
      if (name === 'vercel-ai') continue;
      if (re.test(t)) (sdkHits[name] ||= new Set()).add(rel);
    }
  }
  const llm = Object.fromEntries(Object.entries(sdkHits).map(([k, v]) => [k, [...v].slice(0, 8)]));

  const envKeys = [];
  for (const rel of files) {
    if (!/(^|\/)\.env\.(example|sample|template)$/.test(rel)) continue;
    const t = readText(path.join(root, rel)) || '';
    for (const m of t.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)) envKeys.push({ key: m[1], file: rel });
  }

  const docs = {
    claudeMd: files.filter((f) => /(^|\/)CLAUDE\.md$/.test(f)),
    agentsMd: files.filter((f) => /(^|\/)AGENTS\.md$/.test(f)),
    readme: files.filter((f) => /(^|\/)README(\.[a-z]+)?\.md$/i.test(f)).slice(0, 5),
    docsDir: files.filter((f) => f.startsWith('docs/')).length,
  };

  const constraints = [];
  for (const rel of [...docs.claudeMd, ...docs.agentsMd]) {
    const lines = (readText(path.join(root, rel)) || '').split('\n');
    let ruleSection = false;
    let fence = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('```')) { fence = !fence; return; }
      if (fence || !t) return;
      if (/^#{1,6}\s/.test(t)) { ruleSection = RULE_HEADING.test(t); return; }
      const bullet = /^[-*]\s|^\d+\.\s/.test(t);
      if (bullet && (ruleSection || STRONG.test(t))) {
        constraints.push({ id: `K${String(constraints.length + 1).padStart(2, '0')}`, text: t.replace(/^[-*]\s+|^\d+\.\s+/, '').slice(0, 220), file: rel, line: i + 1, hard: HARD.test(t), section: ruleSection ? 'rules' : 'other' });
      }
    });
  }

  const ci = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f));
  const testCommands = [];
  for (const m of manifests) for (const [k, v] of Object.entries(m.scripts || {})) if (/test|verify|check|lint|typecheck/.test(k)) testCommands.push({ manifest: m.path, script: k, cmd: v });

  return {
    root: path.resolve(root),
    git: gitInfo(root),
    files: { total: files.length, lines: totalLines, byExt: sortObj(byExt), byTop: sortObj(byTop) },
    manifests,
    llm,
    envKeys,
    docs,
    constraints,
    ci,
    tests: { commands: testCommands, testFiles: files.filter((f) => /(\.|_)(test|spec)\.[a-z]+$|(^|\/)tests?\//.test(f)).length },
  };
}

function gitInfo(root) {
  const g = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  const head = g('rev-parse', 'HEAD');
  if (head.status !== 0) return null;
  return {
    head: head.stdout.trim(),
    branch: g('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(),
    dirty: g('status', '--porcelain').stdout.trim().length > 0,
    remote: g('remote', 'get-url', 'origin').stdout.trim() || null,
    lastCommit: g('log', '-1', '--format=%cI %s').stdout.trim(),
  };
}

export function toMarkdown(inv) {
  const out = [`# inventory — ${inv.root}`, ''];
  if (inv.git) out.push(`git: \`${inv.git.branch}\` @ \`${inv.git.head.slice(0, 7)}\` ${inv.git.dirty ? '(변경 있음)' : ''} — ${inv.git.lastCommit}`, '');
  out.push(`파일 ${inv.files.total} · 줄 ${inv.files.lines}`, '');
  out.push(mdTable(['상위 디렉터리', '파일', '줄'], Object.entries(inv.files.byTop).map(([k, v]) => [k, v.files, v.lines])), '');
  out.push(mdTable(['매니페스트', '종류', 'engines', 'deps 수'], inv.manifests.map((m) => [m.path, m.kind, JSON.stringify(m.engines || m.requiresPython || '-'), (m.deps || []).length])), '');
  out.push(`LLM SDK: ${Object.keys(inv.llm).join(', ') || '없음'}`, '');
  out.push(`제약 문장 ${inv.constraints.length}개 (강제 ${inv.constraints.filter((c) => c.hard).length})`);
  return out.join('\n');
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  if (helpRequested(flags) || !_[0]) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  try {
    const inv = inventory(_[0], { top: Number(flags.top) || 12 });
    emit(flags.format === 'md' ? toMarkdown(inv) : inv, flags.format === 'md' ? 'md' : 'json');
  } catch (e) { fail(e.message, EXIT.PRECONDITION); }
}
