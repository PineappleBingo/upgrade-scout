// 소스 파서 — sources-watch와 link-check가 같은 방식으로 목록을 읽게 한다.
// 모든 파서는 순수 함수다(네트워크 없음). 0건이면 호출자가 "parse-suspect"로 기록한다 —
// 페이지 구조가 바뀌어 아무것도 못 읽은 것과 "새 항목 없음"을 구분하기 위해서다.
import { decodeEntities, stripHtml } from './text.mjs';

/** 추적용 쿼리(?ref=, utm_*)를 걷어낸다. 같은 링크가 출처마다 다른 문자열이 되지 않게. */
export function cleanUrl(url) {
  try {
    const u = new URL(decodeEntities(url));
    for (const k of [...u.searchParams.keys()]) if (k === 'ref' || k.startsWith('utm_')) u.searchParams.delete(k);
    u.hash = u.hash === '#' ? '' : u.hash;
    let s = u.toString();
    if (s.endsWith('?')) s = s.slice(0, -1);
    return s;
  } catch { return String(url); }
}

/** github.com/<owner>/<repo>[/…] → { owner, repo, url }. 조직 페이지·토픽·gist는 null. */
export function githubRepoOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const [owner, repoRaw] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repoRaw) return null;
  if (['topics', 'orgs', 'sponsors', 'marketplace', 'features', 'settings', 'search', 'collections'].includes(owner.toLowerCase())) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

/**
 * 번호 목록 기사(HackerNoon "101 examples" 형식):
 *   <h3 id="…">섹션</h3><p><strong>N. </strong><a href="URL"><strong>이름</strong></a> — 설명</p>
 * 링크 없는 항목(이름만 굵게)도 읽는다. 반환: [{ n, section, name, url, links, desc }]
 */
export function parseNumberedList(html) {
  const text = String(html);
  const heads = [...text.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => ({ at: m.index, title: stripHtml(m[1]) }));
  const items = [];
  const re = /<p[^>]*>\s*<strong>\s*(\d{1,4})\.\s*<\/strong>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    const body = m[2];
    const links = [...body.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((a) => ({ url: cleanUrl(a[1]), label: stripHtml(a[2]) }));
    const first = /^\s*(?:<a\s[^>]*href="([^"]+)"[^>]*>)?\s*<strong>([\s\S]*?)<\/strong>/i.exec(body);
    const name = first ? stripHtml(first[2]) : stripHtml(body).split(/\s[—–-]\s/)[0];
    const url = first && first[1] ? cleanUrl(first[1]) : null;
    const desc = stripHtml(body).replace(new RegExp(`^${escapeRe(name)}\\s*[—–-]?\\s*`), '');
    let section = null;
    for (const h of heads) if (h.at < m.index) section = h.title;
    items.push({ n, section, name, url, links, desc });
  }
  return items;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** sitemap.xml → [{ loc, lastmod }] */
export function parseSitemap(xml) {
  return [...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({
    loc: (/<loc>\s*([^<]+?)\s*<\/loc>/i.exec(m[1]) || [])[1] || null,
    lastmod: (/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i.exec(m[1]) || [])[1] || null,
  })).filter((x) => x.loc);
}

/** llms.txt·마크다운 목록 → [{ title, url, section }] (같은 URL은 처음 것만) */
export function parseMarkdownLinks(md) {
  const out = [];
  const seen = new Set();
  let section = null;
  for (const line of String(md).split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.+?)\s*$/.exec(line);
    if (h) { section = h[1].replace(/[*_`]/g, ''); continue; }
    for (const m of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
      const url = cleanUrl(m[2]);
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ title: m[1].replace(/[*_`]/g, '').trim(), url, section });
    }
  }
  return out;
}

export const parseLlmsTxt = parseMarkdownLinks;

