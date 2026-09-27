// 공통 CLI 도우미 — 외부 패키지 없이 Node 20+에서 동작한다.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const EXIT = { OK: 0, FINDINGS: 1, USAGE: 2, PRECONDITION: 3, NETWORK: 4 };

/**
 * `--key value`, `--key=value`, `--flag`, 반복 키(배열), 위치 인자를 해석한다.
 * spec.bool: 값을 받지 않는 플래그 목록. spec.multi: 여러 번 올 수 있는 키 목록.
 */
export function parseArgs(argv, spec = {}) {
  const bool = new Set(spec.bool || []);
  const multi = new Set(spec.multi || []);
  const flags = {};
  const _ = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { _.push(...argv.slice(i + 1)); break; }
    if (!a.startsWith('--')) { _.push(a); continue; }
    let key = a.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
    else if (bool.has(key)) value = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) value = argv[++i];
    else value = true;
    if (multi.has(key)) (flags[key] ||= []).push(value);
    else flags[key] = value;
  }
  return { _, flags };
}

/** 이 모듈이 `node file.mjs`로 직접 실행됐는지. 테스트에서 import할 때는 CLI를 돌리지 않는다. */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}

export function emit(value, format = 'json') {
  if (format === 'json') process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  else process.stdout.write(String(value).endsWith('\n') ? String(value) : String(value) + '\n');
}

export function fail(message, code = EXIT.USAGE) {
  process.stderr.write(`오류: ${message}\n`);
  process.exit(code);
}

/** 재현 가능한 출력을 위해 `--now <ISO>`를 받으면 그 시각을 쓴다. */
export function nowIso(flags = {}) {
  if (flags.now && flags.now !== true) {
    const d = new Date(flags.now);
    if (Number.isNaN(d.getTime())) fail(`--now 값을 해석할 수 없습니다: ${flags.now}`);
    return d.toISOString();
  }
  return new Date().toISOString();
}

/** 표 한 장을 마크다운으로. rows는 배열의 배열. */
export function mdTable(header, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [`| ${header.map(esc).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const r of rows) lines.push(`| ${r.map(esc).join(' | ')} |`);
  return lines.join('\n');
}

export function helpRequested(flags) {
  return flags.help === true || flags.h === true;
}
