#!/usr/bin/env node
// feature-probe — "있는 줄 알았던 기능"의 존재 검증(assume)과 리포 × 키워드 부재 증명 매트릭스(matrix).
//   node feature-probe.mjs assume <repo> --spec spec.json | --terms "a,b,c" [--id name]
//   node feature-probe.mjs matrix --repos name=/path,name2=/path2 --terms "a,b" | --keywords k.json [--format md]
// spec.json: [{ "id": "tv-search", "label": "TradingView 스크립트 검색", "patterns": ["search_scripts", "query_corpus"] }]
// 패턴은 대소문자 무시 정규식. 결과는 검색 공간(패턴·훑은 파일 수)을 함께 남긴다 — 부재 주장의 근거.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { listFiles, readText, lineIndex, CODE_EXT, isTestPath, isDocPath } from './lib/walk.mjs';

const HELP = `feature-probe.mjs assume <repo> (--spec f.json | --terms "a,b" [--id x])
feature-probe.mjs matrix --repos n=/p,... (--terms "a,b" | --keywords k.json) [--format md]
분류: implemented(코드에 있음) · claimed-only(문서·프롬프트에만) · absent(어디에도 없음).`;

function compile(patterns) {
  return patterns.map((p) => new RegExp(p, 'gi'));
}

/** 한 저장소에서 패턴 묶음을 찾는다. */
export function probeRepo(root, patterns, { maxSamples = 3 } = {}) {
  const res = compile(patterns);
  const files = listFiles(root);
  const cell = { implFiles: 0, docMentions: 0, testFiles: 0, otherFiles: 0, samples: [], filesScanned: files.length };
  for (const rel of files) {
    const text = readText(path.join(root, rel));
    if (text === null) continue;
    let hitOffset = -1;
    for (const re of res) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) { hitOffset = m.index; break; }
    }
    if (hitOffset < 0) continue;
    const ext = path.extname(rel).toLowerCase();
    let kind;
    if (isTestPath(rel)) { cell.testFiles++; kind = 'test'; }
    else if (isDocPath(rel) || /(^|\/)prompts?\//.test(rel)) { cell.docMentions++; kind = 'doc'; }
    else if (CODE_EXT.has(ext)) { cell.implFiles++; kind = 'impl'; }
    else { cell.otherFiles++; kind = 'other'; }
    if (cell.samples.length < maxSamples || (kind === 'impl' && !cell.samples.some((s) => s.kind === 'impl'))) {
      const line = lineIndex(text)(hitOffset);
      const snippet = text.split('\n')[line - 1].trim().slice(0, 140);
      const sample = { ref: `${rel}:${line}`, kind, snippet };
      if (cell.samples.length >= maxSamples) cell.samples[cell.samples.length - 1] = sample; else cell.samples.push(sample);
    }
  }
  cell.class = cell.implFiles > 0 ? 'implemented' : cell.docMentions + cell.otherFiles + cell.testFiles > 0 ? 'claimed-only' : 'absent';
  return cell;
}

export function assume(root, specs) {
  return specs.map((s) => {
    const cell = probeRepo(root, s.patterns);
    const status = cell.class === 'implemented' ? 'present' : cell.class === 'claimed-only' ? 'partial' : 'absent';
    return {
      id: s.id, label: s.label || s.id, status,
      note: status === 'partial' ? '문서·프롬프트·설정에만 언급 — 코드 구현 없음' : status === 'absent' ? '검색 공간 전체에서 0건' : '코드에 구현 흔적 있음(파일 열어 단위 확인 필요)',
      hits: cell.samples,
      counts: { implFiles: cell.implFiles, docMentions: cell.docMentions, testFiles: cell.testFiles, otherFiles: cell.otherFiles },
      searched: { patterns: s.patterns, filesScanned: cell.filesScanned, root: path.resolve(root) },
    };
  });
}

export function matrix(repos, keywords) {
  const rows = [];
  for (const [name, root] of repos) {
    const cells = {};
    for (const k of keywords) cells[k.id] = probeRepo(root, k.patterns);
    rows.push({ repo: name, path: path.resolve(root), cells });
  }
  return { keywords: keywords.map((k) => k.id), rows };
}

export function matrixMarkdown(m) {
  const header = ['리포', ...m.keywords];
  const body = m.rows.map((r) => [r.repo, ...m.keywords.map((k) => {
    const c = r.cells[k];
    return `${c.implFiles}/${c.docMentions}${c.class === 'implemented' ? '' : c.class === 'claimed-only' ? ' (문서만)' : ' —'}`;
  })]);
  return `${mdTable(header, body)}\n\n셀 = 구현 파일 수 / 문서·프롬프트 언급 파일 수. 테스트 파일은 따로 센다.`;
}

function loadSpecs(flags) {
  if (flags.spec) return JSON.parse(fs.readFileSync(flags.spec, 'utf8'));
  if (flags.keywords) return JSON.parse(fs.readFileSync(flags.keywords, 'utf8'));
  if (flags.terms) {
    const terms = String(flags.terms).split(',').map((t) => t.trim()).filter(Boolean);
    if (flags.id) return [{ id: flags.id, patterns: terms.map(escapeRe) }];
    return terms.map((t) => ({ id: t, patterns: [escapeRe(t)] }));
  }
  fail('--spec, --keywords 또는 --terms가 필요합니다');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const [cmd, repo] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (cmd === 'assume') {
    if (!repo || !fs.existsSync(repo)) fail('대상 저장소 경로가 필요합니다', EXIT.PRECONDITION);
    const out = assume(repo, loadSpecs(flags));
    emit(out);
    process.exit(out.some((o) => o.status !== 'present') ? EXIT.FINDINGS : EXIT.OK);
  } else if (cmd === 'matrix') {
    if (!flags.repos) fail('--repos name=/path,... 가 필요합니다');
    const repos = String(flags.repos).split(',').map((p) => { const i = p.indexOf('='); return i > 0 ? [p.slice(0, i), p.slice(i + 1)] : [path.basename(p), p]; });
    for (const [, p] of repos) if (!fs.existsSync(p)) fail(`경로 없음: ${p}`, EXIT.PRECONDITION);
    const m = matrix(repos, loadSpecs(flags));
    emit(flags.format === 'md' ? matrixMarkdown(m) : m, flags.format === 'md' ? 'md' : 'json');
  } else fail(`알 수 없는 명령: ${cmd}`);
}
