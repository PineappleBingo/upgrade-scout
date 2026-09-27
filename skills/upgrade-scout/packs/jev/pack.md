---
name: jev
version: 1.0.0
checked: 2026-09-26
env: TYPESAFE_API_KEY
triggers:
  urls: docs.typesafe.ai, typesafe.ai, api.typesafe.ai
  keywords: jev, systemone, typesafe jev, typesafe system one, typesafe-ai, typesafe.ai
provides:
  lens: lens.md
  addendum: analyst-addendum.md
  sources: sources.md
  registry: registry.json
  qsets: qsets
  qset_lint: scripts/jev-client.mjs
  scorer: criteria.json
  contract_ext: contract-ext.json
options:
  mode: auto
radar:
  index: https://raw.githubusercontent.com/PineappleBingo/jev-radar/main/data/
  live_queries: topic:jev, typesafe systemone in:readme, "@typesafe-ai/sdk" in:readme
---

# Jev 팩 (TypeSafe System One)

레퍼런스에 TypeSafe 문서(`docs.typesafe.ai` 등)가 있거나 요청·FOCUS에 `jev` · `systemone` · `typesafe jev` · `typesafe system one` · `typesafe-ai` · `typesafe.ai`가 단어로 나올 때만 켜진다(`refs.mjs classify`가 판정). 그냥 `typesafe`(“타입 안전”)나 `system one`은 흔한 영어라 트리거가 아니다. 켜지면 모델 능력 처리기(절차 6)와 보조 채점(절차 11)에 아래를 더한다.

| 파일 | 쓰는 곳 |
|---|---|
| `packs/jev/lens.md` | J1–J12 루브릭 · 감사 기반 설계 규칙 · 보정 · 중단 조건 |
| `packs/jev/analyst-addendum.md` | `capability-analyst` 브리프에 붙이는 부록(J-점수 · 질문 스케치) |
| `packs/jev/criteria.json` | `$S/score-table.mjs --mode jev` 기준표 |
| `packs/jev/sources.md` · `packs/jev/registry.json` | 절차 5 `$S/sources-watch.mjs --registry jev` |
| `packs/jev/qsets/scorer-questions.v1.json` · `packs/jev/qsets/plugin-suggest.v1.json` · `packs/jev/qsets/registry-triage.v1.json` · `packs/jev/qsets/target-qset.template.json` | 보조 채점 · 플러그인 2단 순위 · 레지스트리 선별 · 대상 질문셋 초안 |
| `packs/jev/scripts/jev-client.mjs` | lint · dry-run · run(라이브) · replay · validate · health · cost |
| `packs/jev/contract-ext.json` | capability 답의 `pack_scores.j` 검사(원장 validate) |

옵션 `mode`: `auto`(기본) · `off` · `lens` · `lens+scorer` — 뜻과 적용(`refs.mjs classify --pack-mode jev=<mode>`)은 SKILL.md §6. 호환 별칭으로 최상위 `JEV_MODE`와 v2.0 값(`analyze` = lens, `accelerate` = lens+scorer)을 받는다(`refs.mjs vars`). 라이브 호출 · 데이터 규칙은 `packs/jev/lens.md` §9(코어 하드 룰 9–11에 더함).
