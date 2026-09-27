# 렌즈 — 추가 장

`LENSES` 변수로 켠다(여러 개 가능). 호환: `UI_SCOPE: on` = `ui`, `PLUGIN_SCOPE`(off가 아닐 때) = `plugins`.

## 1. agent-architecture — 대상의 에이전트 구조

누가: `target-cartographer`(`map.agents`, 브리프 `agents/target-cartographer.md`). 리포트 장: 조직도(그림) · 에이전트 표 · 원칙 갭 표 · 쪼개기/합치기.

| 키 | 원칙 | 묻는 것 |
|---|---|---|
| `single-source` | 단일 출처 | 에이전트 · 단계 · 상태 목록이 한 곳에 정의되나 |
| `single-transition` | 단일 전이 지점 | 상태가 한 곳에서만 바뀌나 |
| `handoff-contract` | 핸드오프 계약 | 넘기는 데이터에 스키마 검사가 있나, 실패하면 어떻게 되나 |
| `generator-judge-split` | 생성·판정 분리 | 모델이 자기 결과를 채점하지 않나 |
| `judge-not-repair` | 판정만, 수리 금지 | 게이트가 몰래 고치지 않나 |
| `rules-location` | 규칙의 위치 | 지켜야 할 규칙이 프롬프트 편집으로 사라질 수 있나 |
| `resume-boundary` | 재개 경계 | 실패 후 어디서 다시 시작하나, 재시도가 안전한가 |
| `observability` | 관측성 | 에이전트별 비용 · 토큰 · 실패 사유가 남나 |

레퍼런스에 에이전트 설계 문서가 있으면 `design-mapper`가 뽑은 원칙이 기준이고 위 표는 보조다. 원칙 문구는 일반형으로 두고 특정 프로젝트의 규칙을 기준으로 삼지 않는다.

## 2. self-improving — 자기개선 루프 (체크리스트, 스크립트 없음)

- 사람이 고친 결과(before/after)가 저장되나, 버려지나(`references/touchpoint-map.md`)
- 고친 것이 예시·규칙으로 승격되는 경로가 있나, 승격에 사람 승인이 있나
- 실패를 계층(프로세스 · 도구 · 검증)으로 귀속하는 수리 로그가 있나
- 학습 신호의 양이 과적합을 부를 만큼 많거나, 학습에 못 쓸 만큼 적지 않나

## 3. ui — `references/ui-mockup-rules.md`

## 4. plugins — `references/plugin-skill-scouting.md`
