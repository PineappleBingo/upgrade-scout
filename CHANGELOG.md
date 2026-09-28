# Changelog

## 3.1.1 — 2026-09-27
- 원장: 설계 문서나 능력 subject가 여럿이어도 겹치지 않도록 항목 id를 `MP01@<문서 제목>`, `CP01@<subject>`로 매긴다. 그래도 겹치면 conflicts에 남기고 말없이 버리지 않는다.
- 원장: design-mapper, capability-analyst, 에이전트 아키텍처 항목이 subject로 주장과 이어져 재확인 가중과 블라인드 증거, 재확인 대기열이 동작한다.
- 원장: CLI `merge … jev-analyst=…`가 항목을 잃지 않는다. v3.0 답은 `j`를 `pack_scores.j`로 옮기고 능력 시트가 없으면 다시 요청하라는 오류 하나로 끝난다. 호환 약속은 여기까지로 좁힌다.
- 팩: pack.md 하나가 망가져도 refs, radar, selfcheck가 멈추지 않는다. 그 팩만 건너뛰고 selfcheck가 `pack` 오류로 알린다.
- refs: 레퍼런스 없이 `classify --focus "…"`만으로 실행된다. `--pack-mode <팩>=<mode>`에서 off는 트리거가 맞아도 끄고 다른 값은 트리거 없이 켠다. HELP에 `vars`.
- Jev 팩 트리거: `jev · systemone · typesafe jev · typesafe system one · typesafe-ai · typesafe.ai`. 그냥 typesafe나 system one은 흔한 영어라 제외.
- 코어 하드 룰 9–11에 라이브 팩 호출 조건을 되살린다. 키와 동의, --live, 상한이 있어야 하고 dry-run이 먼저다. 키 비출력, state에 비밀과 우리 점수 금지, 보조 채점기 자동 금지도 되살린다. Jev 세부는 `packs/jev/lens.md` §9로 옮긴다.
- 리포트 산문은 요청한 언어(기본 한국어)로 쓴다. 옛 변수 이름(JEV_MODE, PLUGIN_SCOPE, UI_SCOPE)을 템플릿과 평가에서 v3.1 이름으로 바꾼다.
- radar: 인덱스 `url`은 GitHub 리포 URL만 받는다(스키마). 클론 명령은 URL 앞에 `--`를 붙인다.
- README: 처음 보는 사람도 알 수 있게 요구 문구를 다듬는다.

## 3.1.0 — 2026-09-26
- 레퍼런스 유형 판별(`scripts/refs.mjs`) — 리포, 설계 문서, 모델 능력, 생태계 중 무엇인지 가린다. 애매하면 묻는다.
- 설계 문서 처리기 `design-mapper` — 원칙 → 있음/부분/없음 → 빠진 조각 ≤3 → 하드 룰 충돌.
- 에이전트 아키텍처 렌즈 — `target-cartographer`의 `map.agents`, 원칙 8.
- 도메인 팩 — Jev를 `packs/jev/`로 옮긴다. 트리거(URL, 명시 키워드)가 맞을 때만 켜진다. `capability-analyst`(jev-analyst 일반화), 기준표 채점(`score-table --criteria`).
- 레이더 공통 형식 `radar-index/1`과 `scripts/radar.mjs`(신선도, 즉석 보충, 얕은 클론).
- 호환: `JEV_MODE` · `CANDIDATES` · `UI_SCOPE` · `PLUGIN_SCOPE` · 역할 `jev-analyst` · `--mode jev` · `--registry jev`.
- 공개 리포 정본으로 이전(이전: claude-sync-kit `skills/upgrade-scout`).
- 라이브 확인 1회: 모델 `jev-1.13.0` · 입력 토큰 349 · 지연 279ms · 비용 $0.00001466.

## 3.0.0 — 2026-09-26
- claude-sync-kit `skills/upgrade-scout`(main `03d820b`, PR #1)에서 이력째 옮김. 내용은 v3.0 그대로.
