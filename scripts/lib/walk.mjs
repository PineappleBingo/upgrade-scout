// 저장소 파일 목록 — git이 있으면 추적·미추적(무시 제외) 파일, 없으면 직접 걷는다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'out', 'var', '.venv', 'venv',
  '__pycache__', '.turbo', '.cache', 'coverage', '.pytest_cache', 'target',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz', '.mp4',
  '.mp3', '.wav', '.mov', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.db', '.sqlite',
  '.bin', '.exe', '.dll', '.so', '.dylib', '.jar', '.class', '.pyc', '.lock',
]);

export const MAX_BYTES = 1_000_000;

/** 상대 경로 목록(항상 `/` 구분자, 정렬됨). */
export function listFiles(root, { maxBytes = MAX_BYTES, includeBinary = false } = {}) {
  let rel = gitList(root);
  if (!rel) rel = walk(root);
  const out = [];
  for (const r of rel) {
    const norm = r.split(path.sep).join('/');
    if (norm.split('/').some((seg) => SKIP_DIRS.has(seg))) continue;
    if (!includeBinary && BINARY_EXT.has(path.extname(norm).toLowerCase())) continue;
    let st;
    try { st = fs.statSync(path.join(root, norm)); } catch { continue; }
    if (!st.isFile() || st.size > maxBytes) continue;
    out.push(norm);
  }
  return [...new Set(out)].sort();
}

function gitList(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

function walk(root) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(path.join(dir, e.name));
      } else if (e.isFile()) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** 텍스트로 읽는다. NUL 바이트가 있으면 이진 파일로 보고 null. */
export function readText(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.includes(0)) return null;
  return buf.toString('utf8').replace(/\r\n/g, '\n');
}

/** 문자열 오프셋 → 1부터 세는 줄 번호. 여러 번 부를 때는 lineIndex를 쓴다. */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** 파일마다 (rel, text)를 돌려주는 제너레이터. 확장자 필터를 받는다. */
export function* textFiles(root, { exts = null, maxBytes = MAX_BYTES } = {}) {
  for (const rel of listFiles(root, { maxBytes })) {
    if (exts && !exts.has(path.extname(rel).toLowerCase())) continue;
    const text = readText(path.join(root, rel));
    if (text === null) continue;
    yield [rel, text];
  }
}

export const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php', '.cs', '.swift']);
export const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst']);

export function isTestPath(rel) {
  return /(^|\/)(tests?|__tests__|spec|fixtures?|e2e)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.(py|go)$|^test_.*\.py$/i.test(rel);
}

export function isDocPath(rel) {
  return DOC_EXT.has(path.extname(rel).toLowerCase()) || /(^|\/)docs?\//i.test(rel);
}
