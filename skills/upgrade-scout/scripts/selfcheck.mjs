#!/usr/bin/env node
// selfcheck — 스킬 폴더가 스스로 정한 규칙을 지키는지 검사한다(네트워크 없음, 아무것도 쓰지 않음).
//   node selfcheck.mjs [--skill-dir <경로>] [--strict] [--format json|md]
// 오류는 항상 실패, 경고는 --strict일 때만 실패(종료 코드 1).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { ROLE_KEY } from './ledger.mjs';
import { listPacks, PACK_REQUIRED } from './lib/packs.mjs';

const HELP = `selfcheck.mjs [--skill-dir <경로>] [--strict] [--format json|md]
검사: frontmatter(skill-creator quick_validate 규칙 + 키트 관례) · SKILL.md 하나뿐 · 줄 수 ·
문서 속 경로가 실제로 있는지 · 고아 파일 · 팩 구조 · 레지스트리 id가 문서(references/sources.md · 팩 sources)에 있는지 ·
에이전트 브리프 ↔ 계약 스키마 ↔ ledger ROLE_KEY · 팩 질문셋 린트(라이브 기준) ·
JSON 파싱 · node --check · 스크립트마다 --help · evals 스키마 · 픽스처 크기·이름.`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SKILL_DIR = path.resolve(HERE, '..');

// skill-creator quick_validate.py와 같은 규칙.
export const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);
export const KIT_KEYS = new Set(['name', 'description']); // claude-sync-kit 스킬 관례
const EXCLUDED_ANY_DEPTH = new Set(['__pycache__', 'node_modules', '.git']);
const EXCLUDED_AT_ROOT = new Set(['evals']);
const TOP_DIRS = ['references', 'agents', 'assets', 'scripts', 'evals', 'packs'];
const MAX_LINES = 500;
const WARN_LINES = 350;
const MAX_FIXTURE_BYTES = 200 * 1024;
// 실행 환경이 따로 있는 파일(Workflow 런타임): 최상위 return이 있어 node --check를 통과하지 않는다.
const SKIP_NODE_CHECK = new Set(['assets/workflow.template.js']);

/* ─── frontmatter ─────────────────────────────────────── */

