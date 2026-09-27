import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR } from './_offline.mjs';
import { classifyRef, classifyAll, normalizeVars } from '../refs.mjs';

test('compat aliases: CANDIDATES, UI_SCOPE, PLUGIN_SCOPE, JEV_MODE map to v3.1 variables', () => {
  const { vars, notes } = normalizeVars({ CANDIDATES: ['o/a', 'o/b'], REFERENCES: ['o/a', 'docs/x.md'], UI_SCOPE: 'on', PLUGIN_SCOPE: 'light', JEV_MODE: 'accelerate', FOCUS: 'f' });
  assert.deepEqual(vars.REFERENCES, ['o/a', 'docs/x.md', 'o/b'], 'merged without duplicates, REFERENCES first');
  assert.deepEqual(vars.LENSES.sort(), ['plugins', 'ui']);
  assert.deepEqual(vars.plugins, { scope: 'light' });
  assert.deepEqual(vars.packs, { jev: { mode: 'lens+scorer' } });
  assert.equal(vars.FOCUS, 'f');
  for (const k of ['CANDIDATES', 'UI_SCOPE', 'PLUGIN_SCOPE', 'JEV_MODE']) assert.equal(k in vars, false, `${k} removed`);
  assert.equal(notes.length, 4);
  assert.deepEqual(normalizeVars({ PLUGIN_SCOPE: 'off', UI_SCOPE: 'off', JEV_MODE: 'off' }).vars, { REFERENCES: [], LENSES: [], packs: { jev: { mode: 'off' } } });
  assert.deepEqual(normalizeVars({ JEV_MODE: 'analyze' }).vars.packs.jev.mode, 'lens');
  assert.deepEqual(normalizeVars({ REFERENCES: ['x'], LENSES: ['agent-architecture'] }), { vars: { REFERENCES: ['x'], LENSES: ['agent-architecture'] }, notes: [] });
});

test('github: repo root and tree are repos, blob .md is a design doc, topics and awesome lists are ecosystem', () => {
  assert.equal(classifyRef('https://github.com/owner/repo').type, 'repo');
  assert.equal(classifyRef('https://github.com/owner/repo/tree/main/src').type, 'repo');
  assert.equal(classifyRef('https://github.com/owner/repo/blob/main/docs/arch.md').type, 'design');
  assert.equal(classifyRef('https://github.com/topics/jev').type, 'ecosystem');
  assert.equal(classifyRef('https://github.com/someone/awesome-jev').type, 'ecosystem');
  assert.equal(classifyRef('https://raw.githubusercontent.com/PineappleBingo/jev-radar/main/data/index.json').type, 'ecosystem');
  assert.equal(classifyRef('owner/repo').type, 'repo');
});

test('docs sites are capability (unconfirmed) and artifacts are design (unconfirmed)', () => {
  const d = classifyRef('https://docs.example.com/api');
  assert.equal(d.type, 'capability');
  assert.equal(d.confident, false);
  const a = classifyRef('https://claude.ai/artifact/abc');
  assert.equal(a.type, 'design');
  assert.equal(a.confident, false);
});

test('local folder wins over shorthand; local markdown is a design doc', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(cwd, 'owner', 'repo', '.git'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'org-chart.md'), '# 조직도');
  assert.deepEqual([classifyRef('owner/repo', { cwd }).type, classifyRef('owner/repo', { cwd }).why], ['repo', 'local git repo']);
  assert.equal(classifyRef('org-chart.md', { cwd }).type, 'design');
});

test('pack match makes a docs ref confident capability; unconfirmed refs go to ask', () => {
  const r = classifyAll(['https://docs.typesafe.ai/api.md', 'https://claude.ai/artifact/x', 'https://github.com/o/r'], { skillDir: SKILL_DIR });
  assert.deepEqual(r.packs.map((p) => p.name), ['jev']);
  assert.deepEqual(r.refs.map((x) => [x.type, x.confident]), [['capability', true], ['design', false], ['repo', true]]);
  assert.deepEqual(r.ask, ['https://claude.ai/artifact/x']);
});

test('works without packs: unrelated request loads nothing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-nopacks-'));
  const r = classifyAll(['https://github.com/o/r'], { skillDir: empty, focus: '판단 로직 점수화' });
  assert.deepEqual(r.packs, []);
  const r2 = classifyAll(['https://github.com/o/r'], { skillDir: SKILL_DIR, focus: '판단 로직 점수화' });
  assert.deepEqual(r2.packs, [], 'jev pack must not load for generic judging words');
});

const REFS = path.join(SKILL_DIR, 'scripts', 'refs.mjs');
const cli = (...args) => spawnSync(process.execPath, [REFS, ...args], { encoding: 'utf8' });

test('CLI: a FOCUS-only request (no refs) classifies and can switch a pack on', () => {
  const r = cli('classify', '--focus', 'Jev 붙일 데');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.refs, []);
  assert.deepEqual(out.packs.map((p) => p.name), ['jev']);
  assert.equal(cli('classify').status, 2, 'nothing at all is still a usage error');
});

test('pack mode: off suppresses a trigger match; an explicit non-off mode activates without a trigger', () => {
  assert.deepEqual(classifyAll([], { skillDir: SKILL_DIR, focus: 'Jev 붙일 곳', modes: { jev: 'off' } }).packs, []);
  assert.deepEqual(classifyAll(['https://docs.typesafe.ai/api'], { skillDir: SKILL_DIR, modes: { jev: 'off' } }).packs, []);
  assert.deepEqual(classifyAll(['https://github.com/o/r'], { skillDir: SKILL_DIR, modes: { jev: 'lens' } }).packs, [{ name: 'jev', why: 'mode:lens' }]);
  assert.deepEqual(classifyAll(['https://github.com/o/r'], { skillDir: SKILL_DIR, modes: { nope: 'lens' } }).packs, [], 'unknown pack names are ignored');
  const off = JSON.parse(cli('classify', '--focus', 'Jev 붙일 곳', '--pack-mode', 'jev=off').stdout);
  assert.deepEqual(off.packs, []);
  const on = JSON.parse(cli('classify', 'https://github.com/o/r', '--pack-mode', 'jev=lens+scorer').stdout);
  assert.deepEqual(on.packs, [{ name: 'jev', why: 'mode:lens+scorer' }]);
});

test('jev triggers: common English words and look-alike repos do not load it; explicit names do', () => {
  const packsOf = (refs, focus = '') => classifyAll(refs, { skillDir: SKILL_DIR, focus }).packs.map((p) => p.name);
  assert.deepEqual(packsOf([], 'make the API client typesafe'), []);
  assert.deepEqual(packsOf(['ivanhofer/typesafe-i18n']), []);
  assert.deepEqual(packsOf(['https://github.com/ivanhofer/typesafe-i18n']), []);
  assert.deepEqual(packsOf([], 'system one thinking vs system two'), []);
  for (const focus of ['Jev 붙일 곳', 'TypeSafe Jev', 'TypeSafe System One 문서', '@typesafe-ai/sdk 쓰는 곳', 'SystemOne 판단']) assert.deepEqual(packsOf([], focus), ['jev'], focus);
});

test('refs --help documents vars and --pack-mode', () => {
  const r = cli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /vars/);
  assert.match(r.stdout, /--pack-mode/);
});
