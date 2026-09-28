# 남은 일 (2026-09-28 기준)

## 사람이 해야 할 것
- [ ] 새 세션에서 `/upgrade-scout:upgrade-scout` 자동완성 확인(플러그인), npx 설치본에서 `/upgrade-scout` 확인
- [ ] 대상 저장소의 새 세션에서 실사용 3회:
  1. `REFERENCES: PineappleBingo/creator-lab-reels` · `FOCUS: 릴 제작 파이프라인에서 가져올 것` · `DEPTH: quick`
  2. `REFERENCES: <설계 문서 URL 또는 경로>` · `LENSES: agent-architecture` · `DEPTH: quick`
  3. `REFERENCES: https://docs.typesafe.ai/introduction` · `FOCUS: Jev를 붙일 판단 지점`. 라이브는 dry-run 비용을 보고 동의
  - 대상 `git status --porcelain`이 전후로 같은지 확인. 드러난 버그는 테스트부터 쓰고 3.1.x에서 고침
- [ ] claude-sync-kit 드래프트 PR #2를 병합해 키트의 플러그인 설치를 한 줄로 줄임: https://github.com/PineappleBingo/claude-sync-kit/pull/2
- [ ] (결정) 초기 공개 이력 재작성 여부 — `docs/decisions.md` R18

## 미룬 개선 (최종 리뷰 Minor)
- M1 레퍼런스가 로컬에 없는 상대 경로면 GitHub 리포로 단정해 분류함(`refs.mjs`). `--cwd`도 없음
- M2 `radar.mjs`가 `fetch`를 그대로 씀. `lib/net.mjs httpRequest`(오프라인 스위치, 타임아웃, 프록시 폴백)를 재사용해야 함. 스키마가 무효인 인덱스도 종료 코드 4로 끝남. `live.reason`이 누락됨
- M5 문서와 워크플로 템플릿 사이에 불일치가 있음(capability-analyst 실행 조건, sources-watch 시점, plugins 게이트)
- M6 에이전트 아키텍처 렌즈는 wave A에서 설계 원칙이 필요한데 design-mapper는 wave B에 있음. 순서를 조정해야 함
- M7 awesome 목록과 GitHub 토픽 레퍼런스를 처리할 경로가 없음. `radar --index <url>` 문서도 없음
- M8 score-table이 import 시 jev 기준표를 읽어서 기준표가 깨지면 synergy 모드도 깨짐. criteria 모드는 `item.j`를 보는데 capability 답은 `pack_scores.j`에 있음
- M9 `registryPath`가 팩의 `provides.registry`를 무시
- M10 SKILL.md §2와 §10이 Jev 팩 경로를 직접 적어서 `packs/`를 삭제하면 selfcheck에서 경로 오류가 남
- M14 워크플로 템플릿이 capability와 에이전트 아키텍처 항목을 검증과 블라인드 채점에서 뺌
- refs/radar 출력에 깨진 팩(`pack_errors`)이 안 보임. selfcheck만 보고함
- 프런트매터와 매니페스트 설명이 아직 “한국어 리포트”인데 리포트는 요청 언어를 따름

## 2026-09-28 판 비교에서 나온 것 (리포트: https://claude.ai/artifact/9DxQMgLQFGYoaHWwdEwPVy)
- P1 레퍼런스 없이 후보를 찾는 경로가 없음. SKILL.md §1에 문장 한 줄뿐이고 web-researcher 결과가 클론과 repo-reviewer로 이어지지 않음
- P1 `radar.mjs`의 GitHub 실시간 검색은 팩의 `live_queries`에서만 돎. 팩 없이 FOCUS 키워드로 검색하는 일반 모드가 필요함
- P1 막힌 문서 페이지를 대신 읽을 순서를 `references/search-recipes.md`에 적기: WebFetch → Jina Reader → insane-search → Scrapling. 검색 명령에는 Agent-Reach(Exa, `gh search`)와 wigolo `find_similar`를 더함
- P2 `assets/registry/plugins.json`에 MCP · 에이전트 카탈로그 소스가 없음. TrueForge `catalog/*.yaml`이 첫 후보
- P2 리포트 한국어를 im-not-ai light 경로로 다듬는 선택 단계. 표 · 점수 · 코드는 건드리지 않고 `verify_gates.py`로 막음
- P3 판단 지점이 많으면 "Jev 팩을 켜 볼 만함"을 결정 질문에 한 줄로 권함(자동으로 켜지는 않음, R16 유지)
- P3 v2.0처럼 등록된 서브에이전트가 필요하면 플러그인 루트 `agents/`에 얇은 정의만 두고 본문은 기존 브리프를 읽게 함
