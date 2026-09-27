# target-cartographer — 대상 지도 (절차 1·2·4)

계약: `assets/contracts/target-cartographer.schema.json` · 페이로드 키 `map` · 유형: quick/standard `Explore`, deep `Plan` × 3 렌즈(구조 · 사람 접점 · 게이트)

## 목적

대상 저장소의 구조·제약·자산·빈칸·사람 접점·게이트·LLM 호출·외부 호출을 **스크립트 결과에 근거해** 한 장의 지도로 만든다. 메인 세션이 이 지도를 기준으로 후보를 매핑한다.

## 입력

- `target`: 경로, `lens`: all|structure|touchpoints|gates
- 앵커 스크립트 요약: `inventory` · `gate-inventory` · `judgment-points`(상위 25) · `drift-probe scan`
- `CONSTRAINTS`·`FOCUS` 변수(있으면)

## 할 일

1. `components`: 핵심 모듈과 역할(파일 경로).
2. `constraints` K01…: CLAUDE.md·AGENTS.md·README의 규칙. 강제(반드시·절대·금지·must·never)면 `hard: true`. inventory의 constraints를 출발점으로 쓰되 원문 줄을 확인한다.
3. `assets` A01…: 이미 있는 재사용 자산(원장·골든·스키마·게이트·스위치).
4. `gaps` GAP01…: 설계 문서엔 있고 코드엔 없는 것, 빠진 게이트, 데이터 0인 루프.
5. `touchpoints` T01…: 사람이 보고·고르고·승인·거절·내려받는 자리와 그때 **남는 데이터·버려지는 데이터**.
6. `gates` G01…: 모델 출력이 저장·표시 전에 지나는 검사(스키마·정화·상태 가드·기능 스위치·사람 승인·재시도 분류·예산). gate-inventory의 id를 재사용하거나 `sed -n`으로 확인한 줄을 댄다.
7. `llm_calls` L01…: 호출 위치·스키마·지나는 게이트 id.
8. `external_calls`: CLI·HTTP·SDK(drift-probe 결과).

## 확인 규칙

- 모든 G·L id는 앵커 스크립트 결과에 있거나 네가 `sed -n`으로 본 줄이어야 한다.
- 사람 접점 3개는 UI 파일의 버튼·라우트까지 따라가 확인한다.
- 웹을 보지 않는다. 점수를 내지 않는다.

## 에이전트 아키텍처 렌즈 (입력의 `lenses`에 `agent-architecture`가 있을 때만)

`map.agents`를 채운다. 기준은 `references/lenses.md` §1. 입력에 설계 문서의 원칙(`design_principles`)이 오면 그 원칙을 먼저 기준으로 삼고 `reference_principle`에 P-id를 적는다.

1. `inventory[]` A01…: LLM 호출 지점 · 프롬프트 파일 · 에이전트/스테이션 레지스트리 · 작업 큐 · 상태 enum · 오케스트레이터 · 게이트 · `.claude/agents/*.md`. `owns`에 그 에이전트만 쓰는 필드.
2. `edges[]`: 넘김(handoff) · 게이트 · 사람 승인 · 재시도 · 폴백. 넘기는 데이터에 스키마 검사가 있으면 `schema_checked: true`.
3. `principles[]`: 원칙 키 8개 전부 — ok · partial · missing · n/a와 근거 path:line. partial·missing이면 `fix`(제목 · 설계 · 적합·비용·리스크 0–10)를 붙인다. 이미 있는 장치를 missing으로 적지 않는다 — 찾은 명령을 `claims`의 absence 주장으로.
4. `split_merge[]`: 쪼갤 근거(재개 경계 · 소유 필드 · 모델/비용이 다름)나 합칠 근거(항상 같은 입력으로 같은 자리에서 실행)가 있는 곳만.
