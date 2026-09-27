#!/usr/bin/env node
// plugin-scout — 플러그인·스킬·MCP 후보를 한 형식으로 모으고(normalize), 받아 둔 폴더를 설치 없이 훑는다(scan-local).
//   node plugin-scout.mjs normalize <inputs…> [--needs needs.json] [--installed list.json] [--format md]
//     inputs: SearchPlugins·SearchSkills 결과 JSON · `claude plugin list --json --available` 출력 · marketplace.json
//   node plugin-scout.mjs scan-local <plugin-or-repo-dir> [--format md]
// 판정은 “기계 제안”이다. 설치·활성화·마켓 추가는 이 스크립트가 절대 하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { parseMarketplaceJson } from './lib/parsers.mjs';
import { listFiles, readText } from './lib/walk.mjs';

const HELP = `plugin-scout.mjs normalize <inputs…> [--needs n.json] [--installed l.json] | scan-local <dir>
훅·MCP·bin·스킬 문구를 정적으로 훑어 위험 신호를 적는다. 네트워크·실행 없음.`;

/* ─── 로컬 신호(네트워크 없는 사전 선별) ─────────────── */
export const SIGNALS = [
  { kind: 'network', re: /\b(curl|wget|fetch\(|axios|requests\.(get|post)|urllib|XMLHttpRequest|net\.connect)\b|https?:\/\/(?!localhost|127\.0\.0\.1)/ },
  { kind: 'exec', re: /\b(child_process|execSync|spawnSync|spawn\(|exec\(|subprocess|os\.system|eval\(|bash -c|sh -c|shell=True)\b/ },
  { kind: 'secrets', re: /(\.env\b|API_KEY|SECRET|TOKEN\b|PASSWORD|id_rsa|\.ssh\/|keychain|credential)/i },
  { kind: 'global-config-write', re: /(~\/\.claude\/settings\.json|\.claude\/settings\.json|\.codex\/hooks\.json|~\/\.config\/)/ },
  { kind: 'unpinned-npx', re: /\bnpx\s+(?:-y\s+|--yes\s+)?(?:--[\w-]+(?:=\S+)?\s+)*(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)(?![\w./-]*@\d)(?=\s|$|["'`])/i },
  { kind: 'release-age-bypass', re: /--min-release-age=0/ },
  { kind: 'injection-words', re: /(EXTREMELY[_ ]IMPORTANT|IGNORE (ALL|PREVIOUS)|you must always|do not tell the user|without asking the user)/i },
  { kind: 'auto-trigger', re: /(after every|without being asked|automatically after|on every (git )?clone)/i },
  // make는 명령 모양(줄 머리·따옴표·백틱·셸 연산자 뒤 + 타깃 하나 + 끝)일 때만 — 산문의 “make possible”은 신호가 아니다.
  { kind: 'runs-project-scripts', re: /(\.\/scripts\/[\w.-]+\.sh|npm (run )?test\b|pnpm test\b|(?:^\s*(?:\$\s*)?|[`"';&|]\s*)make(?:\s+-{1,2}[\w=-]+)*(?:\s+[\w.-]+)?\s*(?=$|[`"';&|]))/m },
];

const HOOK_RISK = {
  SessionStart: '세션마다 실행 · 맥락 주입 가능',
  UserPromptSubmit: '프롬프트마다 실행',
  PreToolUse: '도구 호출마다 실행 · 거부 가능',
  PostToolUse: '도구 결과마다 실행 · 결과 외부 전송 가능',
  Stop: '턴 끝마다 실행 · 에이전트를 되돌릴 수 있음',
  SubagentStop: '서브에이전트 끝마다 실행',
  InstructionsLoaded: '지침 파일을 읽을 때마다 실행',
  Notification: '알림마다 실행',
};

function scanText(rel, text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const s of SIGNALS) if (s.re.test(line)) out.push({ file: rel, line: i + 1, kind: s.kind, snippet: line.trim().slice(0, 160) });
  });
  return out;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** 받아 둔 플러그인·리포 폴더를 훑는다 — 설치하지 않고 매니페스트·훅·MCP·bin·스킬 문구만 읽는다. */
export function scanLocal(dir) {
  const root = path.resolve(dir);
  const plugin = readJson(path.join(root, '.claude-plugin', 'plugin.json'));
  const market = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  const res = { root, manifests: { plugin: plugin ? { name: plugin.name, version: plugin.version || null, license: plugin.license || null, author: plugin.author?.name || plugin.author || null } : null, marketplace: null }, hooks: [], mcp: [], bin: [], skills: [], signals: [], notes: [] };
  if (market) {
    const legacy = Boolean(market.marketplace && !market.plugins);
    const m = legacy ? market.marketplace : market;
    res.manifests.marketplace = { name: m.name || null, owner: m.owner?.name || m.author || null, legacy, plugins: parseMarketplaceJson(market).map((p) => `${p.name}${p.version ? '@' + p.version : ''}`) };
    if (legacy) res.notes.push({ kind: 'legacy-manifest', note: '옛 형식 marketplace.json(최상위 "marketplace") — 현행 Claude Code에서 검증 실패 가능' });
    // 자기 자신을 가리키는 항목(source "./")의 이름이 plugin.json과 다르면 포크가 원본 발행 정보를 그대로 둔 것이다.
    const self = legacy ? [] : parseMarketplaceJson(market).filter((p) => ['./', '.', ''].includes(String(p.source ?? '').trim()));
    if (plugin && self.length && !self.some((p) => p.name === plugin.name)) res.notes.push({ kind: 'publisher-mismatch', note: `plugin.json 이름 ${plugin.name} ≠ marketplace의 자기 항목 ${self.map((p) => p.name).join(', ')}${res.manifests.marketplace.owner ? ` (owner ${res.manifests.marketplace.owner})` : ''}` });
  }
  const hooksFile = [path.join(root, 'hooks', 'hooks.json'), path.join(root, '.claude-plugin', 'hooks.json')].find((p) => fs.existsSync(p));
  const hooksDecl = hooksFile ? readJson(hooksFile) : plugin?.hooks && typeof plugin.hooks === 'object' ? plugin.hooks : null;
  if (hooksDecl) {
    if (Array.isArray(hooksDecl)) res.notes.push({ kind: 'legacy-hooks', note: 'hooks.json이 평평한 배열 — 현행 형식은 이벤트 이름을 키로 쓴다' });
    const events = Array.isArray(hooksDecl) ? [] : Object.entries(hooksDecl.hooks || hooksDecl).filter(([, v]) => Array.isArray(v));
    for (const [event, groups] of events) {
      for (const g of groups) {
        for (const h of g.hooks || [g]) {
          const cmd = h.command || h.module || '';
          const sig = scanText(path.relative(root, hooksFile || root), cmd).map((s) => s.kind);
          res.hooks.push({ event, matcher: g.matcher || null, command: String(cmd).slice(0, 200), risk: HOOK_RISK[event] || '이벤트마다 실행', signals: [...new Set(sig)] });
        }
      }
    }
    if (hooksDecl.modules) res.hooks.push({ event: 'function-hooks', command: JSON.stringify(hooksDecl.modules).slice(0, 200), risk: '얼리 액세스 함수 훅 — 세션 상태를 바꿀 수 있음', signals: [] });
  }
  const mcpDecl = readJson(path.join(root, '.mcp.json')) || (plugin?.mcpServers ? { mcpServers: plugin.mcpServers } : null);
  for (const [name, s] of Object.entries(mcpDecl?.mcpServers || {})) {
    const args = (s.args || []).join(' ');
    const remote = Boolean(s.url);
    const pinned = remote ? null : !(/\bnpx\b|\buvx\b/.test(s.command || '')) || /@\d/.test(args);
    res.mcp.push({ name, kind: remote ? 'remote' : 'stdio', target: remote ? s.url : `${s.command || ''} ${args}`.trim().slice(0, 160), pinned });
  }
  let files = [];
  try { files = listFiles(root); } catch { files = []; }
  for (const rel of files) {
    const abs = path.join(root, rel);
    const isBin = rel.startsWith('bin/');
    const isSkillText = /(^|\/)skills\/.+\.md$/i.test(rel) || /(^|\/)SKILL\.md$/.test(rel);
    const isScript = /(^|\/)(hooks|scripts)\/[^/]+$/.test(rel) && !rel.endsWith('.json');
    if (!isBin && !isSkillText && !isScript) continue;
    const text = readText(abs);
    if (text === null) continue;
    if (isBin) res.bin.push(rel);
    if (isSkillText) {
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      res.skills.push({ path: rel, name: fm ? (/^name:\s*(.+)$/m.exec(fm[1]) || [])[1] || null : null, allowedTools: fm ? /allowed-tools:/.test(fm[1]) : false, shellInjection: /!`[^`]+`/.test(text) });
    }
    res.signals.push(...scanText(rel, text));
  }
  const kinds = new Set(res.signals.map((s) => s.kind).concat(res.hooks.flatMap((h) => h.signals)));
  res.summary = { hooks: res.hooks.length, mcp: res.mcp.length, remote_mcp: res.mcp.filter((m) => m.kind === 'remote').length, unpinned_mcp: res.mcp.filter((m) => m.pinned === false).length, bin: res.bin.length, skills: res.skills.length, signal_kinds: [...kinds].sort() };
  res.suggestion = suggest({ hooks: res.hooks.length, kinds, remote: res.summary.remote_mcp, unpinned: res.summary.unpinned_mcp, notes: res.notes.map((n) => n.kind) });
  return res;
}

/** 기계 제안 — 사람이 매니페스트·훅을 읽고 최종 판정한다. */
export function suggest({ tier = null, reach = null, hooks = 0, kinds = new Set(), remote = 0, unpinned = 0, notes = [] }) {
  const why = [];
  if (hooks && (kinds.has('runs-project-scripts') || kinds.has('global-config-write') || kinds.has('injection-words'))) { why.push('훅이 프로젝트 스크립트 실행·전역 설정 쓰기·주입 문구 중 하나를 가짐'); return { verdict: 'hold', why, label: '기계 제안' }; }
  if (notes.includes('publisher-mismatch')) { why.push('plugin.json과 marketplace.json의 발행자가 다름'); return { verdict: 'hold', why, label: '기계 제안' }; }
  if (reach === 'privileged') { why.push('privileged 도달 범위'); return { verdict: 'hold', why, label: '기계 제안' }; }
  if (hooks) { why.push(`훅 ${hooks}개 — 사용자 권한으로 셸 실행`); return { verdict: tier === 'anthropic' ? 'assess' : 'hold', why, label: '기계 제안' }; }
  let verdict = tier === 'anthropic' ? 'adopt' : 'assess';
  if (remote || reach === 'remote') { why.push('원격 MCP — 질의가 외부로 나감'); verdict = verdict === 'adopt' ? 'trial' : verdict; }
  if (unpinned || kinds.has('unpinned-npx') || kinds.has('release-age-bypass')) { why.push('버전이 고정되지 않은 npx/uvx'); verdict = 'assess'; }
  if (kinds.has('auto-trigger')) { why.push('스킬이 묻지 않고 자동 실행을 지시'); verdict = 'assess'; }
  if (notes.includes('legacy-manifest')) { why.push('옛 형식 매니페스트 — 아이디어만'); verdict = 'assess'; }
  if (!why.length) why.push(tier === 'anthropic' ? 'Anthropic 발행 · 훅·원격 없음' : '훅·원격 없음 — 필요 적합도로 판단');
  return { verdict, why, label: '기계 제안' };
}

/* ─── normalize ─────────────────────────────────────── */
function fromSearch(data, kindHint) {
  return (data.results || []).map((r) => {
    const comps = {};
    for (const c of r.components || []) comps[c.type] = (comps[c.type] || 0) + 1;
    const hooks = comps.hook || 0;
    return {
      id: `${kindHint}:${r.marketplace_name || 'catalog'}/${r.display_name || r.name}`,
      kind: kindHint, name: r.display_name || r.name, source: `SearchPlugins · ${r.marketplace_display_name || r.marketplace_name || ''}`.trim(),
      publisher: { tier: r.publisher?.tier || null, name: r.author?.name || r.publisher?.name || null }, reach: r.reach || null,
      components: { skills: comps.skill || 0, commands: comps.command || 0, agents: comps.agent || 0, hooks, mcp: comps.mcp_server || 0 },
      hook_events: (r.components || []).filter((c) => c.type === 'hook').map((c) => c.name),
      upstream: r.upstream?.repo_url || null, version: r.authored_version || null, description: r.description || '', install_count: r.install_count ?? null,
      install_cmd: null,
    };
  });
}

function fromCliList(data) {
  return (data.available || []).map((p) => ({ id: `plugin:${p.pluginId || `${p.name}@${p.marketplaceName}`}`, kind: 'plugin', name: p.name, source: `claude plugin list · ${p.marketplaceName}`, publisher: { tier: null, name: null }, reach: null, components: null, upstream: typeof p.source === 'string' ? p.source : null, version: p.version || null, description: p.description || '', install_count: p.installCount ?? null, install_cmd: `claude plugin install ${p.name}@${p.marketplaceName}` }));
}

function fromMarketplace(data, file) {
  return parseMarketplaceJson(data).map((p) => ({ id: `plugin:${p.name}@${p.marketplace}`, kind: 'plugin', name: p.name, source: `marketplace.json · ${path.basename(path.dirname(path.dirname(file)))}`, publisher: { tier: null, name: data.owner?.name || null }, reach: null, components: null, upstream: p.source, version: p.version, description: p.description, install_count: null, install_cmd: p.marketplace ? `claude plugin install ${p.name}@${p.marketplace}` : null, legacy_manifest: p.legacy }));
}

export function normalize(inputs, { needs = [], installed = [] } = {}) {
  const all = [];
  for (const { file, data } of inputs) {
    if (Array.isArray(data?.results)) all.push(...fromSearch(data, /skill/i.test(path.basename(file)) ? 'skill' : 'plugin'));
    else if (Array.isArray(data?.available) || Array.isArray(data?.installed)) all.push(...fromCliList(data));
    else if (data?.plugins || data?.marketplace) all.push(...fromMarketplace(data, file));
  }
  const byKey = new Map();
  for (const c of all) {
    const k = `${c.kind}:${c.name.toLowerCase()}`;
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== undefined)), source: `${prev.source}; ${c.source}` } : c);
  }
  const have = new Set(installed.map((n) => String(n).toLowerCase()));
  return [...byKey.values()].map((c) => {
    const hay = `${c.name} ${c.description}`.toLowerCase();
    const needs_hit = needs.filter((n) => (n.keywords || []).some((kw) => hay.includes(String(kw).toLowerCase()))).map((n) => n.id);
    const s = suggest({ tier: c.publisher?.tier, reach: c.reach, hooks: c.components?.hooks || 0, remote: c.components?.mcp && c.reach === 'remote' ? 1 : 0, notes: c.legacy_manifest ? ['legacy-manifest'] : [] });
    return { ...c, installed: have.has(c.name.toLowerCase()), needs_hit, suggestion: needs.length && !needs_hit.length && s.verdict !== 'hold' ? { verdict: 'hold', why: ['필요 목록과 겹치는 키워드 없음'], label: '기계 제안' } : s };
  }).sort((a, b) => ['adopt', 'trial', 'assess', 'hold'].indexOf(a.suggestion.verdict) - ['adopt', 'trial', 'assess', 'hold'].indexOf(b.suggestion.verdict) || a.name.localeCompare(b.name));
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = _;
  if (helpRequested(flags) || !cmd) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (cmd === 'scan-local') {
    if (!rest[0] || !fs.existsSync(rest[0])) fail('폴더 경로가 필요합니다', EXIT.PRECONDITION);
    const r = scanLocal(rest[0]);
    if (flags.format === 'md') emit([`# scan-local — ${r.root}`, '', `제안: **${r.suggestion.verdict}** (${r.suggestion.why.join('; ')}) — ${r.suggestion.label}`, '', mdTable(['이벤트', '명령', '위험', '신호'], r.hooks.map((h) => [h.event, h.command, h.risk, h.signals.join(' ')])), '', mdTable(['MCP', '종류', '대상', '고정'], r.mcp.map((m) => [m.name, m.kind, m.target, String(m.pinned)])), '', mdTable(['파일', '줄', '신호', '내용'], r.signals.slice(0, 40).map((s) => [s.file, s.line, s.kind, s.snippet]))].join('\n'), 'md');
    else emit(r);
    process.exit(r.suggestion.verdict === 'hold' ? EXIT.FINDINGS : EXIT.OK);
  }
  if (cmd === 'normalize') {
    if (!rest.length) fail('입력 파일이 필요합니다');
    const inputs = rest.map((f) => ({ file: f, data: readJson(f) })).filter((x) => x.data);
    const needs = flags.needs ? readJson(flags.needs) || [] : [];
    const installed = flags.installed ? (readJson(flags.installed)?.installed || []).map((p) => p.name || p) : [];
    const out = normalize(inputs, { needs, installed });
    if (flags.format === 'md') emit(mdTable(['제안', '이름', '종류', '발행', '도달', '구성', '필요', '출처'], out.map((c) => [c.suggestion.verdict, c.name, c.kind, c.publisher?.tier || '-', c.reach || '-', c.components ? Object.entries(c.components).filter(([, v]) => v).map(([k, v]) => `${k}${v}`).join(' ') : '-', c.needs_hit.join(' ') || '-', c.source])), 'md');
    else emit({ candidates: out.length, items: out });
    process.exit(EXIT.OK);
  }
  fail(`알 수 없는 명령: ${cmd}`);
}
