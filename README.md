# Upgrade Scout

코드베이스를 **레퍼런스**(리포 · 설계 문서 · 모델/API 문서 · 생태계 카탈로그) 기준으로 리뷰해, 무엇을 가져오고 무엇을 뺄지 근거 · 점수 · 로드맵 · 결정 질문이 든 한국어 HTML 리포트로 만드는 Claude Code 플러그인입니다. 대상 코드는 고치지 않습니다. [English](README.en.md)

## 설치

```bash
claude plugin marketplace add PineappleBingo/upgrade-scout
claude plugin install upgrade-scout@upgrade-scout
```
스킬만(Codex · Cursor 등 다른 도구 포함): `npx skills add PineappleBingo/upgrade-scout -g`

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
| 리포 | 구현 vs 주장 · 가져올 것 · 점수 |
| 설계 문서 · 플레이북 · 조직도 | 원칙 → 있음/부분/없음 대응표 · 빠진 조각 · 하드 룰 충돌 |
| 모델 · API 문서 | 능력 시트 · 판단 지점 지도 · 적용 점수 (Jev는 팩으로 자동) |
| 생태계(레이더 · awesome · 토픽) | 최신 구현 사례 · 얕은 클론 뒤 리뷰 |

## 요구

Node.js ≥20 · git. 선택: `TYPESAFE_API_KEY`(Jev 팩 라이브 호출), gh CLI. 두 조수 에이전트 대신 스킬 안의 브리프로 Explore · Plan 에이전트를 부르므로 추가 설치가 없습니다. 브리프는 "읽기 전용"을 지시로 지킵니다(Bash가 있어 강제는 아님).

## 검사

```bash
node skills/upgrade-scout/scripts/selfcheck.mjs --strict
node --test skills/upgrade-scout/scripts/test/*.test.mjs
claude plugin validate --strict .
```

## 라이선스

MIT
