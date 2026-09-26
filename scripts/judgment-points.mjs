#!/usr/bin/env node
// judgment-points — 코드베이스에서 "고르기·맞다/아니다·등급"이 일어나는 자리(판단 지점) 후보를 찾는다.
//   node judgment-points.mjs <repo> [--min-score 40] [--format md] [--top 60]
// Jev 같은 타입 판단 모델이 대신할 수 있는 자리의 "리드"다. jev-analyst가 파일을 열어 J-루브릭으로 확정한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, emit, fail, EXIT, mdTable, helpRequested } from './lib/cli.mjs';
import { listFiles, readText, lineIndex, isTestPath } from './lib/walk.mjs';
import { hasHangul } from './lib/text.mjs';

const HELP = `judgment-points.mjs <repo> [--min-score 40] [--top 60] [--format md]
종류: llm-typed(LLM이 JSON으로 고른 enum/boolean/정수 등급) · hidden-choice(best*Id 등 문자열로 숨은 선택) ·
retrieval-gap(검색 결과가 거르지 않고 LLM으로) · rule-classifier(정규식 분류기) · prompt-decision(프롬프트의
결정 동사) · threshold(비율·신뢰도 상수) · ranking-sort · human-decision(승인·선택 UI).
점수(0–100)는 정렬용 휴리스틱이며 J-루브릭 점수가 아니다.`;

