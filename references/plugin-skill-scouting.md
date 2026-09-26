# 플러그인·스킬 스카우팅

“이런 플로우가 필요해”·“플러그인/스킬 찾아줘”, 또는 standard·deep의 가벼운 점검. **설치·활성화·마켓 추가는 사용자 동의 없이 하지 않는다.**

## 1. 필요 뽑기

FLOW 문장 · 사람 접점(T) · 빈칸(GAP)에서 필요 N01…을 만든다. 필요마다 한국어·영어 키워드 3–6개와 **누구를 위한 것인지**를 적는다 — 대상 프로젝트용(제품에 들어갈 라이브러리·MCP) · 내 작업 환경용(개발 세션의 스킬·플러그인). 둘은 평가 기준이 다르다(대상용은 라이선스·런타임 비용, 환경용은 상시 토큰·훅). 예: “매일 새 전략 영상을 찾아 요약” → `youtube, transcript, daily, digest, 유튜브, 자막`.

## 2. 세 층을 모두 찾는다

| 층 | 무엇 | 명령·도구 |
|---|---|---|
| 계정 카탈로그 | 사용자 claude.ai 카탈로그 | 세션 도구 SearchPlugins · SearchSkills(키워드 ≤8, 각 ≤64자) · ListPlugins · ListSkills |
| 로컬 | 이미 설치한 것 | `claude plugin list --json --available` · `claude plugin marketplace list --json` · `~/.claude/skills` · `npx skills list` |
| 공개 생태계 | 마켓·목록·레지스트리 | `sources-watch --registry plugins` · `npx skills find <kw>`(npm 캐시를 채우므로 write-scratch에서만) · awesome 목록 · SearchMcpRegistry(있으면) · Jev 관련은 `assets/registry/jev.json` |

`claude plugin search`는 없다. 클라우드 세션은 사용자가 로컬에 설치한 플러그인을 로드하지 않는다 — 계정 카탈로그와 공개 생태계로 판단하고 로컬 확인은 사용자 몫으로 남긴다. 검색마다 도구·질의·결과 수·시각을 기록한다.

## 3. 후보를 한 형식으로

```bash
node "$SKILL_DIR/scripts/plugin-scout.mjs" normalize search-plugins.json cli-list.json marketplace.json --needs needs.json --installed cli-list.json
```

## 4. 평가 — 설치 전에 볼 것

1. **매니페스트**: `.claude-plugin/plugin.json`·`marketplace.json`(현행 형식: 최상위 `name`·`owner`·`plugins[{name, source}]`). 옛 형식(최상위 `marketplace`)은 아이디어만.
2. **정적 훑기**: 후보를 `$W/repos/`에 얕게 받아 `plugin-scout scan-local <dir>` — 훅 이벤트·명령, MCP(stdio·원격·버전 고정), `bin/`, 스킬 문구, 신호(네트워크·실행·비밀·전역 설정 쓰기·무고정 npx·release-age 우회·주입 문구·자동 실행 지시·프로젝트 스크립트 실행), plugin.json ↔ marketplace.json 발행자 불일치.
3. **검증**: 사용자가 로컬에서 `claude plugin validate <path> --json [--strict]` · `claude plugin details <name>`(상시 토큰 비용).
4. **라이선스·활동**: LICENSE 파일 · 마지막 커밋(`git ls-remote`) · 커밋 한두 개짜리·README만 있는 리포 주의.
5. **발행 티어·도달**: anthropic · partner · community / contained · remote · privileged.

점수는 `references/rubric.md` §3(적합×3 · 근거×2 · 보안×2 · 유지 · 토큰 · 중복).

## 5. 판정

| 판정 | 조건 |
|---|---|
| adopt | 필요와 맞고 훅·원격·무고정이 없거나 이유가 분명 — 설치 명령을 보여 주고 동의를 받는다 |
| trial | 조건부: 버전 고정(`name@x.y.z`·`#ref`), 샌드박스, 손으로만 실행, 키 필요 |
| assess | 방법·질문셋·설계만 가져온다 |
| hold | 훅이 프로젝트 스크립트 실행·전역 설정 쓰기·주입 문구 · 발행자 불일치 · privileged · 라이선스 없음 · 필요와 무관 |

`plugin-scout`의 판정은 “기계 제안”이다. 최종 판정과 이유는 메인이 쓴다. 통과한 eval은 보안 검토가 아니다.

## 6. 시험 방법 (동의 후)

- `npx skills use <source>` — 설치 없이 한 번 써 보기
- 임시 프로젝트에 project scope로 설치 → 확인 → 제거
- `claude plugin eval --max-cost-usd <n>` — 플러그인 유무 비교(비용 발생)

## 7. 결과 남기기

판정을 `assets/registry/plugins.json`의 `verdicts` 형식(이름·출처·티어·구성·점수·판정·이유·실행 id)으로 리포트 부록에 싣는다. 다음 실행은 바뀐 것(버전·훅·HEAD)만 다시 본다. 설치는 사용자가 동의하면 SuggestPluginInstall이나 설치 명령 안내로.
