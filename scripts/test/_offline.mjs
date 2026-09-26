// 테스트 공통 — 네트워크를 막는다. 어떤 테스트든 실수로 요청을 보내면 즉시 실패한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.UPGRADE_SCOUT_OFFLINE = '1';
globalThis.fetch = async (url) => { throw new Error(`테스트 중 네트워크 요청 금지: ${url}`); };

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, 'fixtures');
export const fixture = (...p) => path.join(FIXTURES, ...p);
export const SCRIPTS = path.resolve(here, '..');
export const SKILL_DIR = path.resolve(here, '..', '..');
