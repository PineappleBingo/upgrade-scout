# 남은 일 (2026-09-28 기준)

## 사람이 해야 할 것
- [ ] 새 세션에서 `/upgrade-scout:upgrade-scout` 자동완성 확인(플러그인), npx 설치본에서 `/upgrade-scout` 확인
- [ ] 실사용 3회 — 대상 저장소에서 새 세션:
  1. `REFERENCES: PineappleBingo/creator-lab-reels` · `FOCUS: 릴 제작 파이프라인에서 가져올 것` · `DEPTH: quick`
  2. `REFERENCES: <설계 문서 URL 또는 경로>` · `LENSES: agent-architecture` · `DEPTH: quick`
  3. `REFERENCES: https://docs.typesafe.ai/introduction` · `FOCUS: Jev를 붙일 판단 지점`(라이브는 dry-run 비용을 보고 동의)
  - 대상 `git status --porcelain`이 전후로 같은지 확인. 드러난 버그는 테스트부터 쓰고 3.1.x로
- [ ] claude-sync-kit 드래프트 PR #2 병합(키트가 플러그인 설치 한 줄로): https://github.com/PineappleBingo/claude-sync-kit/pull/2
- [ ] (결정) 초기 공개 이력 재작성 여부 — `docs/decisions.md` R18

## 미룬 개선 (최종 리뷰 Minor)
- M1 레퍼런스가 로컬에 없는 상대 경로면 확신 있는 GitHub 리포로 분류됨(`refs.mjs`), `--cwd` 없음
- M2 `radar.mjs`가 맨 `fetch` — `lib/net.mjs httpRequest`(오프라인 스위치 · 타임아웃 · 프록시 폴백) 재사용, 스키마 무효 인덱스도 종료 코드 4, `live.reason` 누락
- M5 문서 ↔ 워크플로 템플릿 불일치(capability-analyst 실행 조건 · sources-watch 시점 · plugins 게이트)
- M6 에이전트 아키텍처 렌즈는 wave A에서 설계 원칙이 필요한데 design-mapper는 wave B — 순서 조정
- M7 awesome 목록 · GitHub 토픽 레퍼런스의 처리 경로 없음, `radar --index <url>` 문서 없음
- M8 score-table이 import 시 jev 기준표를 읽음(기준표가 깨지면 synergy 모드도 깨짐), criteria 모드는 `item.j`인데 capability 답은 `pack_scores.j`
- M9 `registryPath`가 팩의 `provides.registry`를 무시
- M10 SKILL.md §2 · §10이 Jev 팩 경로를 직접 적음 — `packs/` 삭제 시 selfcheck 경로 오류
- M14 워크플로 템플릿이 capability · 에이전트 아키텍처 항목을 검증 · 블라인드 채점에서 뺌
- refs/radar 출력에 깨진 팩(`pack_errors`)이 안 보임(selfcheck만 보고)
- 프런트매터 · 매니페스트 설명이 아직 “한국어 리포트”(리포트는 요청 언어)
