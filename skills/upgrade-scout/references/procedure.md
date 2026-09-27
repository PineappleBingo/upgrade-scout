# 절차 — 15단계 상세

SKILL.md §4 표의 상세판. 각 단계는 **입력 → 명령 → 누가 → 산출 → 종료 기준 → 깊이별 생략**. 명령의 `$S`는 `node "$SKILL_DIR/scripts"`, `$T`는 대상 경로, `$W`는 `$SCOUT_WORK`(쓰기 프로필이 write-scratch일 때만).

## run.json — 압축 뒤 복구

`$W/run.json`(no-write면 대화 속 코드 블록)에 단계 상태를 적는다. 맥락이 압축되면 이것부터 다시 읽는다.

```json
{ "run_id": "2026-09-26-tvse-jev", "target": "/path", "vars": { "DEPTH": "standard", "JEV_MODE": "auto", "PLUGIN_SCOPE": "light" },
  "write_profile": "no-write|write-scratch", "baseline_porcelain": "", "steps": { "1": "done", "5": "running" },
  "subagents": [{ "role": "repo-reviewer", "subject": "hunch", "status": "ok|partial|failed", "tool_calls": 31 }],
  "dropped": [{ "what": "후보 3개", "why": "깊이 상한" }], "budget": { "tokens_est": 0 } }
```

## 1. 대상 분석

- 명령: `$S/inventory.mjs $T` · `$S/history.mjs show --target <이름>`
- 누가: target-cartographer(quick·standard는 Explore, deep은 Plan × 3 렌즈)
- 산출: 구조·규모·제약 K·자산 A·빈칸 GAP(`path:line`), 지난 실행 대비 바뀐 것
- 종료: 제약 전부에 원문 줄, 빈칸 전부에 근거

## 2. 사람 접점 지도

- 누가: cartographer + 메인. 형식은 `references/touchpoint-map.md`
- 산출: T-id 표 — 행동 · 화면·라우트 · 남는 데이터 · 버려지는 데이터
- 생략: quick(“생략”으로 표시)

## 3. 가정·완성품 검증 (ASSUMED가 있을 때)

- 명령: `$S/feature-probe.mjs assume $T --spec assume.json` (또는 `--terms a,b`)
- 산출: present·partial·absent + 검색 범위(패턴·파일 수). absent는 “다음 단계 메모”로
- 완성품 추적: 사용자가 말한 산출물(“최종 프롬프트까지 만든다”)은 재료가 있다는 것으로 끝내지 않고 생성 → 저장 → 후처리 → 전달의 고리마다 `file:line`을 댄다. 한 고리라도 없으면 partial
- 종료: “없다”마다 검색 범위가 리포트에 있다

## 4. 게이트·드리프트 인벤토리

- 명령: `$S/judgment-points.mjs $T > jp.json` · `$S/gate-inventory.mjs $T --llm-calls jp.json` · `$S/drift-probe.mjs scan $T`
- 드리프트 대조: 메인이 `<cli> --help`를 떠서 `$W/help/<cli>.txt`에 두고 `drift-probe compare scan.json --help-dir $W/help`, 또는 OpenAPI·문서 키 대조
- 산출: G-id, LLM 출력별 게이트 사슬, 게이트 없는 타입 필드, 드리프트 목록
- 옵션 분기 감사: 대상의 모드·포맷·언어·계정 옵션을 뽑고, 옵션마다 영향을 받아야 할 경로(프롬프트 변수·폴백 문구·렌더·외부 전달)를 grep해 옵션 × 경로 표를 만든다. 갈리지 않는 칸이 버그 후보다(RepoReel: 새 포맷을 넣었는데 여섯 곳이 옛 포맷에 고정)
- 후처리 범위: 윤문·요약·번역 단계가 코드 블록·복사용 문구·고정 문구까지 고치는지 확인한다

## 5. Jev 지식 갱신

- 명령: `$S/sources-watch.mjs --registry jev --state-dir <상태> [--update]` (no-write면 `--update` 금지)
- 산출: 소스별 상태(ok·baseline·unavailable·parse-suspect), 새·바뀜·사라짐, 경보(모델·가격·한도·언어·API)
- 규칙: unavailable은 “변화 없음”이 아니다. parse-suspect는 사람에게 알린다
- 생략: JEV_MODE=off. quick은 렌즈가 켜졌을 때만

## 6. Jev 렌즈 (JEV_MODE ≠ off)

- 먼저 읽기: `packs/jev/lens.md`, `references/rubric.md`
- 명령: `node "$SKILL_DIR/packs/jev/scripts/jev-client.mjs" lint <질문셋 초안>` · `dry-run`
- 누가: capability-analyst(Plan)
- 산출: JP 표(J1–J12 → `$S/score-table.mjs jp-items.json --mode jev`), 판정, 영어 질문셋 v1, 게이트, 보정 계획, not_fit
- 종료: 모든 JP에 `ref`, 합계·판정은 스크립트 값

