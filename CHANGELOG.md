# Changelog

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
