# Jev 소스 레지스트리 — 사람이 읽는 판

기계가 읽는 정본은 `assets/registry/jev.json`(Jev 생태계)과 `assets/registry/plugins.json`(플러그인 생태계)이다. 이 파일은 그 설명서이고, **소스 id는 정본과 같아야 한다**(`scripts/selfcheck.mjs`가 대조).

## 고정 사실 (2026-09-26 확인)

- 모델 `jev-1.13.0` — `jev-latest`·`jev-preview` 모두 같은 버전. 임계값을 보정했다면 버전을 고정한다.
- 입력 $0.042/100만 토큰 · 출력 무료 · 1200 rpm · 250,000 tok/s(“동적으로 바뀜”) · 64k total · 32k state + 가장 긴 질문
- SDK: JS `@typesafe-ai/sdk` 0.6.0 · Python `typesafe-sdk` 0.7.1
- 언어: English first; CJK handled but not equally well. 한국어 공개 감사 1건 — jujumilk3/jev-calibration-audit: 같은 문항에서 정확도 −6.5pp, ECE 0.076 vs 0.075(보정은 그대로), 지시문 언어는 무관하고 state 언어만 영향(저자 자체 수치, 2026-09-26 확인). 영상 대본 같은 도메인 평가는 없음
- MCP: official none · 에이전트 스킬: typesafe@typesafe-ai (marketplace typesafe-ai = typesafe-ai/skills)
- 셀프호스팅 Laya가 같은 `POST /v1/systemone` 프로토콜을 제공한다(성능 수치는 자체 주장).

sources-watch가 매 실행 이 값들과 대조해 경보를 낸다(`docs-models`의 새 모델·가격·한도·언어 문구, `npm-sdk-js`·`pypi-sdk-py`의 버전).

## 소스 — Jev (`--registry jev`)

등급: A 공식 · B 큐레이션 커뮤니티 · C 해설·스냅샷.

