import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './_offline.mjs';
import { inventory } from '../inventory.mjs';
import { assume, matrix } from '../feature-probe.mjs';
import { gateInventory } from '../gate-inventory.mjs';
import { judgmentPoints, indexZodSchemas, typedFields } from '../judgment-points.mjs';
import { scan, compareHelp, compareDoc, compareOpenapi } from '../drift-probe.mjs';
import { parseFrontmatter, estimateTokens, canonicalJson, extractJsonBlock, hasHangul } from '../lib/text.mjs';
import { parseArgs } from '../lib/cli.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TS = fixture('mini-ts-repo');
const PY = fixture('mini-py-repo');

test('inventory: engines, env key names only, rule-section constraints', () => {
  const inv = inventory(TS);
  const npm = inv.manifests.find((m) => m.kind === 'npm');
  assert.deepEqual(npm.engines, { node: '>=22.5' });
  assert.ok(inv.llm.openai, 'openai SDK detected');
  assert.deepEqual(inv.envKeys.map((e) => e.key).sort(), ['FEATURE_X_ENABLED', 'OPENAI_API_KEY']);
  const texts = inv.constraints.map((c) => c.text);
  assert.ok(texts.some((t) => t.includes('orchestra')), 'rule section bullet kept');
  assert.ok(texts.some((t) => t.includes('Keep docs in Korean')), 'every bullet under Rules counts');
  assert.ok(!texts.some((t) => t.includes('이 줄은 규칙이 아니다')), 'non-rule section without strong words dropped');
  assert.ok(texts.some((t) => t.includes('must never log')), 'strong words outside rules kept');
  assert.equal(inv.constraints.find((c) => c.text.includes('orchestra')).hard, true);
  assert.ok(inv.tests.commands.some((c) => c.script === 'verify:gate'));
});

test('feature-probe assume: docs-only is partial, missing is absent with search space', () => {
  const [tv, jev, judge] = assume(TS, [
    { id: 'tv', patterns: ['search_scripts', 'query_corpus'] },
    { id: 'jev', patterns: ['typesafe', '\\bjev\\b'] },
    { id: 'judge', patterns: ['runJudge'] },
  ]);
  assert.equal(tv.status, 'partial');
  assert.equal(tv.hits[0].ref, 'docs/spec.md:2');
  assert.equal(jev.status, 'absent');
  assert.ok(jev.searched.filesScanned >= 5);
  assert.deepEqual(jev.searched.patterns, ['typesafe', '\\bjev\\b']);
  assert.equal(judge.status, 'present');
});

test('feature-probe matrix: repo x keyword classes', () => {
  const m = matrix([['ts', TS], ['py', PY]], [{ id: 'pydantic', patterns: ['BaseModel'] }, { id: 'zod', patterns: ['z\\.enum'] }]);
  assert.equal(m.rows[0].cells.zod.class, 'implemented');
  assert.equal(m.rows[0].cells.pydantic.class, 'absent');
  assert.equal(m.rows[1].cells.pydantic.class, 'implemented');
});

test('judgment-points: zod closure, hidden choice, SCHEMA_HINT rejected, thresholds, classifiers, retrieval gap', () => {
  const r = judgmentPoints(TS);
  const byField = (f) => r.points.filter((p) => p.field === f);
  assert.equal(byField('tier')[0].typed.primitive, 'choice');
  assert.equal(byField('tier')[0].typed.cardinality, 2);
  assert.equal(byField('kind')[0].typed.cardinality, 3);
  assert.equal(byField('recommended')[0].typed.primitive, 'noul', 'followed nested optionSchema');
  assert.equal(byField('quality')[0].typed.levels, 6);
  assert.equal(byField('bestCandidateId')[0].kind, 'hidden-choice');
  assert.ok(byField('HINT_RATE').length === 1, 'ratio threshold kept');
  assert.equal(byField('TIMEOUT_MS').length, 0, 'timeouts ignored');
  assert.ok(r.points.some((p) => p.kind === 'rule-classifier' && p.field === 'classifyError'));
  assert.ok(r.points.some((p) => p.kind === 'retrieval-gap' && p.field === 'runResearch'));
  assert.ok(!r.points.some((p) => p.rootSchema === 'SCHEMA_HINT'), 'template string is not a schema');
  assert.ok(r.points.some((p) => p.kind === 'prompt-decision' && p.file === 'prompts/judge.md'));
  assert.equal(new Set(r.points.map((p) => p.id)).size, r.points.length, 'ids unique');
});

