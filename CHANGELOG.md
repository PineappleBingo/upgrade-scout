# Changelog

## 3.1.1 — 2026-09-27
- 원장: 설계 문서·능력 subject가 여럿이어도 항목 id가 겹치지 않게 `MP01@<문서 제목>` · `CP01@<subject>`로, 그래도 겹치면 conflicts에 남긴다(말없이 버리지 않음).
- 원장: design-mapper · capability-analyst · 에이전트 아키텍처 항목이 subject로 주장과 이어져 재확인 가중 · 블라인드 증거 · 재확인 대기열이 동작한다.
- 원장: CLI `merge … jev-analyst=…`가 항목을 잃지 않는다. v3.0 답은 `j` → `pack_scores.j`로 옮기고, 능력 시트가 없으면 다시 요청하라는 오류 하나로 떨어진다(호환 약속을 여기까지로 좁힘).
- 팩: 망가진 pack.md 하나가 refs · radar · selfcheck를 넘어뜨리지 않는다 — 그 팩만 건너뛰고 selfcheck가 `pack` 오류로 알린다.
- refs: `classify --focus "…"`만으로 돈다(레퍼런스 없음). `--pack-mode <팩>=<mode>` — off는 트리거가 맞아도 끄고 다른 값은 트리거 없이 켠다. HELP에 `vars`.
- Jev 팩 트리거: `jev · systemone · typesafe jev · typesafe system one · typesafe-ai · typesafe.ai`(그냥 typesafe · system one은 흔한 영어라 제외).
- 코어 하드 룰 9–11에 라이브 팩 호출 조건(키 · 동의 · --live · 상한 · dry-run 먼저, 키 비출력, state에 비밀·우리 점수 금지, 보조 채점기 자동 금지)을 되살리고 Jev 세부는 `packs/jev/lens.md` §9로.
- 리포트 산문은 요청한 언어(기본 한국어). 옛 변수 이름(JEV_MODE · PLUGIN_SCOPE · UI_SCOPE)을 템플릿 · 평가에서 v3.1 이름으로.
- radar: 인덱스 `url`은 GitHub 리포 URL만(스키마), 클론 명령은 URL 앞에 `--`.
- README: 요구 문구를 처음 보는 사람도 알게.

## 3.1.0 — 2026-09-26
- 레퍼런스 유형 판별(`scripts/refs.mjs`) — 리포 · 설계 문서 · 모델 능력 · 생태계. 애매하면 묻는다.
- 설계 문서 처리기 `design-mapper` — 원칙 → 있음/부분/없음 → 빠진 조각 ≤3 → 하드 룰 충돌.
- 에이전트 아키텍처 렌즈 — `target-cartographer`의 `map.agents`, 원칙 8.
- 도메인 팩 — Jev를 `packs/jev/`로. 트리거(URL · 명시 키워드)가 맞을 때만. `capability-analyst`(jev-analyst 일반화), 기준표 채점(`score-table --criteria`).
- 레이더 공통 형식 `radar-index/1`과 `scripts/radar.mjs`(신선도 · 즉석 보충 · 얕은 클론).
- 호환: `JEV_MODE` · `CANDIDATES` · `UI_SCOPE` · `PLUGIN_SCOPE` · 역할 `jev-analyst` · `--mode jev` · `--registry jev`.
- 공개 리포 정본으로 이전(이전: claude-sync-kit `skills/upgrade-scout`).
- 라이브 확인 1회: 모델 `jev-1.13.0` · 입력 토큰 349 · 지연 279ms · 비용 $0.00001466.

## 3.0.0 — 2026-09-26
- claude-sync-kit `skills/upgrade-scout`(main `03d820b`, PR #1)에서 이력째 옮김. 내용은 v3.0 그대로.
