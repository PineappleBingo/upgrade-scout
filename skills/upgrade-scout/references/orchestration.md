# 오케스트레이션 — 에이전트·웨이브·합치기·재확인

## 로스터

| 역할 | 유형 quick/standard/deep | 단계 | 브리프 | 계약 |
|---|---|---|---|---|
| target-cartographer | Explore / Explore / Plan × 3 | 1·2·4 | `agents/target-cartographer.md` | `assets/contracts/target-cartographer.schema.json` |
| repo-reviewer | Explore / Plan / Plan (리포당 1) | 7 | `agents/repo-reviewer.md` | `assets/contracts/repo-reviewer.schema.json` |
| web-researcher | general-purpose | 9 | `agents/web-researcher.md` | `assets/contracts/web-researcher.schema.json` |
| capability-analyst | Plan | 6 | `agents/capability-analyst.md` | `assets/contracts/capability-analyst.schema.json` |
| plugin-skill-scout | Plan | 8 | `agents/plugin-skill-scout.md` | `assets/contracts/plugin-skill-scout.schema.json` |
| verifier | Plan | 10 | `agents/verifier.md` | `assets/contracts/verifier.schema.json` |
| blind-scorer | Plan | 10 | `agents/blind-scorer.md` | `assets/contracts/blind-scorer.schema.json` |
| report-drafter | general-purpose (deep만) | 15 | `agents/report-drafter.md` | `assets/contracts/report-drafter.schema.json` |

Explore·Plan은 CLAUDE.md를 받지 않고 쓰기 도구가 없다. 그래서 대상의 규칙은 입력으로 넘긴다.

## 브리프 주입

Agent 프롬프트 = `agents/_preamble.md` 전문 + `agents/<role>.md` 전문 + 입력(JSON) + 계약 스키마 경로(또는 전문) + “json 블록 하나만”. 긴 참고 문서는 경로로만 넘긴다(`$SKILL_DIR/references/…`).

## 웨이브 (standard 기준, deep은 3 대신 4)

- **웨이브 0 — 스크립트만, 병렬**: inventory · gate-inventory · judgment-points · drift-probe scan · feature-probe assume · sources-watch
- **웨이브 A — 에이전트 ≤3**: cartographer + web-researcher(FOCUS). 그동안 메인은 계정·로컬 플러그인 검색과 3단계 종합
- **웨이브 B — 묶음 ≤3**: repo-reviewer들 → capability-analyst(모델 능력 레퍼런스가 있을 때) → plugin-skill-scout(필요 목록 필요). 메인이 먼저 `$W/repos/`에 얕게 클론
- **웨이브 C**: verifier + blind-scorer 병렬, 메인은 K/2 재확인 직접. 그다음 선택적 Jev 보조 채점, 재확인 한 라운드
- **웨이브 D — 메인만**: 12–15단계

상한: quick 동시 1/총 1 · standard 3/10 · deep 4/16. **상한 때문에 뺀 것은 반드시 run.json `dropped`와 리포트 “실행 메타”에 적는다**(120개를 띄워 112개가 실패한 전례).

## 실패·재시도

- 계약 위반: 한 번 고치게 한다(SendMessage가 있으면 그 에이전트에, 없으면 메인이 정규화하고 `status: partial`)
- 에이전트 실패: 범위를 좁혀 한 번 더 → 그래도 실패면 메인이 축소판을 하고 “실행 메타”에 적는다
- 도구 호출 상한에 걸린 에이전트는 partial로 받고 빈 곳을 `gaps_ko`로

## 합치기 (`ledger.mjs merge`)

1. 답마다 json 블록 하나를 꺼내 봉투 + 역할 계약으로 검사
2. 주장에 전역 id `C-###` — 같은 문장·같은 근거는 하나로(출처 목록에 합침)
3. 같은 항목에 상반된 상태(implemented vs claimed-only)는 `conflicts`로
4. RR 항목을 `items`로(근거 등급: implemented A · partial B · claimed-only C + 상한)

## 재확인 프로토콜

1. **고르기** `pick --k K`: absence·number·license 주장, TL;DR·상위 5·제외 목록에 딸린 주장, 낮은 확신, 충돌, 근거 없는 Explore 결과 — 영향 순
2. **실행**: 상위 K/2는 메인이 직접, 나머지는 verifier. 허용 명령은 `references/contracts.md`
3. **기록** `record`: 명령·종료 코드·발췌·판정·누가·시각 → 리포트 “재확인 로그”
4. **전파**: 반박(refuted)은 수리 로그 F-## + 딸린 항목을 대기열로 → score-table 다시
5. **이중 채점**: 메인과 블라인드의 축별 차 ≥2면 그 항목의 상위 주장을 대기열로
6. **Jev 대조**: Jev 점수(0–4 기대값) × 2.5와 메인 적합 차 ≥2.5이고 confidence ≥0.6이면 대기열. **Jev는 합계를 바꾸지 않는다**
7. **멈춤**: 추가 라운드 한 번. 남은 것은 “미확인”으로 드러낸다

임계값(2 · 2.5 · 0.6)은 시작값이다. history에 실행 5회가 쌓이면 다시 맞춘다.

## Workflow (사용자가 명시적으로 요청할 때만)

`assets/workflow.template.js`. 쓰기 전에 workflow-authoring 스킬을 로드한다. 스크립트는 파일을 못 읽으므로 브리프·스키마·입력을 전부 `args`로 넘긴다. 웨이브마다 동시 3–4개, 버린 것은 `log()`.
