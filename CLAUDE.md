# CLAUDE.md

## 무엇
Claude Code 플러그인 `upgrade-scout` — 코드베이스를 레퍼런스(리포 · 설계 문서 · 모델/API 문서 · 생태계 카탈로그) 기준으로 리뷰해 한국어(요청 언어) HTML 리포트를 만드는 스킬 하나. 리포 = 플러그인 = 마켓플레이스(`.claude-plugin/`). 스킬 본체는 `skills/upgrade-scout/`.

## 명령 (모두 오프라인)
- `node --test skills/upgrade-scout/scripts/test/*.test.mjs` — 테스트
- `node skills/upgrade-scout/scripts/selfcheck.mjs --strict` — 구조 검사(경로 · 고아 파일 · 브리프↔계약↔ROLE_KEY · 팩 · evals · SKILL.md ≤350줄)
- `claude plugin validate --strict .` — 매니페스트 검사

## 구조
- `skills/upgrade-scout/SKILL.md` — 변수(REFERENCES · FOCUS · LENSES · DEPTH) · 절차 · 하드 룰. 상세는 `references/`
- `agents/*.md` + `assets/contracts/*.schema.json` — 역할 9개(브리프 ↔ 계약 ↔ `scripts/ledger.mjs` ROLE_KEY 삼자 일치)
- `packs/<name>/` — 도메인 팩. 코어는 도메인을 모른다. 팩은 트리거(URL 호스트 · 명시 키워드)가 맞을 때만 켜지고 코어 규칙에 더할 수만 있다. 지금은 `packs/jev/`
- `scripts/` — 의존성 0 Node ESM. 모든 스크립트 `--help`. `lib/`는 공용
- `assets/radar-index.schema.json` — 레이더 공통 형식. **PineappleBingo/jev-radar가 그대로 복사해 쓴다** — 바꾸면 그쪽 `schema/`도 갱신

## 규칙
- 합계 · 판정은 스크립트가 낸다(모델이 합계를 쓰지 않음). 판단 모델 점수는 시너지 합계에 섞지 않는다
- 새 파일은 SKILL.md · agents · references · packs 문서 중 어딘가에서 백틱 경로로 언급(고아 검사)
- 라이브 외부 호출(Jev 등): 키 + 사용자 동의 + `--live` + 상한 + dry-run 먼저. 키 출력 금지
- 공개 리포 — 로컬 경로 · 이메일 · 키 모양 문자열 금지. 비공개 아티팩트 링크는 이 파일과 `docs/`에만(주인만 열 수 있음)
- 커밋 `type(scope): message` + 세션 attribution 줄. 호환 별칭(JEV_MODE · CANDIDATES · UI_SCOPE · PLUGIN_SCOPE · jev-analyst · `--mode jev`)은 v4 전까지 유지

## 릴리스
1. `.claude-plugin/plugin.json` version 올림(marketplace 항목엔 version 없음) 2. `CHANGELOG.md` 맨 위 3. 위 세 검사 통과 4. 커밋 · `git push` · `git tag vX.Y.Z && git push origin vX.Y.Z`(강제 푸시 금지) 5. 설치한 PC: `claude plugin update upgrade-scout@upgrade-scout`

## 맥락
- 설계 명세 `docs/specs/` · 구현 계획 `docs/plans/` · 판정 기록 `docs/decisions.md` · 남은 일 `docs/todo.md`
- 설계서(사람용, 버전 이력 유지 — 새 링크 만들지 말고 같은 URL에 갱신): https://claude.ai/artifact/QTyfQfdwf1FyvDsFhofwjC
- v3 설계 재검토(D1–D6): https://claude.ai/artifact/WujYKoCZtHU4wYTfKRgfEr
- 아티팩트 갱신은 Artifact read로 최신판을 읽고 그 위에 고쳐 `url`로 발행