## 7. 후보 리포 리뷰

- 준비: 메인이 `$W/repos/`에 얕게 클론(`git clone --depth 1 --filter=blob:limit=300k`). no-write면 웹으로(근거 B)
- 명령: `$S/feature-probe.mjs matrix --repos a=/p,b=/q --keywords k.json`
- 누가: repo-reviewer × 리포, 동시 ≤3
- 산출: RR 항목(구현 vs 주장, 적합·비용·리스크, 난이도, 런타임 비용, 마이너스)
- 확인: 리포마다 `impl_refs` 2개를 `sed -n`으로, 라이선스는 항상 다시

## 8. 플러그인·스킬 탐색 (PLUGIN_SCOPE)

- 먼저 읽기: `references/plugin-skill-scouting.md`
- 명령: SearchPlugins·SearchSkills(세션 도구) · `claude plugin list --json --available` · `$S/plugin-scout.mjs normalize …` · 받아 둔 후보에 `scan-local`
- 누가: 메인(검색) + plugin-skill-scout(판정)
- 산출: 필요 N(각각 대상 프로젝트용 · 내 작업 환경용 표시), 검색 로그(세 층), 후보 판정. 아무것도 맞지 않으면 “없음” + 직접 만드는 최소 설계

## 9. 집중 역량 딥다이브 (FOCUS가 있을 때)

- 누가: web-researcher + 메인
- 산출: grep 매트릭스, 확인일이 붙은 웹 대안, 설계안 2–3개와 그림

## 10. 증거 원장·재확인·이중 채점

- 명령: `$S/ledger.mjs merge … ` → `pick --k <K>` → 메인이 K/2 직접 실행 + verifier가 나머지 → `record …` → `blind` → blind-scorer → `attach-blind`
- 규칙: `references/orchestration.md`의 재확인 프로토콜. 추가 라운드는 한 번까지, 남은 것은 “미확인”

## 11. Jev 보조 채점 (JEV_MODE = lens+scorer, 선택)

- 명령: `$S/ledger.mjs jev-requests ledger.json --questions $SKILL_DIR/packs/jev/qsets/scorer-questions.v1.json > reqs.json` → `node "$SKILL_DIR/packs/jev/scripts/jev-client.mjs" dry-run reqs.json`(요청 수·토큰·비용을 사용자에게 보여 준다) → 동의 + 키가 있으면 `run --live --max-requests … --max-input-tokens … --max-usd …` → `ledger attach-jev`
- 키가 없으면: 열에 “—(미실행: 키 없음)”, 0이 아니다
- 규칙: 합계를 바꾸지 않는다. 차가 크면 재확인 대기열로 한 번만
- 후보 사전 선별(후보가 8개를 넘을 때, 선택): 같은 질문셋에 README 발췌(영어 ≤700자)를 넣어 **순서만** 정한다. 탈락 후보도 표에 남기고, 리뷰를 대신하지 않는다
- 실데이터 실측(동의 시): 렌즈의 질문셋 초안을 대상의 실제 데이터 20–100건으로 dry-run → 비용을 보여 주고 → 키·동의가 있으면 `run --live --cassette $W/cassette`로 기록(다시 볼 때는 `replay`). 결과는 “실측(n)”으로 표시

## 12. 업그레이드 5가지

- 산출: 무엇 · 데이터 · 루프 · 비용 · KPI · 가드레일 · 프로토타입 · 순서 의존. quick은 상위 3

## 13. UI/UX (UI_SCOPE)

- 먼저 읽기: `references/ui-mockup-rules.md` — 정적 목업, 자기보정 규칙, 추가 아이디어 5개 이상

## 14. 제외

- ❌ 불가 · ⚠️ 조건부. 강제 제약을 어기는 후보는 여기로(점수 상한 3)

## 15. 계획표·로드맵·결정 질문·산출

- 명령: `$S/score-table.mjs items.json --format html` · `$S/link-check.mjs <urls.json>` · `$S/history.mjs append --record rec.json`(no-write면 부록으로만)
- 누가: 메인(+ deep은 report-drafter)
- 산출: Artifact, (동의 시) md 사본, ADR 초안(`assets/adr.template.md`), 실행 기록. P0 중 병렬 가능한 것 표시
- PREVIOUS가 있으면: 그 URL을 Artifact read로 받아 그 판 위에 쓰고 같은 URL로 발행한다. 문서 안 “버전 이력”에 달라진 것만 한 항목, `$S/history.mjs diff --target <이름>`으로 지난 실행 대비
- 종료: 대상 `git status --porcelain`이 기준선과 같다
