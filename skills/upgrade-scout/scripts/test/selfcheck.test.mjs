import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './_offline.mjs';
import { SKILL_DIR } from './_offline.mjs';
import { selfcheck, parseFrontmatter, referencedPaths } from '../selfcheck.mjs';

test('this skill passes its own selfcheck without warnings', async () => {
  const res = await selfcheck(SKILL_DIR);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.stats.roles, 8);
});

test('frontmatter parser flags what YAML would reject or truncate', () => {
  const ok = parseFrontmatter('---\nname: a-b\ndescription: "따옴표: 괜찮다"\n---\n본문');
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.data.description, '따옴표: 괜찮다');
  assert.equal(ok.body, '본문');
  assert.match(parseFrontmatter('---\nname: x\ndescription: 쓰임: 설명\n---\n').problems.join(), /": "/);
  assert.match(parseFrontmatter('---\nname: x\ndescription: 설명 #주석\n---\n').problems.join(), /" #"/);
  const block = parseFrontmatter('---\nname: x\ndescription: >\n  두 줄\n  설명\nmetadata:\n  a: 1\n---\n');
  assert.equal(block.data.description, '두 줄 설명');
  assert.deepEqual(block.data.metadata, { nested: true });
  assert.match(parseFrontmatter('no frontmatter').problems[0], /frontmatter/);
});

test('referenced paths skip templates and expand $S/', () => {
  const md = 'run `node "$SKILL_DIR/scripts/a.mjs" --x`, `$S/b.mjs lint`, `agents/<역할>.md`, `references/c.md`.';
  assert.deepEqual(referencedPaths(md).sort(), ['references/c.md', 'scripts/a.mjs', 'scripts/b.mjs']);
});

test('broken skill: every rule reports', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-')), 'demo-skill');
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  w('SKILL.md', '---\nname: Demo_Skill\ndescription: 태그 <b> 포함\nextra: 1\n---\n본문 `references/missing.md` `agents/solo.md`\n');
  w('agents/solo.md', '브리프');
  w('nested/SKILL.md', '---\nname: x\n---\n');
  w('assets/stray.txt', '아무도 안 부른다');
  w('assets/registry/r.json', '{"sources":[{"id":"not-documented"}]}');
  w('scripts/test/fixtures/big.txt', 'x'.repeat(210 * 1024));
  w('evals/evals.json', '{"skill_name":"other","evals":[{"id":"1","prompt":"p","expected_output":"e","expectations":[]}]}');
  const res = await selfcheck(dir, { nodeCheck: false });
  const checks = new Set(res.errors.map((e) => e.check));
  for (const c of ['single-skill-md', 'frontmatter', 'paths', 'orphans', 'registry', 'agents', 'fixture-size', 'evals']) assert.ok(checks.has(c), `${c} 누락: ${JSON.stringify(res.errors)}`);
  assert.equal(res.ok, false);
  const text = res.errors.map((e) => e.message).join('\n');
  assert.match(text, /nested\/SKILL\.md/);
  assert.match(text, /꺾쇠/);
  assert.match(text, /허용되지 않는 키 extra/);
  assert.match(text, /assets\/stray\.txt/);
  assert.match(text, /not-documented/);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('pack structure: required keys, name = folder, listed files exist, registry ids documented', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-pack-')), 'demo-skill');
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  w('SKILL.md', '---\nname: demo-skill\ndescription: 데모\n---\n`packs/bad/pack.md`\n');
  w('packs/bad/pack.md', '---\nname: other\nversion: 1\nchecked: 2026-09-26\ntriggers:\n  urls: x.ai\n  keywords: x\nprovides:\n  registry: registry.json\n  sources: sources.md\n---\n`packs/bad/registry.json` `packs/bad/sources.md`\n');
  w('packs/bad/registry.json', '{"sources":[{"id":"undocumented-src"}]}');
  w('packs/bad/sources.md', '# 소스\n');
  const res = await selfcheck(dir, { nodeCheck: false });
  const text = res.errors.map((e) => `${e.check} ${e.message}`).join('\n');
  assert.match(text, /pack .*name "other" ≠ 폴더 "bad"/);
  assert.match(text, /registry .*undocumented-src/);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
