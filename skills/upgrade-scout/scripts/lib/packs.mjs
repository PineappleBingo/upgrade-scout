// packs — 도메인 팩을 찾고 레퍼런스·FOCUS와 트리거를 대조한다(네트워크 없음, 쓰기 없음).
// 팩 = skills/upgrade-scout/packs/<name>/pack.md. 머리말: name · version · checked · env + 중첩 맵
// triggers{urls, keywords} · provides{lens, addendum, sources, registry, qsets, qset_lint, scorer, contract_ext} · options{mode} · radar{index, live_queries}.
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './text.mjs';

export const PACK_REQUIRED = ['name', 'version', 'checked', 'triggers'];
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const opt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const map = (v) => (v && typeof v === 'object' ? v : {});

export function loadPack(dir) {
  const file = path.join(dir, 'pack.md');
  const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!data) throw new Error(`${file}: frontmatter가 없다`);
  const t = map(data.triggers);
  const p = map(data.provides);
  const r = map(data.radar);
  return {
    name: String(data.name ?? ''),
    version: String(data.version ?? ''),
    dir,
    triggerUrls: list(t.urls).map((u) => u.toLowerCase()),
    triggerKeywords: list(t.keywords).map((k) => k.toLowerCase()),
    lens: opt(p.lens),
    addendum: opt(p.addendum),
    registry: opt(p.registry),
    sourcesDoc: opt(p.sources),
    qsetDir: opt(p.qsets),
    qsetLint: opt(p.qset_lint),
    criteria: opt(p.scorer),
    contractExt: opt(p.contract_ext),
    mode: opt(map(data.options).mode) || 'auto',
    radarIndex: opt(r.index),
    radarQueries: list(r.live_queries),
    env: list(data.env),
    checked: String(data.checked ?? ''),
    raw: data,
    body,
  };
}

export function listPacks(skillDir) {
  const root = path.join(skillDir, 'packs');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'pack.md')))
    .map((e) => loadPack(path.join(root, e.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hostOf = (ref) => { try { return new URL(ref).hostname.toLowerCase(); } catch { return null; } };

/** URL 호스트가 트리거 도메인(또는 그 하위 도메인)이거나, 레퍼런스·FOCUS에 트리거 키워드가 단어로 나올 때만 켠다. */
export function matchPacks(packs, { refs = [], focus = '' } = {}) {
  const hosts = refs.map(hostOf).filter(Boolean);
  const text = [focus, ...refs].join(' ').toLowerCase();
  const out = [];
  for (const p of packs) {
    const byUrl = p.triggerUrls.find((u) => hosts.some((h) => h === u || h.endsWith(`.${u}`)));
    const byKw = byUrl ? null : p.triggerKeywords.find((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}($|[^a-z0-9])`).test(text));
    if (byUrl || byKw) out.push({ name: p.name, why: byUrl ? `url:${byUrl}` : `keyword:${byKw}` });
  }
  return out;
}
