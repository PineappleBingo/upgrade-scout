# 판정 기록 — v3.1 구현 (2026-09-26 ~ 28)

구현 중 계획·리뷰가 답하지 않은 곳에서 내린 결정. 각 줄: 결정 — 이유 — 틀렸을 때의 비용.

## 진행 방식
- R1 새 리포 폴더를 먼저 `git init`(작업 공간이 git 루트 필요) — 비용 없음
- R2 새 리포라 브랜치 없이 `main`에서 작업 — 초기 이력이 main에 있음
- R3 실사용 3회(Task 13)는 플러그인을 설치한 새 세션이 필요해 사람에게 넘김 — 실사용 검증 지연(`docs/todo.md`)
- R4 두 계획(upgrade-scout → jev-radar)을 순서대로 — jev-radar가 늦게 나옴
- R5 구현·리뷰 sonnet, 최종 리뷰 opus — 비용
- R9 커밋 Co-Authored-By는 실제로 쓴 모델 이름 — 커밋마다 모델 이름이 섞임
- R14 설계서 아티팩트 갱신은 jev-radar까지 끝난 뒤 한 번에

## 설계 · 코드
- R6 `.gitattributes`(`* text=auto eol=lf`) 유지 — Windows autocrlf가 CSV 픽스처 테스트를 깸 — 키트에서 subtree pull 시 줄바꿈 차이가 보일 수 있음
- R7 v3.0 형식(`jev` 페이로드) 답 테스트 추가 — 테스트 하나 증가
- R8 design-mapper `missing_pieces` 0개 허용(최소 1 강제 안 함) — 이미 다 갖춘 대상에서 모델이 조각을 지어내지 않게 — 기대한 빠진 조각이 안 나올 수 있음
- R10 레이더 스키마의 `category` · `summary_ko` 하위 필드 타입과 radar CLI 테스트 추가 — jev-radar가 이 스키마를 계약으로 복사
- R11 SKILL.md에서 Jev를 기본값처럼 쓴 문구를 팩 중립으로 · plugins 렌즈 세부 옵션 복원
- R15 최종 리뷰 Important 9 + M3 · M4 · M11 · M13을 3.1.1로, M1 · M2 · M5–M10 · M14는 미룸(`docs/todo.md`)
- R16 Jev 트리거 키워드에서 흔한 단어 `typesafe` · `system one` 제외 → `jev, systemone, typesafe jev, typesafe system one, typesafe-ai, typesafe.ai`(계획의 목록을 뒤집음) — “typesafe”만 쓴 요청은 팩이 안 켜짐(`refs.mjs --pack-mode jev=lens`로 켬)
- R17 v3.0 답 호환을 역할·키·`j`→`pack_scores.j`까지로 좁힘. 능력 시트가 없으면 재요청 오류(시트를 지어내지 않음) — 저장된 옛 답은 재실행 필요
- R19 3.1.1 스키마(`url` 패턴)를 jev-radar가 다시 복사하도록 함

## 공개 정리
- R12 개인정보 정리 검사를 `docs/specs` · `docs/plans`까지 넓힘 — 이력 문서가 세션 원본과 다름
- R13 검사에 남은 6건(계획 속 검사 규칙 문구, refs 테스트의 가짜 artifact id)과 eval 9의 공개 리포 이름 유지
- R18 공개 이력은 다시 쓰지 않음(강제 푸시 필요) — 초기 커밋에 비공개 아티팩트 id 3개 · 로컬 경로가 남음. HEAD는 깨끗

## 교훈
- 요약 도구 대신 원문을 파서로 읽는다 · 다른 세션이 같은 문서를 고칠 수 있으니 발행 전에 최신판을 읽는다(설계서 07장 교훈 23–41)
- 동음이의 필터는 남긴 것과 뺀 것 양쪽에서 표본을 본다(교훈 41, jev-radar에서 실제로 양쪽으로 틀림)
