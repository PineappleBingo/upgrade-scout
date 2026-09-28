# CLAUDE.md

## 무엇
Claude Code 플러그인 `upgrade-scout`는 코드베이스를 레퍼런스 기준으로 리뷰해 한국어(요청 언어) HTML 리포트를 만드는 스킬 하나로 이뤄진다. 레퍼런스는 리포, 설계 문서, 모델/API 문서, 생태계 카탈로그다. 리포가 곧 플러그인이자 마켓플레이스다(`.claude-plugin/`). 스킬 본체는 `skills/upgrade-scout/`에 있다.

## 명령 (모두 오프라인)
- `node --test skills/upgrade-scout/scripts/test/*.test.mjs` — 테스트
- `node skills/upgrade-scout/scripts/selfcheck.mjs --strict` — 구조 검사(경로 · 고아 파일 · 브리프↔계약↔ROLE_KEY · 팩 · evals · SKILL.md ≤350줄)
- `claude plugin validate --strict .` — 매니페스트 검사

## 구조
- `skills/upgrade-scout/SKILL.md` — 변수(REFERENCES · FOCUS · LENSES · DEPTH)와 절차, 하드 룰을 담는다. 상세는 `references/`에 둔다
- `agents/*.md`와 `assets/contracts/*.schema.json` — 역할 9개. 브리프와 계약, `scripts/ledger.mjs`의 ROLE_KEY가 삼자 일치한다
- `packs/<name>/` — 도메인 팩. 코어는 도메인을 모른다. 팩은 트리거(URL 호스트와 명시 키워드)가 맞을 때만 켜지고 코어 규칙에 더할 수만 있다. 지금은 `packs/jev/`가 있다
- `scripts/` — 의존성 0인 Node ESM 스크립트. 모든 스크립트가 `--help`를 지원하고 `lib/`는 공용이다
- `assets/radar-index.schema.json` — 레이더 공통 형식. **PineappleBingo/jev-radar가 그대로 복사해 쓴다**. 바꾸면 그쪽 `schema/`도 갱신한다

## 규칙
- 합계와 판정은 스크립트가 내고 모델은 합계를 쓰지 않는다. 판단 모델이 매긴 점수는 시너지 합계에 섞지 않는다
- 새 파일은 SKILL.md, agents, references, packs 문서 중 어딘가에서 백틱 경로로 언급한다(고아 검사)
- 라이브 외부 호출(Jev 등)에는 키와 사용자 동의, `--live`, 상한이 있어야 하고 dry-run을 먼저 돌린다. 키 출력 금지
- 공개 리포라서 로컬 경로, 이메일, 키처럼 생긴 문자열은 넣지 않는다. 비공개 아티팩트 링크는 주인만 열 수 있으니 이 파일과 `docs/`에만 둔다
- 커밋은 `type(scope): message` 형식에 세션 attribution 줄을 붙인다. 호환 별칭(JEV_MODE · CANDIDATES · UI_SCOPE · PLUGIN_SCOPE · jev-analyst · `--mode jev`)은 v4 전까지 유지

## 릴리스
1. marketplace 항목에는 version이 없으니 `.claude-plugin/plugin.json`의 version을 올림 2. `CHANGELOG.md` 맨 위에 항목 추가 3. 위 세 검사 통과 4. 커밋하고 `git push`한 뒤 `git tag vX.Y.Z && git push origin vX.Y.Z`(강제 푸시 금지) 5. 설치한 PC에서 `claude plugin update upgrade-scout@upgrade-scout`

## 맥락
- 설계 명세는 `docs/specs/`, 구현 계획은 `docs/plans/`, 판정 기록은 `docs/decisions.md`, 남은 일은 `docs/todo.md`에 있다
- 사람용 설계서는 버전 이력을 유지하므로 새 링크를 만들지 말고 같은 URL에 갱신한다: https://claude.ai/artifact/QTyfQfdwf1FyvDsFhofwjC
- v3 설계 재검토(D1–D6): https://claude.ai/artifact/WujYKoCZtHU4wYTfKRgfEr
- v2.0과 3.1.1 판 비교(빠진 검색 · 에이전트 기능, 함께 쓸 리포, API 키): https://claude.ai/artifact/9DxQMgLQFGYoaHWwdEwPVy
- 아티팩트를 갱신할 때는 Artifact read로 최신판을 읽고 그 위에 고쳐 `url`로 발행한다
