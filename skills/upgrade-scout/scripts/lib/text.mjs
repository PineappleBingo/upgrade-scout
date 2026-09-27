// 텍스트 도우미 — frontmatter, 한글/CJK 판별, 토큰 추정, HTML 벗기기, 정규 JSON, 해시.
import crypto from 'node:crypto';

/**
 * 최소 YAML frontmatter 파서. `key: value`, 따옴표, `>`/`|` 블록 스칼라, 한 단계 중첩 맵을 지원한다.
 * 반환: { data, body, raw } — frontmatter가 없으면 data는 null.
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: null, body: text, raw: '' };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) { i++; continue; }
    const [, key, rest] = kv;
    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const block = [];
      i++;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || !lines[i].trim())) { block.push(lines[i].trim()); i++; }
      data[key] = rest.startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n').trim();
      continue;
    }
    if (rest === '') {
      const nested = {};
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const nkv = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
        if (nkv) nested[nkv[1]] = unquote(nkv[2]);
        i++;
      }
      data[key] = nested;
      continue;
    }
    data[key] = unquote(rest);
    i++;
  }
  return { data, body: text.slice(m[0].length), raw: m[1] };
}

function unquote(v) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

export const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
export const CJK = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/;

export const hasHangul = (s) => HANGUL.test(String(s));
export const hasCJK = (s) => CJK.test(String(s));

/** 토큰 수 추정 — ASCII는 4자당 1토큰, 그 밖의 문자는 1자당 1토큰(보수적). */
export function estimateTokens(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  let ascii = 0, other = 0;
  for (const ch of s) (ch.charCodeAt(0) < 128 ? ascii++ : other++);
  return Math.ceil(ascii / 4) + other;
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');
}

/** 키를 정렬한 JSON — 해시·캐시 키가 키 순서에 흔들리지 않게. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** 글 속의 fenced json 블록 하나를 꺼낸다. 없거나 여럿이면 에러. */
export function extractJsonBlock(text) {
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  if (blocks.length === 0) {
    const t = String(text).trim();
    if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
    throw new Error('json 블록이 없습니다');
  }
  if (blocks.length > 1) throw new Error(`json 블록이 ${blocks.length}개입니다 — 정확히 하나여야 합니다`);
  return JSON.parse(blocks[0]);
}

/** 글자(한글 포함)·숫자만 남긴 소문자 slug. 라틴 악센트는 벗긴다(é → e). */
export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 64) || 'item';
}
