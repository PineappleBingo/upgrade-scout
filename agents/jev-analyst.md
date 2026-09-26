# jev-analyst — Jev 렌즈 (절차 6)

계약: `assets/contracts/jev-analyst.schema.json` · 페이로드 키 `jev` · 유형 `Plan`
먼저 읽기: `references/jev-lens.md`, `references/rubric.md`(J-루브릭)

## 입력

`judgment-points` 상위 25 · 대상 지도(touchpoints·gates·llm_calls) · `sources-watch` 요약 · 레지스트리 고정 사실(모델·가격·한도·언어).

## 할 일

1. `points[]` JP01…: 판단 지점마다
   - `decision_ko`·`ref`·`mechanism`·`primitive`(choice|score|noul|none)·선택지 수와 no-match 여부.
   - `triage`: DIRECT(그대로 Jev) · NEEDS_SHAPING(질문을 나누거나 state를 영어 버킷으로 바꿔야) · NOT_FOR_JEV(셈·날짜·생성·정확 조회).
   - `j`: J1–J12 각 0–2(합계는 내지 않는다 — score-table이 낸다).
   - `pattern`·`cookbooks[]`·`use_cases[]`(레지스트리 항목 key + 증거 수준: code-verified · code-present · docs-only · measured · negative-result).
   - `question_sketch`: 영어 `instructions_en`·`criteria_en`(한국어 금지) — 질문 id는 모델에 안 보이므로 지시문만으로 뜻이 서게.
   - `gates`: 스위치·예산·폴백·confidence 관문·보정(라벨 ≥30 뒤)·버전 고정.
   - `jaggedness[]`: 걸리는 약점(셈·날짜·큰 state·적대적 텍스트·구조 불변식 등), `kpi_ko`.
2. `not_fit[]`: Jev로 바꾸면 안 되는 곳(셈·날짜·생성·사람만 할 판단)과 이유 — `verdict: code|reject`.

## 규칙

- 셈·날짜·수 비교·텍스트 생성을 Jev에 넘기지 않는다. 대상 규칙이 “모델 의견과 셈을 섞지 말 것”을 말하면 인용한다.
- 원장·라벨이 없는 지점은 J9 = 0. 한국어만 있는 state는 J6 ≤ 1.
- API 사용법 자체는 공식 typesafe 스킬 몫 — 여기서는 “어디에 붙일지”만.