| id | 등급 | 방법 | 주기 | 왜 | URL |
|---|---|---|---|---|---|
| `docs-sitemap` | A | sitemap | every-run | 페이지별 lastmod — 새 모델·약점 페이지·쿡북 변경을 가장 싸게 감지 | https://docs.typesafe.ai/sitemap.xml |
| `docs-llms` | A | llms-txt | every-run | 문서 페이지 목록(09-26 기준 링크 111) | https://docs.typesafe.ai/llms.txt |
| `docs-models` | A | page-hash | every-run | 모델·별칭·가격·한도·언어 | https://docs.typesafe.ai/models.md |
| `docs-jaggedness` | A | page-hash | every-run | 약점 목록 — 질문셋 린트 규칙의 근거 | https://docs.typesafe.ai/model-jaggedness/jev-1.13.md |
| `docs-api` | A | page-hash | every-run | 요청·응답 모양 — jev-client 검증기와 대조 | https://docs.typesafe.ai/api.md |
| `docs-agent-skill` | A | page-hash | every-run | 공식 스킬 설치·업데이트 명령 | https://docs.typesafe.ai/agent-skill.md |
| `npm-sdk-js` | A | npm | every-run | JS SDK 버전(0.6.0에 breaking 있었음) | https://registry.npmjs.org/@typesafe-ai/sdk |
| `pypi-sdk-py` | A | pypi | every-run | Python SDK 버전 | https://pypi.org/pypi/typesafe-sdk/json |
| `git-typesafe-skills` | A | git-head | every-run | 공식 에이전트 스킬 — 바뀌면 전역 플러그인 업데이트 | https://github.com/typesafe-ai/skills |
| `git-typesafe-sdk-js` | A | git-head | every-run | SDK 리포 HEAD | https://github.com/typesafe-ai/typesafe-sdk-js |
| `catalog-kydlikebtc` | B | catalog-json | weekly (목 06:00 UTC 자동 발굴) | 기계 판독 사례 카탈로그 — 패턴·question_types·first_seen·부정 결과 | https://raw.githubusercontent.com/kydlikebtc/awesome-jev/main/catalog.json |
| `yibie-readme` | B | markdown-links | daily-ish | HackerNoon 101의 출처 목록 | https://raw.githubusercontent.com/yibie/awesome-jev/main/README.md |
| `yibie-finance` | B | markdown-links | daily-ish | 금융·트레이딩 분류 — TVSE와 가장 가까운 새 사례 | https://raw.githubusercontent.com/yibie/awesome-jev/main/categories/finance-trading.md |
| `logicrw-readme` | B | markdown-links | auto-sync | 자동 동기화 목록 · 한국어 README 있음 | https://raw.githubusercontent.com/logicrw/awesome-jev-projects/main/README.md |
| `omnijev-readme` | B | markdown-links | PR | 독립 평가(긍정·부정) 목록 | https://raw.githubusercontent.com/OmniJev/awesome-jev-gallery/main/README.md |
| `heyjunpenn-readme` | B | markdown-links | manual | 교차 확인용 목록(jevbest.com) | https://raw.githubusercontent.com/heyjunpenn/awesome-jev/main/README.md |
| `awesomejev-com` | B | page-hash | daily (별 수) | 디렉터리 — 피드 없음, 페이지 해시만 | https://awesomejev.com |
| `gh-topic-jev` | B | page-hash | auto | GitHub topic — 클라우드 세션에서는 403이 정상(확인 불가로 기록) | https://github.com/topics/jev |
| `hackernoon-101` | C | html-numbered-list | static snapshot (2026-09-21) | 사례 101 — 갱신되지 않음. 링크 가용성은 link-check로 전수 확인 | https://hackernoon.com/101-real-world-examples-of-how-to-use-jev |
| `robustness-yifan` | B | tsv | snapshot 갱신(09-24 기준 119건) | 독립 강건성 감사 — 보정·선택지 순서·주입·입력 언어. `references/jev-lens.md` §7 표와 언어 계수의 근거 | https://raw.githubusercontent.com/Yifan-Lan/awesome-jev-robustness/main/data/entries.tsv |
| `abdelstark-resources` | B | catalog-json | auto(last_updated · 커밋 09-26) | 분류별 기계 판독 목록 228(categories[].resources[]를 펼침) | https://raw.githubusercontent.com/AbdelStark/awesome-typesafe-jev/main/resources.json |
| `anilmatcha-readme` | B | markdown-links | manual(커밋 09-23) | 교차 확인용 목록(링크 220) | https://raw.githubusercontent.com/Anil-matcha/awesome-jev-by-typesafe/main/README.md |
| `use-cases-walid` | C | csv | 행마다 snapshot 열 · 커밋 09-21 | 리포 37 — CSV라 diff가 정확 | https://raw.githubusercontent.com/walidboulanouar/awesome-jev-use-cases/main/data/repos.csv |
| `use-cases-walid-more` | C | csv | 같음 | 추가 리포 111(한 줄 설명) | https://raw.githubusercontent.com/walidboulanouar/awesome-jev-use-cases/main/data/more-repos.csv |
| `use-cases-walid-demos` | C | csv | 같음 | X 데모 74 — 게시물은 로그인 벽이라 존재는 미확인 | https://raw.githubusercontent.com/walidboulanouar/awesome-jev-use-cases/main/data/demos.csv |

## 소스 — 플러그인 생태계 (`--registry plugins`)