const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const LLM_CALL = /\b(completeJson|generateObject|generateText|streamObject|with_structured_output|messages\.create|chat\.completions\.create|responses\.create|completion\.create)\s*\(/;
const GENERIC_COMPLETE = /\b(complete|chat|llm\.\w+)\s*\(\s*\{/;
const DECISION_EN = /\b(choose|select|classify|categori[sz]e|rate|rank|score|decide|recommend|pick|judge|whether|yes or no|true or false|label)\b/i;
const DECISION_KO = /(고른다|골라|고르|선택지|분류|판정|추천|채점|점수|판단|여부|맞는지|하나에만)/;
const THRESH_NAME = /^(?:[A-Z0-9_]*?)(RATE|CONF|CONFIDENCE|THRESH|THRESHOLD|TOLERANCE|CUTOFF|MIN_FOR|RATIO|MIN_SCORE|MAX_SCORE|GATE)\w*$/;

/** 저장소 전체의 zod 스키마 선언 색인: 이름 → {file, line, body} */
export function indexZodSchemas(files) {
  const index = new Map();
  for (const [rel, text] of files) {
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*z\s*\.\s*(object|array|enum|union|discriminatedUnion)\s*\(/g;
    let m;
    const li = lineIndex(text);
    while ((m = re.exec(text))) {
      const start = m.index;
      const body = balanced(text, text.indexOf('(', start + m[0].length - 1));
      index.set(m[1], { file: rel, line: li(start), offset: start, body, bodyOffset: text.indexOf('(', start + m[0].length - 1), text });
    }
    // pydantic BaseModel
    const py = /class\s+(\w+)\s*\((?:[\w.]*BaseModel|TypedDict)\)\s*:/g;
    while ((m = py.exec(text))) {
      const end = text.indexOf('\nclass ', m.index + 1);
      const body = text.slice(m.index, end < 0 ? undefined : end);
      index.set(m[1], { file: rel, line: li(m.index), offset: m.index, body, bodyOffset: m.index, text, py: true });
    }
  }
  return index;
}

function balanced(text, openIdx) {
  if (openIdx < 0) return '';
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
    if (i - openIdx > 20000) break;
  }
  return text.slice(openIdx, openIdx + 20000);
}

/** 스키마 본문에서 타입이 정해진 필드(enum/boolean/정수 범위/숨은 선택)를 뽑는다. 하위 스키마를 3단계까지 따라간다. */
export function typedFields(name, index, depth = 0, seen = new Set()) {
  const s = index.get(name);
  if (!s || seen.has(name) || depth > 3) return [];
  seen.add(name);
  const out = [];
  const li = lineIndex(s.text);
  const at = (localIdx) => li(s.bodyOffset + localIdx);
  const body = s.body;
  if (s.py) {
    for (const m of body.matchAll(/(\w+)\s*:\s*Literal\[([^\]]+)\]/g)) {
      out.push({ field: m[1], primitive: 'choice', cardinality: m[2].split(',').length, keys: m[2].split(',').map((k) => k.trim().replace(/^["']|["']$/g, '')), file: s.file, line: li(s.offset + m.index), schema: name });
    }
    for (const m of body.matchAll(/(\w+)\s*:\s*bool\b/g)) out.push({ field: m[1], primitive: 'noul', file: s.file, line: li(s.offset + m.index), schema: name });
    return out;
  }
  for (const m of body.matchAll(/(\w+)\s*:\s*z\s*\.\s*enum\s*\(\s*\[([^\]]*)\]/g)) {
    const keys = [...m[2].matchAll(/["'`]([^"'`]+)["'`]/g)].map((k) => k[1]);
    out.push({ field: m[1], primitive: 'choice', cardinality: keys.length, keys, file: s.file, line: at(m.index), schema: name, labelKo: hasHangul(tail(body, m.index)) });
  }
  for (const m of body.matchAll(/(\w+)\s*:\s*z\s*\.\s*boolean\s*\(\s*\)/g)) {
    out.push({ field: m[1], primitive: 'noul', file: s.file, line: at(m.index), schema: name, labelKo: hasHangul(tail(body, m.index)) });
  }
  for (const m of body.matchAll(/(\w+)\s*:\s*z\s*\.\s*number\s*\(\s*\)\s*\.\s*int\s*\(\s*\)\s*\.\s*min\s*\(\s*(\d+)\s*\)\s*\.\s*max\s*\(\s*(\d+)\s*\)/g)) {
    const levels = Number(m[3]) - Number(m[2]) + 1;
    if (levels >= 2 && levels <= 11) out.push({ field: m[1], primitive: 'score', levels, file: s.file, line: at(m.index), schema: name, labelKo: hasHangul(tail(body, m.index)) });
  }
  for (const m of body.matchAll(/((?:best|selected|chosen|preferred|winning)\w*Id)\s*:\s*z\s*\.\s*string/gi)) {
    out.push({ field: m[1], primitive: 'choice', dynamic: true, hidden: true, file: s.file, line: at(m.index), schema: name });
  }
  for (const m of body.matchAll(/\b(\w+Schema)\b/g)) {
    if (m[1] !== name && index.has(m[1])) out.push(...typedFields(m[1], index, depth + 1, seen));
  }
  return out;
}

const tail = (body, idx) => body.slice(idx, idx + 200).split('\n')[0];

export function judgmentPoints(root, { minScore = 0 } = {}) {
  const rels = listFiles(root);
  const code = [];
  const prompts = [];
  for (const rel of rels) {
    const ext = path.extname(rel).toLowerCase();
    const text = readText(path.join(root, rel));
    if (text === null) continue;
    if (CODE.has(ext) && !isTestPath(rel)) code.push([rel, text]);
    else if (ext === '.md' && /(^|\/)prompts?\//.test(rel) && !/(^|\/)README\.md$/i.test(rel)) prompts.push([rel, text]);
  }
  const index = indexZodSchemas(code);
  const points = [];
  const seenField = new Set();
  const add = (p) => { if (p.score >= minScore) points.push(p); };

  for (const [rel, text] of code) {
    const lines = text.split('\n');
    const li = lineIndex(text);
    const importsLlm = /from\s+["'][^"']*\bllm[^"']*["']|import\s+\w+\s+from\s+["'](openai|@anthropic-ai\/sdk)["']/.test(text);
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|#|\*)/.test(line)) return;
      const isCall = LLM_CALL.test(line) || (importsLlm && GENERIC_COMPLETE.test(line) && !/function\s+complete/.test(line));
      if (!isCall) return;
      const window = lines.slice(i, i + 8).join('\n');
      const sm = /schema\s*:\s*(\w+)/.exec(window) || /completeJson\s*\(\s*(\w+Schema)\b/.exec(window) || /response_model\s*=\s*(\w+)/.exec(window);
      const callRef = `${rel}:${i + 1}`;
      if (!sm) {
        add({ kind: 'llm-call', file: rel, line: i + 1, callRef, signals: ['LLM 호출(스키마 없음 — 생성일 가능성)'], typed: null, score: 20 });
        return;
      }
      const schemaName = sm[1];
      if (!index.has(schemaName)) {
        // 예: getPrompt(..., { schema: SCHEMA_HINT }) — 프롬프트 문자열이지 검증 스키마가 아니다.
        return;
      }
      const fields = typedFields(schemaName, index);
      add({ kind: 'llm-call', file: rel, line: i + 1, callRef, rootSchema: schemaName, signals: [`스키마 ${schemaName}로 검증되는 LLM 출력`, `타입 필드 ${fields.length}개`], typed: null, score: 25 });
      for (const f of fields) {
        const key = `${f.file}:${f.line}:${f.field}`;
        if (seenField.has(key)) continue;
        seenField.add(key);
        let score = f.primitive === 'choice' ? (f.hidden ? 66 : f.cardinality <= 10 ? 78 : 70) : f.primitive === 'noul' ? 72 : 64;
        if (f.labelKo) score -= 4;
        add({
          kind: f.hidden ? 'hidden-choice' : 'llm-typed', file: f.file, line: f.line, callRef, rootSchema: schemaName, field: f.field,
          signals: [`LLM이 JSON 필드 \`${f.field}\`로 고름`, f.hidden ? '문자열 id로 숨은 선택(후보 목록이 곧 선택지)' : '', f.labelKo ? '설명이 한국어 — 영어 state 필요' : ''].filter(Boolean),
          typed: { primitive: f.primitive, cardinality: f.cardinality ?? null, levels: f.levels ?? null, keys: f.keys ?? null, dynamic: !!f.dynamic },
          score,
        });
      }
    });

    // threshold 상수
    for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=\s*(0?\.\d+|\d+(?:\.\d+)?)\s*;/g)) {
      const name = m[1];
      if (!THRESH_NAME.test(name) || /(TIMEOUT|_MS|DELAY|PORT|RETRIES|TTL|INTERVAL|LIMIT|SIZE|BYTES|MAX_TOKENS)/.test(name)) continue;
      add({ kind: 'threshold', file: rel, line: li(m.index), field: name, signals: [`임계 상수 ${name}=${m[2]}`, '대개 코드 몫 — Jev confidence 게이트와 짝이 될 수 있음'], typed: null, score: 35 });
    }
    // 정규식 분류기
    for (const m of text.matchAll(/(?:export\s+)?(?:async\s+)?function\s+((?:classify|detect|categori[sz]e)\w*)\s*\(/g)) {
      const body = balanced(text, text.indexOf('{', m.index));
      const regexCount = (body.match(/\/[^/\n]{3,}\/[gimsuy]*\.test\(|\.test\(|\.match\(|new RegExp/g) || []).length;
      if (regexCount >= 2) add({ kind: 'rule-classifier', file: rel, line: li(m.index), field: m[1], signals: [`정규식 ${regexCount}개로 분류`, '규칙이 모르는 경우(unknown)만 Jev 폴백 후보'], typed: { primitive: 'choice' }, score: 45 });
    }
    // 검색 결과 → LLM (거르지 않음)
    for (const m of text.matchAll(/(?:export\s+)?async\s+function\s+(\w+)\s*\(/g)) {
      const body = balanced(text, text.indexOf('{', m.index));
      if (!/\b\w*[sS]earch\w*\s*\(/.test(body) || !LLM_CALL.test(body)) continue;
      const hasFilter = /\.filter\s*\(\s*\(?\s*\w+\s*\)?\s*=>[^)]*(relevan|score|match|includes)/.test(body);
      if (!hasFilter) add({ kind: 'retrieval-gap', file: rel, line: li(m.index), field: m[1], signals: ['검색 결과가 관련성 필터 없이 LLM에 들어감', 'rerank/classifying_rag_passages 패턴 후보'], typed: { primitive: 'noul' }, score: 62 });
    }
    // 점수 정렬
    for (const m of text.matchAll(/\.sort\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>[^)\n]*(score|weight|likes|rank|rate)/gi)) {
      add({ kind: 'ranking-sort', file: rel, line: li(m.index), signals: ['점수·가중치로 정렬 — 순위 근거가 세는 값인지 확인'], typed: null, score: 30 });
    }
    // 사람 결정 UI
    if (/\.(tsx|jsx)$/.test(rel)) {
      lines.forEach((line, i) => {
        if (/onClick|onSelect|onChange/.test(line) && /(승인|거절|제외|선택|approve|reject|exclude|select|pick)/i.test(lines.slice(Math.max(0, i - 2), i + 3).join(' '))) {
          add({ kind: 'human-decision', file: rel, line: i + 1, signals: ['사람이 고르거나 승인하는 UI — 정답 라벨(원장)의 원천'], typed: null, score: 30 });
        }
      });
    }
  }

  for (const [rel, text] of prompts) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('```') || t.startsWith('{{')) return;
      if ((DECISION_EN.test(t) || DECISION_KO.test(t)) && /(`[a-z]+`|\*\*|하나|one of|true|false|0~|0-|점)/i.test(t)) {
        add({ kind: 'prompt-decision', file: rel, line: i + 1, signals: [`프롬프트가 결정을 요구: "${t.slice(0, 80)}"`], typed: null, score: 40 });
      }
    });
  }

  // 사람 결정 UI는 파일당 3개까지만(잡음 억제)
  const perFile = {};
  const filtered = points.filter((p) => p.kind !== 'human-decision' || (perFile[p.file] = (perFile[p.file] || 0) + 1) <= 3);
  filtered.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  filtered.forEach((p, i) => { p.id = `JP${String(i + 1).padStart(2, '0')}`; p.ref = `${p.file}:${p.line}`; });
  const summary = {};
  for (const p of filtered) summary[p.kind] = (summary[p.kind] || 0) + 1;
  return { root: path.resolve(root), schemasIndexed: index.size, summary, points: filtered };
}

export function toMarkdown(res, top = 60) {
  const rows = res.points.slice(0, top).map((p) => [
    p.id, p.kind, p.ref, p.field || p.rootSchema || '',
    p.typed ? `${p.typed.primitive}${p.typed.cardinality ? `(${p.typed.cardinality})` : ''}${p.typed.levels ? `(${p.typed.levels}단)` : ''}` : '-',
    p.score, p.signals.join(' · '),
  ]);
  return [`# judgment-points — ${res.root}`, '', `스키마 색인 ${res.schemasIndexed} · ${Object.entries(res.summary).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '',
    mdTable(['id', '종류', '위치', '필드', 'Jev 형태 힌트', '점수', '신호'], rows)].join('\n');
}

if (isMain(import.meta.url)) {
  const { _, flags } = parseArgs(process.argv.slice(2));
  if (helpRequested(flags) || !_[0]) { process.stdout.write(HELP + '\n'); process.exit(helpRequested(flags) ? EXIT.OK : EXIT.USAGE); }
  if (!fs.existsSync(_[0])) fail(`경로 없음: ${_[0]}`, EXIT.PRECONDITION);
  const res = judgmentPoints(_[0], { minScore: Number(flags['min-score'] ?? 0) });
  emit(flags.format === 'md' ? toMarkdown(res, Number(flags.top) || 60) : res, flags.format === 'md' ? 'md' : 'json');
}