/** 최상위 `key: value`만 읽는 작은 YAML 부분 해석기. YAML이 거부할 모양은 problems에 적는다. */
export function parseFrontmatter(text) {
  const problems = [];
  if (!text.startsWith('---')) return { data: null, body: text, problems: ['frontmatter가 없다(첫 줄이 --- 가 아님)'] };
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { data: null, body: text, problems: ['frontmatter 닫는 --- 가 없다'] };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) { problems.push(`${i + 2}행: 들여쓴 줄이 키 밖에 있다`); continue; }
    const km = line.match(/^([A-Za-z0-9_-]+):(?:\s+(.*)|\s*)$/);
    if (!km) { problems.push(`${i + 2}행: "key: value" 모양이 아니다`); continue; }
    const key = km[1];
    let raw = (km[2] ?? '').trimEnd();
    if (key in data) problems.push(`키 ${key}가 두 번 나온다`);
    if (raw === '' || /^[|>][+-]?$/.test(raw)) {
      // 블록 스칼라 또는 중첩 매핑: 들여쓴 줄을 모은다.
      const block = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i]);
      const nonEmpty = block.filter((l) => l.trim());
      if (raw === '') data[key] = nonEmpty.length ? { nested: true } : null;
      else {
        const indent = Math.min(...nonEmpty.map((l) => l.match(/^\s*/)[0].length));
        const body = block.map((l) => l.slice(indent));
        data[key] = raw.startsWith('>') ? body.join(' ').replace(/\s+/g, ' ').trim() : body.join('\n').trim();
      }
      continue;
    }
    if (raw.startsWith('"')) {
      try { data[key] = JSON.parse(raw); } catch { problems.push(`${key}: 큰따옴표 문자열을 해석할 수 없다`); data[key] = raw; }
    } else if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) problems.push(`${key}: 작은따옴표 문자열이 닫히지 않았다`);
      data[key] = raw.slice(1, -1).replace(/''/g, "'");
    } else {
      if (/^[[{&*!%@`]/.test(raw)) problems.push(`${key}: 값이 YAML 특수 문자(${raw[0]})로 시작한다 — 따옴표로 감쌀 것`);
      if (/:\s/.test(raw)) problems.push(`${key}: 따옴표 없는 값에 ": "가 있다 — YAML이 거부한다`);
      if (/\s#/.test(raw)) problems.push(`${key}: 따옴표 없는 값에 " #"가 있다 — 그 뒤가 주석으로 잘린다`);
      data[key] = raw;
    }
  }
  return { data, body: text.slice(m[0].length), problems };
}

/* ─── 파일 목록 ───────────────────────────────────────── */

export function listSkillFiles(dir) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!EXCLUDED_ANY_DEPTH.has(e.name)) stack.push(r); }
      else if (e.isFile()) out.push(r);
    }
  }
  return out.sort();
}

const countsAsPackaged = (rel) => {
  const parts = rel.split('/').slice(0, -1);
  return !parts.some((p) => EXCLUDED_ANY_DEPTH.has(p)) && !(parts.length && EXCLUDED_AT_ROOT.has(parts[0]));
};

/** 백틱 안의 스킬 상대 경로. `<…>`·`{…}`·`…` 같은 자리표시 경로는 템플릿이라 뺀다. */
export function referencedPaths(markdown) {
  const found = new Set();
  const top = TOP_DIRS.join('|');
  for (const span of markdown.match(/`[^`\n]+`/g) || []) {
    const s = span.slice(1, -1);
    const re = new RegExp(`(?:\\$SKILL_DIR/|\\$S/(?=[a-z0-9-]+\\.mjs))?((?:${top})/[^\\s"'\`*()]*|[a-z0-9-]+\\.mjs)`, 'g');
    for (const m of s.matchAll(re)) {
      const full = m[0];
      let p = m[1];
      if (full.startsWith('$S/')) p = `scripts/${p}`;
      else if (!TOP_DIRS.some((d) => p.startsWith(`${d}/`))) continue; // 맨 이름.mjs는 $S/ 접두가 있을 때만
      if (/[<>{}…]/.test(p)) continue;
      p = p.replace(/[.,;:]+$/, '');
      found.add(p);
    }
  }
  return [...found];
}

/* ─── 검사 본체 ───────────────────────────────────────── */

export async function selfcheck(skillDir = DEFAULT_SKILL_DIR, { nodeCheck = true } = {}) {
  const errors = [];
  const warnings = [];
  const err = (check, message) => errors.push({ check, message });
  const warn = (check, message) => warnings.push({ check, message });
  const abs = (rel) => path.join(skillDir, rel);
  const read = (rel) => fs.readFileSync(abs(rel), 'utf8');
  const exists = (rel) => fs.existsSync(abs(rel));
  const stats = {};

  if (!exists('SKILL.md')) {
    err('skill-md', 'SKILL.md가 없다');
    return { ok: false, errors, warnings, stats };
  }
  const files = listSkillFiles(skillDir);
  stats.files = files.length;

  // 1) SKILL.md는 하나뿐, 픽스처 이름·크기
  const skillMds = files.filter((f) => /(^|\/)SKILL\.md$/.test(f) && countsAsPackaged(f));
  if (skillMds.length !== 1) err('single-skill-md', `SKILL.md가 ${skillMds.length}개: ${skillMds.join(', ')} — 픽스처는 *.fixture.md로`);
  for (const f of files) {
    if (f !== 'SKILL.md' && /(^|\/)skill\.md$/i.test(f)) err('single-skill-md', `${f}: 로더가 스킬로 읽을 수 있는 이름 — *.fixture.md로 바꿀 것`);
    if (f.startsWith('scripts/test/fixtures/')) {
      const size = fs.statSync(abs(f)).size;
      if (size > MAX_FIXTURE_BYTES) err('fixture-size', `${f}: ${Math.round(size / 1024)}KB > 200KB`);
    }
  }

  // 2) frontmatter
  const skillText = read('SKILL.md');
  const fm = parseFrontmatter(skillText);
  for (const p of fm.problems) err('frontmatter', p);
  const data = fm.data || {};
  for (const k of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(k)) err('frontmatter', `허용되지 않는 키 ${k} (허용: ${[...ALLOWED_KEYS].join(', ')})`);
    else if (!KIT_KEYS.has(k)) warn('frontmatter', `키 ${k} — 키트 관례는 name·description만`);
  }
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const desc = typeof data.description === 'string' ? data.description.trim() : '';
  if (!name) err('frontmatter', 'name이 없다');
  else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) err('frontmatter', `name "${name}"은 케밥 케이스(소문자·숫자·하이픈, 앞뒤·연속 하이픈 없음)여야 한다`);
    if ([...name].length > 64) err('frontmatter', `name이 ${[...name].length}자 > 64`);
    const dirName = path.basename(path.resolve(skillDir));
    if (name !== dirName) err('frontmatter', `name "${name}" ≠ 폴더 이름 "${dirName}"`);
  }
  if (!desc) err('frontmatter', 'description이 없다');
  else {
    const len = [...desc].length;
    stats.descriptionChars = len;
    if (len > 1024) err('frontmatter', `description ${len}자 > 1024`);
    if (/[<>]/.test(desc)) err('frontmatter', 'description에 꺾쇠(< >)가 있다');
    if (len > 900) warn('frontmatter', `description ${len}자 — 1024 한도에 가깝다`);
  }
  if (data.compatibility && typeof data.compatibility === 'string' && [...data.compatibility].length > 500) err('frontmatter', 'compatibility > 500자');

  // 3) 줄 수
  const lineCount = skillText.split(/\r?\n/).length;
  stats.skillMdLines = lineCount;
  if (lineCount > MAX_LINES) err('length', `SKILL.md ${lineCount}줄 > ${MAX_LINES} — 상세는 references로`);
  else if (lineCount > WARN_LINES) warn('length', `SKILL.md ${lineCount}줄 > ${WARN_LINES}`);

  // 4) 문서 속 경로가 실제로 있는지 + 고아 파일
  const docs = files.filter((f) => f === 'SKILL.md' || /^(agents|references)\/[^/]+\.md$/.test(f) || /^packs\/[^/]+\/[^/]+\.md$/.test(f));
  const mentioned = new Set();
  let refCount = 0;
  for (const d of docs) {
    for (const p of referencedPaths(read(d))) {
      refCount++;
      mentioned.add(p.replace(/\/$/, ''));
      const target = abs(p);
      if (!fs.existsSync(target)) err('paths', `${d}: \`${p}\`가 없다`);
      else if (p.endsWith('/') && !fs.statSync(target).isDirectory()) err('paths', `${d}: \`${p}\`는 폴더가 아니다`);
    }
  }
  stats.pathRefs = refCount;
  const docText = docs.map(read).join('\n');
  for (const f of files) {
    if (f === 'SKILL.md' || f.startsWith('scripts/test/')) continue; // 테스트·픽스처는 글롭으로 안내된다
    if (!mentioned.has(f) && !docText.includes(f)) err('orphans', `${f}: SKILL.md·agents·references 어디에도 안 나온다`);
  }
  if (!files.some((f) => /^scripts\/test\/.+\.test\.mjs$/.test(f))) warn('tests', 'scripts/test/*.test.mjs가 없다');

  // 5) JSON 파싱
  const json = {};
  for (const f of files.filter((f) => f.endsWith('.json') && !f.startsWith('scripts/test/fixtures/'))) {
    try { json[f] = JSON.parse(read(f)); } catch (e) { err('json', `${f}: ${e.message}`); }
  }

  // 6) 팩 구조 + 레지스트리 id ↔ 문서 (코어: assets/registry/*.json ↔ references/sources.md, 팩: packs/<p>/<registry> ↔ packs/<p>/<sources_doc>)
  const packs = listPacks(skillDir);
  stats.packs = packs.map((p) => p.name);
  const registryPairs = files.filter((f) => /^assets\/registry\/[^/]+\.json$/.test(f)).map((f) => [f, 'references/sources.md']);
  for (const p of packs) {
    const rel = (x) => `packs/${path.basename(p.dir)}/${x}`;
    for (const k of PACK_REQUIRED) if (!p.raw[k]) err('pack', `${rel('pack.md')}: 필수 키 ${k}가 없다`);
    if (!p.triggerUrls.length && !p.triggerKeywords.length) err('pack', `${rel('pack.md')}: triggers.urls·keywords가 비어 있다`);
    if (p.name !== path.basename(p.dir)) err('pack', `${rel('pack.md')}: name "${p.name}" ≠ 폴더 "${path.basename(p.dir)}"`);
    for (const x of [p.lens, p.addendum, p.registry, p.sourcesDoc, p.qsetDir, p.qsetLint, p.criteria, p.contractExt].filter(Boolean)) if (!exists(rel(x))) err('pack', `${rel('pack.md')}: ${rel(x)}가 없다`);
    if (p.registry) registryPairs.push([rel(p.registry), p.sourcesDoc ? rel(p.sourcesDoc) : rel('pack.md')]);
  }
  let sourceIds = 0;
  for (const [f, docRel] of registryPairs) {
    const reg = json[f];
    if (!reg) continue;
    const doc = exists(docRel) ? read(docRel) : '';
    if (!Array.isArray(reg.sources)) { err('registry', `${f}: sources 배열이 없다`); continue; }
    const seen = new Set();
    for (const s of reg.sources) {
      sourceIds++;
      if (!s.id) { err('registry', `${f}: id 없는 소스`); continue; }
      if (seen.has(s.id)) err('registry', `${f}: id ${s.id} 중복`);
      seen.add(s.id);
      if (!doc.includes(s.id)) err('registry', `${f}: 소스 ${s.id}가 ${docRel}에 없다`);
    }
  }
  stats.registrySources = sourceIds;

  // 7) 에이전트 브리프 ↔ 계약 스키마 ↔ ROLE_KEY
  const briefs = files.filter((f) => /^agents\/[^/_][^/]*\.md$/.test(f)).map((f) => path.basename(f, '.md'));
  const schemas = files.filter((f) => /^assets\/contracts\/[^/]+\.schema\.json$/.test(f)).map((f) => path.basename(f, '.schema.json')).filter((r) => r !== 'envelope');
  stats.roles = briefs.length;
  if (!exists('agents/_preamble.md')) err('agents', 'agents/_preamble.md가 없다');
  for (const role of briefs) {
    const text = read(`agents/${role}.md`);
    const schemaRel = `assets/contracts/${role}.schema.json`;
    if (!text.includes(schemaRel)) err('agents', `agents/${role}.md가 자기 계약 ${schemaRel}을 적지 않았다`);
    if (!exists(schemaRel)) { err('agents', `${schemaRel}가 없다`); continue; }
    const key = ROLE_KEY[role];
    if (!key) { err('agents', `ledger.mjs ROLE_KEY에 ${role}이 없다`); continue; }
    if (!new RegExp(`페이로드 키 \`${key}\``).test(text)) err('agents', `agents/${role}.md의 페이로드 키가 ROLE_KEY(${key})와 다르다`);
    const sch = json[schemaRel];
    if (sch && !(sch.required || []).includes(key)) err('agents', `${schemaRel}의 required에 ${key}가 없다`);
  }
  for (const role of schemas) if (!briefs.includes(role)) err('agents', `assets/contracts/${role}.schema.json에 맞는 agents/${role}.md가 없다`);
  for (const role of Object.keys(ROLE_KEY)) if (!briefs.includes(role)) err('agents', `ROLE_KEY의 ${role}에 브리프가 없다`);

  // 8) 팩 질문셋 — 팩이 알려 준 린터(qset_lint 모듈의 lintRequest)로 라이브 기준 린트, 모델 버전 고정
  let qsets = 0;
  for (const p of packs.filter((p) => p.qsetDir)) {
    const base = `packs/${path.basename(p.dir)}`;
    let lintRequest = null;
    if (p.qsetLint && exists(`${base}/${p.qsetLint}`)) {
      try { ({ lintRequest } = await import(pathToFileURL(abs(`${base}/${p.qsetLint}`)).href)); } catch (e) { err('pack', `${base}/${p.qsetLint}: 불러올 수 없다 — ${e.message}`); }
    }
    for (const f of files.filter((f) => f.startsWith(`${base}/${p.qsetDir}/`) && f.endsWith('.json'))) {
      const q = json[f];
      if (!q) continue;
      if (!q.model || /latest|preview/.test(q.model)) err('qset', `${f}: 모델을 버전으로 고정해야 한다(받은 값 ${q.model ?? '없음'})`);
      const groups = [];
      const collect = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.questions && typeof o.questions === 'object' && !Array.isArray(o.questions)) groups.push(o.questions);
        for (const v of Object.values(o)) if (v !== o.questions) collect(v);
      };
      collect(q);
      if (!groups.length) err('qset', `${f}: questions가 없다`);
      for (const questions of groups) {
        qsets++;
        if (!lintRequest) continue;
        const res = lintRequest({ id: f, model: q.model, state: 'selfcheck placeholder state in plain English', questions }, { live: true });
        for (const i of res.issues.filter((i) => i.level === 'error')) err('qset', `${f}${i.qid ? ` · ${i.qid}` : ''}: ${i.code} ${i.msg}`);
      }
    }
  }
  stats.questionGroups = qsets;

  // 9) node --check
  if (nodeCheck) {
    const code = files.filter((f) => /\.(mjs|cjs|js)$/.test(f) && !SKIP_NODE_CHECK.has(f));
    for (const f of code) {
      const r = spawnSync(process.execPath, ['--check', abs(f)], { encoding: 'utf8' });
      if (r.status !== 0) err('syntax', `${f}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'node --check 실패'}`);
    }
    stats.syntaxChecked = code.length;
    // SKILL.md가 “모든 스크립트에 --help가 있다”고 약속한다.
    for (const f of files.filter((f) => /^scripts\/[^/]+\.mjs$/.test(f) || /^packs\/[^/]+\/scripts\/[^/]+\.mjs$/.test(f))) {
      const r = spawnSync(process.execPath, [abs(f), '--help'], { encoding: 'utf8', env: { ...process.env, UPGRADE_SCOUT_OFFLINE: '1' }, timeout: 10_000 });
      if (r.status !== 0 || !r.stdout.trim()) err('help', `${f} --help: 종료 코드 ${r.status}${r.stdout.trim() ? '' : ' · 출력 없음'}`);
    }
  }
  if (exists('assets/workflow.template.js') && !/export const meta = \{/.test(read('assets/workflow.template.js'))) err('workflow', 'assets/workflow.template.js 첫 부분에 export const meta = { … }가 없다');

  // 10) evals
  const ev = json['evals/evals.json'];
  if (!exists('evals/evals.json')) warn('evals', 'evals/evals.json이 없다');
  else if (ev) {
    if (ev.skill_name !== name) err('evals', `evals.json skill_name "${ev.skill_name}" ≠ ${name}`);
    if (!Array.isArray(ev.evals) || !ev.evals.length) err('evals', 'evals 배열이 비었다');
    const ids = new Set();
    for (const [i, e] of (ev.evals || []).entries()) {
      const at = `evals[${i}]`;
      if (!Number.isInteger(e.id)) err('evals', `${at}.id는 정수여야 한다`);
      else if (ids.has(e.id)) err('evals', `${at}.id ${e.id} 중복`);
      ids.add(e.id);
      if (typeof e.prompt !== 'string' || !e.prompt.trim()) err('evals', `${at}.prompt가 비었다`);
      if (typeof e.expected_output !== 'string' || !e.expected_output.trim()) err('evals', `${at}.expected_output이 비었다`);
      if (e.files !== undefined && (!Array.isArray(e.files) || e.files.some((p) => typeof p !== 'string' || !exists(p)))) err('evals', `${at}.files는 스킬 루트 기준으로 있는 경로 목록이어야 한다`);
      if (!Array.isArray(e.expectations) || !e.expectations.length || e.expectations.some((x) => typeof x !== 'string' || !x.trim())) err('evals', `${at}.expectations는 비지 않은 문자열 목록이어야 한다`);
    }
    stats.evals = (ev.evals || []).length;
  }
  const tq = json['evals/trigger-queries.json'];
  if (!exists('evals/trigger-queries.json')) warn('evals', 'evals/trigger-queries.json이 없다');
  else if (tq) {
    if (!Array.isArray(tq)) err('evals', 'trigger-queries.json은 배열이어야 한다');
    else {
      const seen = new Set();
      for (const [i, q] of tq.entries()) {
        if (typeof q.query !== 'string' || !q.query.trim()) err('evals', `trigger-queries[${i}].query가 비었다`);
        if (typeof q.should_trigger !== 'boolean') err('evals', `trigger-queries[${i}].should_trigger는 true/false`);
        if (seen.has(q.query)) err('evals', `trigger-queries[${i}] 질의 중복`);
        seen.add(q.query);
      }
      const pos = tq.filter((q) => q.should_trigger === true).length;
      const neg = tq.filter((q) => q.should_trigger === false).length;
      stats.triggerQueries = { should: pos, shouldNot: neg };
      if (pos < 8 || neg < 8) warn('evals', `트리거 질의 균형: 트리거 ${pos} · 근접 오탐 ${neg} (각 8개 이상 권장)`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

function toMd(res, strict) {
  const pass = res.ok && !(strict && res.warnings.length);
  const out = [`# selfcheck — ${pass ? '통과' : '실패'}`, '', mdTable(['항목', '값'], Object.entries(res.stats).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))];
  if (res.errors.length) out.push('', '## 오류', '', mdTable(['검사', '내용'], res.errors.map((e) => [e.check, e.message])));
  if (res.warnings.length) out.push('', `## 경고${strict ? '(--strict: 실패로 침)' : ''}`, '', mdTable(['검사', '내용'], res.warnings.map((e) => [e.check, e.message])));
  return out.join('\n');
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2), { bool: ['strict', 'help', 'h', 'no-node-check'] });
  if (helpRequested(flags)) { emit(HELP, 'text'); process.exit(EXIT.OK); }
  const dir = flags['skill-dir'] ? path.resolve(String(flags['skill-dir'])) : DEFAULT_SKILL_DIR;
  if (!fs.existsSync(dir)) fail(`폴더가 없습니다: ${dir}`);
  const res = await selfcheck(dir, { nodeCheck: !flags['no-node-check'] });
  const strict = !!flags.strict;
  if ((flags.format || 'json') === 'md') emit(toMd(res, strict), 'text');
  else emit({ ...res, strict, pass: res.ok && !(strict && res.warnings.length) });
  process.exit(res.ok && !(strict && res.warnings.length) ? EXIT.OK : EXIT.FINDINGS);
}