test('judgment-points: pydantic Literal and bool', () => {
  const r = judgmentPoints(PY);
  assert.ok(r.schemasIndexed >= 1);
  const text = fs.readFileSync(path.join(PY, 'app/models.py'), 'utf8');
  const fields = typedFields('Verdict', indexZodSchemas([['app/models.py', text]]));
  assert.deepEqual(fields.find((f) => f.field === 'label').keys, ['spam', 'ham', 'unclear']);
  assert.equal(fields.find((f) => f.field === 'escalate').primitive, 'noul');
});

test('gate-inventory: sanitize, state-guard and http guard found; chains link calls', () => {
  const jp = judgmentPoints(TS);
  const calls = jp.points.filter((p) => p.kind === 'llm-call').map((p) => ({ file: p.file, line: p.line }));
  const g = gateInventory(TS, { llmCalls: calls });
  assert.ok(g.byKind['state-guard'] >= 1);
  assert.ok(g.byKind['http-guard'] >= 1);
  assert.ok(g.gates.some((x) => x.kind === 'sanitize' && x.symbol === 'runJudge'));
  assert.equal(g.chains.length, calls.length);
});

test('drift-probe: spawn flags, identifier resolution, unpinned npx, compare help/openapi/doc', () => {
  const s = scan(TS);
  const yt = s.calls.find((c) => c.name === 'yt-dlp');
  assert.deepEqual(yt.flags.sort(), ['--dump-json', '--flat-playlist']);
  assert.ok(s.calls.some((c) => c.name === 'fetcher' && c.via === 'TOOL'));
  assert.ok(s.notes.some((n) => n.kind === 'unpinned-npx'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-help-'));
  fs.writeFileSync(path.join(dir, 'yt-dlp.txt'), 'Usage: yt-dlp [OPTIONS]\n  -j, --dump-json   Quiet\n');
  const drift = compareHelp(s, dir);
  assert.deepEqual(drift.map((d) => d.missing_flag), ['--flat-playlist']);
  const od = compareOpenapi(s, { paths: { '/v1/things/{id}': {} } });
  assert.equal(od[0].missing_path, '/v1/items');
  const doc = compareDoc('POST /v1/systemone with state and questions', ['state', 'questions', 'criteria']);
  assert.deepEqual(doc.filter((d) => !d.present).map((d) => d.key), ['criteria']);
});

test('lib: frontmatter block scalars, tokens, canonical json, json block extraction, args', () => {
  const fm = parseFrontmatter('---\nname: x\ndescription: >\n  hello\n  world\nmetadata:\n  internal: true\n---\nbody');
  assert.equal(fm.data.name, 'x');
  assert.equal(fm.data.description, 'hello world');
  assert.equal(fm.data.metadata.internal, true);
  assert.equal(fm.body, 'body');
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('한국어'), 3);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.deepEqual(extractJsonBlock('앞\n```json\n{"a":1}\n```\n## Critical Files\n- x'), { a: 1 });
  assert.throws(() => extractJsonBlock('```json\n{}\n```\n```json\n{}\n```'), /2개/);
  assert.ok(hasHangul('abc 가'));
  const a = parseArgs(['x', '--k', 'v', '--flag', '--m', '1', '--m', '2', '--e=3'], { bool: ['flag'], multi: ['m'] });
  assert.deepEqual(a, { _: ['x'], flags: { k: 'v', flag: true, m: ['1', '2'], e: '3' } });
});
