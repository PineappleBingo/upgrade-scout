#!/usr/bin/env node
// gate-inventory — 모델 출력이 저장·화면·외부로 나가기 전 지나는 검문소 후보를 찾는다(휴리스틱).
//   node gate-inventory.mjs <repo> [--llm-calls jp.json] [--format md]
// 결과는 "후보"다. 사람이(또는 cartographer가) 파일을 열어 확인한 것만 리포트의 G-id가 된다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { textFiles, lineIndex, CODE_EXT, isTestPath } from './lib/walk.mjs';

const HELP = `gate-inventory.mjs <repo> [--llm-calls judgment-points.json] [--format md]
검문소 종류: schema(zod/pydantic 검증) · sanitize · normalize · state-guard(상태 조건부 갱신) ·
feature-flag · http-guard(401/403/409) · retry-classify · budget · human-approval.
--llm-calls에 judgment-points 출력을 주면 LLM 호출마다 같은 파일에서 뒤따르는 검문소를 연결한다.`;

export const GATE_RULES = [
  { kind: 'schema', re: /\b\w+\.(safeParse|parse)\(|\bmodel_validate\(|\bparse_obj\(|TypeAdapter\(/ },
  { kind: 'sanitize', re: /\bfunction\s+sanitize\w*|\bsanitize\w*\s*\(|\bdef\s+sanitize\w*/ },
  { kind: 'normalize', re: /\bfunction\s+normalize\w*|\bdef\s+normalize\w*|\bstrip(Fences|Think)\b|\bhealJson\b/ },
  { kind: 'state-guard', re: /updateMany\(\s*\{\s*where:\s*\{[^}]*status|WHERE[^;\n]*status\s*=|status\s*!==?\s*["'`][\w-]+["'`]\)\s*(return|throw)/ },
  { kind: 'feature-flag', re: /\b(is\w+Enabled|get\w+Features|settingOn|featureFlag|FEATURE_)\w*\s*\(/ },
  { kind: 'http-guard', re: /status:\s*(401|403|409|422)\b|Response\.json\([^)]*\{\s*status:\s*(401|403|409)/ },
  { kind: 'retry-classify', re: /retryable\s*:\s*(false|true)|\bclassify\w*Error\b|\bisRetryable\b/ },
  { kind: 'budget', re: /\b(budget|MonthlyBudget|maxCost|max_usd|rateLimit|circuit)\w*/i },
  { kind: 'human-approval', re: /awaiting[-_]\w+|approv(e|al)\w*\s*[:=(]|승인/ },
];

const DEF_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(|def\s+(\w+)\s*\(/;

export function gateInventory(root, { llmCalls = [] } = {}) {
  const gates = [];
  for (const [rel, text] of textFiles(root, { exts: CODE_EXT })) {
    if (isTestPath(rel)) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|#|\*|\{\/\*)/.test(line)) return;
      for (const rule of GATE_RULES) {
        if (rule.re.test(line)) {
          gates.push({ kind: rule.kind, file: rel, line: i + 1, symbol: enclosing(lines, i), snippet: line.trim().slice(0, 140) });
          break;
        }
      }
    });
  }
  gates.forEach((g, i) => { g.id = `G${String(i + 1).padStart(3, '0')}`; });

  const chains = [];
  const ungated = [];
  for (const call of llmCalls) {
    const file = call.file;
    const after = gates.filter((g) => g.file === file && g.line >= call.line && g.line <= call.line + 60);
    const anyInFile = gates.filter((g) => g.file === file);
    const entry = { llmCall: `${file}:${call.line}`, gates: after.map((g) => g.id), inFile: anyInFile.length };
    chains.push(entry);
    if (after.length === 0) ungated.push(entry.llmCall);
  }
  const byKind = {};
  for (const g of gates) byKind[g.kind] = (byKind[g.kind] || 0) + 1;
  return { root: path.resolve(root), total: gates.length, byKind, gates, chains, ungated };
}

function enclosing(lines, idx) {
  for (let i = idx; i >= 0 && i > idx - 80; i--) {
    const m = DEF_RE.exec(lines[i]);
    if (m) return m[1] || m[2] || m[3];
  }
  return null;
}

export function toMarkdown(inv) {
  const kinds = Object.entries(inv.byKind).map(([k, v]) => `${k} ${v}`).join(' · ');
  const top = inv.gates.filter((g) => g.kind !== 'budget').slice(0, 60);
  return [
    `# gate-inventory — ${inv.root}`, '', `검문소 후보 ${inv.total}개: ${kinds}`, '',
    mdTable(['id', '종류', '위치', '함수', '코드'], top.map((g) => [g.id, g.kind, `${g.file}:${g.line}`, g.symbol || '', g.snippet])),
    inv.ungated.length ? `\n뒤따르는 검문소를 찾지 못한 LLM 호출: ${inv.ungated.join(', ')}` : '',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  if (helpRequested(flags) || !_[0]) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (!fs.existsSync(_[0])) fail(`경로 없음: ${_[0]}`, EXIT.PRECONDITION);
  let llmCalls = [];
  if (flags['llm-calls']) {
    const jp = JSON.parse(fs.readFileSync(flags['llm-calls'], 'utf8'));
    llmCalls = (jp.points || []).filter((p) => p.kind === 'llm-typed' || p.kind === 'llm-call').map((p) => ({ file: p.file, line: p.line }));
  }
  const inv = gateInventory(_[0], { llmCalls });
  emit(flags.format === 'md' ? toMarkdown(inv) : inv, flags.format === 'md' ? 'md' : 'json');
}