| id | 등급 | 방법 | 주기 | 왜 | URL |
|---|---|---|---|---|---|
| `mkt-official` | A | marketplace-json | every-run | 공식 마켓(09-26 기준 314) — 새·바뀐 플러그인 | https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json |
| `mkt-community` | A | marketplace-json | every-run | 커뮤니티 미러(2,282) — 대부분 커밋 SHA 고정 | https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json |
| `mkt-anthropic-skills` | A | marketplace-json | every-run | Anthropic 스킬 마켓 | https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json |
| `docs-skills` | A | page-hash | every-run | 스킬 로딩 규칙 | https://code.claude.com/docs/en/skills |
| `docs-plugin-cli` | A | page-hash | every-run | plugin CLI 명령 | https://code.claude.com/docs/en/plugins/cli-reference |
| `agentskills-spec` | A | page-hash | every-run | Agent Skills 표준(name·description 규칙) | https://agentskills.io/specification |
| `npm-skills-cli` | A | npm | every-run | npx skills 설치기 버전(설치 명령·Node 요구) | https://registry.npmjs.org/skills |
| `list-quemsah` | B | markdown-links | auto-crawl | 자동 크롤 색인 | https://raw.githubusercontent.com/quemsah/awesome-claude-plugins/main/README.md |
| `list-composio-skills` | B | markdown-links | manual | 스킬 목록 | https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/README.md |
| `list-hesreallyhim` | B | markdown-links | manual | Claude Code 자원 목록 | https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/README.md |

## 실패의 뜻

- `unavailable`(403·429·5xx·타임아웃) = **확인 불가**. “변화 없음”으로 쓰지 않는다. 이전 스냅샷은 그대로 둔다.
- `parse-suspect` = 목록 파서가 0건. 페이지 구조가 바뀌었을 수 있으니 사람에게 알린다.
- `baseline` = 첫 실행, 또는 레지스트리에서 그 소스의 방법·URL을 바꾼 뒤(옛 스냅샷과 비교하면 거짓 diff가 난다). 새 항목으로 세지 않는다. `--since YYYY-MM-DD`면 날짜(lastmod·first_seen)가 그 뒤인 것을 “최근”으로 따로 보여 준다.
- 스냅샷은 `--update`일 때만 쓴다. 계획 모드·no-write에서는 쓰지 않는다.

## 새 항목을 판단 지점에 연결

새 카탈로그 항목은 “단서”다(HackerNoon 저자: *leads, not endorsements*). 대상의 JP와 연결할 때는 `assets/jev/registry-triage.v1.json`(Jev, 선택) 또는 키워드로 먼저 걸러 “관련 없음”을 기본값으로 두고, 증거 수준을 사람이 매긴다: code-verified · code-present · docs-only · measured · negative-result.

## 인용 리포 (134곳)

`jev.json`의 `repos`에 모두 있다 — HackerNoon 101의 항목 101개(GitHub 91곳 전부 존재 확인 · 09-26 라이브 재대조, 정밀 조사 63곳 — 09-26에 README에서 Jev 호출 흔적이 보인 21곳을 더함, 각 항목의 `reviewed`·`grade`·`flows`·적·비·리) + 이번 조사의 추가 리포(카탈로그 · 공식 SDK · 트레이딩 · 독립 강건성 감사 등). 분류별 수: routing 16 · guardrail 19 · ranking 12 · agent 19 · infra 23 · eval 8 · games 5 · finance 6 · user 3 · reference 3 · official 3 · catalog 9 · robustness 7 · alternative 1. 인용 전에는 `scripts/link-check.mjs`로 다시 확인한다.

경고 목록(`red_flags`): typesafe-register(계정 등록 봇으로 한도 우회를 광고 — 인용·사용 금지) · jev-codex-router(보관(archived)).

## HackerNoon 같은 번호 목록 기사

```bash
curl -s <기사 URL> -o article.html
node "$SKILL_DIR/scripts/link-check.mjs" article.html --parser html-numbered-list --profile > check.json
```
요약 도구(WebFetch)는 링크를 빠뜨릴 수 있다 — 원문 HTML을 파서로 읽는다. X 게시물 같은 로그인 벽은 200이어도 “확인 불가”로 둔다.

## 환경 메모

- 클라우드 세션에서 github.com HTML·비세션 GitHub API는 403일 수 있다 → `git ls-remote --symref`와 raw.githubusercontent.com을 쓴다.
- Node 22.21 미만에서 프록시 뒤라면 fetch가 실패할 수 있다 → `lib/net.mjs`가 GET만 curl로 폴백한다.
