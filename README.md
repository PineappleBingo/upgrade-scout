# Upgrade Scout

Upgrade Scout는 Claude Code 플러그인입니다. 리포, 설계 문서, 모델/API 문서, 생태계 카탈로그를 **레퍼런스**로 삼아 코드베이스를 리뷰한 뒤 무엇을 가져오고 무엇을 뺄지 한국어 HTML 리포트로 정리합니다. 리포트에는 근거와 점수, 로드맵, 결정 질문이 들어갑니다. 대상 코드는 고치지 않습니다. [English](README.en.md)

## 설치

```bash
claude plugin marketplace add PineappleBingo/upgrade-scout
claude plugin install upgrade-scout@upgrade-scout
```
스킬만 설치하려면 `npx skills add PineappleBingo/upgrade-scout -g`를 실행합니다. Codex, Cursor 등 다른 도구에서도 이 방법으로 설치합니다.

업데이트: `claude plugin update upgrade-scout@upgrade-scout` 또는 `/plugin` → Marketplaces → 자동 업데이트.

## 사용

```text
/upgrade-scout:upgrade-scout
REFERENCES: <owner>/<repo>, <설계 문서 URL 또는 경로>, <모델/API 문서 URL>
FOCUS: <관심 역량 한 줄>
LENSES: agent-architecture
```
말로 요청해도 됩니다: "이 설계 문서 기준으로 우리 코드 리뷰해줘", "이 리포에서 뭘 가져올까", "에이전트 구조 점검해줘".

| 레퍼런스 | 리포트에 나오는 것 |
|---|---|
| 리포 | 구현과 주장 대조, 가져올 것, 점수 |
| 설계 문서, 플레이북, 조직도 | 원칙별 있음/부분/없음 대응표, 빠진 조각, 하드 룰 충돌 |
| 모델과 API 문서 | 능력 시트, 판단 지점 지도, 적용 점수(Jev는 팩으로 자동 처리) |
| 생태계(레이더, awesome, 토픽) | 최신 구현 사례, 얕은 클론을 받아 한 리뷰 |

## 요구

Node.js ≥20과 git이 필요합니다. 선택으로는 Jev 팩 라이브 호출에 쓰는 `TYPESAFE_API_KEY`와 gh CLI가 있습니다. 따로 설치할 에이전트는 없습니다 — 스킬 안에 든 서브에이전트 브리프로 Claude Code 기본 Explore와 Plan 에이전트를 부릅니다. 브리프는 "읽기 전용"을 지시로만 요구합니다. Bash가 있어서 강제되지는 않습니다.

## 검사

```bash
node skills/upgrade-scout/scripts/selfcheck.mjs --strict
node --test skills/upgrade-scout/scripts/test/*.test.mjs
claude plugin validate --strict .
```

## 라이선스

MIT