/**
 * 기계 판독 카탈로그 → 정규화된 항목. 배열·{entries}·{items}·{projects}를 받고,
 * {categories: [{id, resources: [...]}]}처럼 분류 안에 항목이 든 모양(AbdelStark resources.json)은 펼친다.
 */
export function parseCatalogJson(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  let arr = Array.isArray(data) ? data : (data.entries || data.items || data.projects || data.resources || Object.values(data).find(Array.isArray) || []);
  if (arr.length && arr.every((c) => c && Array.isArray(c.resources))) arr = arr.flatMap((c) => c.resources.map((r) => ({ category: c.id || c.name || null, ...r })));
  return arr.map((e) => ({
    id: e.slug || e.url || e.permalink || e.name,
    title: e.title || e.name || e.slug || e.url,
    category: e.category || null,
    url: e.url ? cleanUrl(e.url) : null,
    kind: e.kind || null,
    official: Boolean(e.official),
    has_code: e.has_code ?? null,
    patterns: e.patterns || [],
    question_types: e.question_types || [],
    languages: e.languages || [],
    first_seen: e.first_seen || null,
    link_status: e.link_status || null,
    summary: e.summary || e.description_markdown || e.description || '',
  }));
}

/**
 * CSV·TSV → [{ id, title, date, fields }]. 따옴표 안의 구분자·줄바꿈·"" 이스케이프를 처리한다.
 * id 열은 idColumn(없으면 url·link·repo·id·name 순으로 처음 있는 열).
 */
export function parseDelimited(text, { delimiter = ',', idColumn } = {}) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const col = idColumn && header.includes(idColumn) ? idColumn : ['url', 'link', 'repo', 'id', 'name'].find((h) => header.includes(h)) || header[0];
  const pick = (f, keys) => keys.map((k) => f[k]).find((v) => v);
  return rows.slice(1).map((r) => {
    const fields = Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]));
    const raw = fields[col] || '';
    return {
      id: /^https?:\/\//.test(raw) ? cleanUrl(raw) : raw,
      title: pick(fields, ['title', 'name', 'repo', 'description']) || raw,
      date: pick(fields, ['date', 'posted', 'last_push', 'first_seen', 'snapshot']) || null,
      fields,
    };
  }).filter((r) => r.id);
}

/** npm registry 문서 → { latest, time } */
export function parseNpm(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const latest = d['dist-tags']?.latest || null;
  return { latest, time: latest ? d.time?.[latest] || null : null, versions: Object.keys(d.versions || {}).length };
}

/** PyPI JSON → { latest, time } */
export function parsePypi(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const latest = d.info?.version || null;
  const files = latest ? d.releases?.[latest] || [] : [];
  return { latest, time: files[0]?.upload_time_iso_8601 || null, versions: Object.keys(d.releases || {}).length };
}

/**
 * Claude Code 마켓 marketplace.json → [{ name, source, version, description, legacy }].
 * 현행 형식은 최상위 name·owner·plugins[{name, source}]. 최상위 "marketplace" 키 아래 plugins[{path}]는 옛 형식(legacy).
 */
export function parseMarketplaceJson(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const legacy = Boolean(d.marketplace && !d.plugins);
  const m = legacy ? d.marketplace : d;
  return (m.plugins || []).map((p) => ({
    name: p.name,
    marketplace: m.name || null,
    source: typeof p.source === 'string' ? p.source : p.source ? JSON.stringify(p.source) : p.path || null,
    version: p.version || null,
    description: p.description || '',
    legacy,
  }));
}

export const PARSERS = {
  'marketplace-json': parseMarketplaceJson,
  'html-numbered-list': parseNumberedList,
  sitemap: parseSitemap,
  'llms-txt': parseLlmsTxt,
  'markdown-links': parseMarkdownLinks,
  'catalog-json': parseCatalogJson,
  csv: (t) => parseDelimited(t, { delimiter: ',' }),
  tsv: (t) => parseDelimited(t, { delimiter: '\t' }),
  npm: parseNpm,
  pypi: parsePypi,
};
