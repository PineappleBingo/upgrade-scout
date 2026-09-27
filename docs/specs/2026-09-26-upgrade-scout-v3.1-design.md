# upgrade-scout v3.1 통합 설계 명세

- 상태: 설계 확정(2026-09-26) · 구현 전
- 베이스: **v3.0 구현** — `PineappleBingo/claude-sync-kit` main의 `skills/upgrade-scout/`(PR #1 머지, TV-Strategy-Extractor × Jev 세션). 스크립트 13 · 공용 lib 6 · 역할 브리프 8 + 머리말 · JSON 계약 9 · 테스트 44 · selfcheck.
- 얹는 것: RepoReel 세션의 설계 결정 D1–D6(설계 재검토 https://claude.ai/artifact/WujYKoCZtHU4wYTfKRgfEr). 통합 방식 결정(2026-09-26): **v3.0 구현을 살리고 구조를 바꾼다(v3.1)**, **배포 정본은 공개 플러그인 리포**.
- 저장: 플러그인 리포가 생기면 `docs/specs/2026-09-26-upgrade-scout-v3.1-design.md`로 커밋. 사람이 읽는 판은 Upgrade Scout 설계서 아티팩트.

## 1. 목적

어떤 코드베이스든, 사용자가 건넨 레퍼런스(리포 · 설계 문서 · 모델/API 문서 · 생태계 카탈로그)를 기준으로 무엇을 더하거나 고칠지 찾아, 정해진 형식의 리포트로 낸다. 대상 코드는 바꾸지 않고, 대상의 에이전트를 스킬로 옮기지 않으며, 특정 도메인(Jev 등)을 기본값으로 가정하지 않는다.

## 2. v3.0에서 그대로 가져가는 것

절차의 뼈대(대상 분석 · 접점 · 가정·완성품 · 게이트·드리프트·분기 · 후보 리뷰 · 플러그인·스킬 · 딥다이브 · 원장·재확인·블라인드 채점 · 업그레이드 · UI · 제외 · 산출), 역할 브리프 + JSON 계약 + `ledger.mjs` 원장, 합계·판정은 스크립트(`score-table`), 깊이별 동시/총 상한과 실행 메타, 계획 모드 `--no-write`, 시작·끝 `git status --porcelain` 비교, `selfcheck --strict`, 오프라인 테스트, 교훈 1–38, 실행 레퍼런스 표.

에이전트는 v3.0 방식(스킬 안의 **브리프**를 Explore/Plan/general-purpose에 넣어 호출)을 유지한다. `~/.claude/agents` 정의가 필요 없으므로 `npx skills`로 설치해도 빠지는 것이 없다 — D3의 "조수 유지"는 이 브리프들로 충족한다.

## 3. 바뀌는 것 (D1–D6 적용)

### 3.1 도메인 팩 (D1)

Jev 전용인 것을 `packs/jev/`로 옮기고, 코어는 팩이 없어도 완결되게 한다.

| v3.0 위치 | v3.1 위치 | 비고 |
|---|---|---|
| `references/jev-lens.md` | `packs/jev/lens.md` | J1–J12 루브릭 · 감사 기반 설계 규칙 |
| `references/jev-sources.md` · `assets/registry/jev.json` | `packs/jev/sources.md` · `packs/jev/registry.json` | 소스 25 · 리포 134 |
| `assets/jev/*.v1.json` · `target-qset.template.json` | `packs/jev/qsets/` | 질문셋 |
| `scripts/jev-client.mjs` | `packs/jev/scripts/jev-client.mjs` | lint · dry-run · live · replay · validate · health · cost |
| `agents/jev-analyst.md` · `contracts/jev-analyst.schema.json` | 코어 `agents/capability-analyst.md` · `contracts/capability-analyst.schema.json` + `packs/jev/analyst-addendum.md` · `packs/jev/contract-ext.json` | 일반 "모델 능력 분석가"로 바꾸고, J-점수 필드는 팩이 확장 |
| `JEV_MODE` 변수 | 팩 옵션 `jev.mode` (auto · off · lens · lens+scorer) | 최상위 `JEV_MODE`는 호환 별칭으로 계속 받음 |
| `score-table --mode jev` | `score-table --mode <pack>` + 팩이 모드 설정 제공 | |

코어에 남는 범용 부품: `judgment-points.mjs`(코드 속 판단 지점 탐지 — 모델 능력 처리기가 도메인과 무관하게 씀), `sources-watch.mjs`(엔진; 레지스트리는 코어 `plugins.json` + 팩 레지스트리), `plugin-scout` · `ledger` · `score-table` · `history` · `selfcheck` · `inventory` · `drift-probe` · `feature-probe` · `gate-inventory` · `link-check` · `lib/*`.

`packs/jev/pack.md` 머리말: `name` · `version` · `triggers{urls, keywords}` · `provides[lens, sources, qsets, scorer, radar]` · `options{mode}` · `radar{index, live_queries}` · `env[TYPESAFE_API_KEY]` · `checked`. 코어가 레퍼런스·FOCUS를 트리거와 대조해 맞는 팩만 로드한다. 팩은 코어 규칙에 더할 수만 있다. `selfcheck`는 팩 구조(머리말 필드 · 경로 · 레지스트리 id ↔ sources.md)도 검사한다.

### 3.2 레퍼런스 입력 (D2)

- 새 변수 `REFERENCES`: 리포 · 설계 문서 · 모델/API 문서 · 카탈로그 URL/경로를 섞어서. `CANDIDATES`는 리포 레퍼런스의 호환 별칭.
- 새 단계 "유형 판별": 리포 / 설계 문서(원칙·계층·규칙) / 모델 능력(API·모델·요금·한도) / 생태계(레이더·awesome·토픽). 애매하면 묻고 리포트 01장에 판별 결과 표시.
- **설계 문서 처리기(새로):** 역할 `design-mapper`(브리프 + 계약 `mapping`) — 원칙·계층·단계·규칙·실패 모드·측정 여부 추출 → 전제된 플랫폼 제약을 공식 문서로 확인 → 대응표(있음/부분/없음 + file:line) → 빠진 조각 1–3개 → 대상 하드 룰 충돌. "없음" 판정은 `verifier` 재확인 대상.
- **모델 능력 처리기:** `capability-analyst` + `judgment-points`. 팩이 있으면 팩 렌즈·질문셋·채점기가 붙는다.
- **생태계 처리기:** 새 스크립트 `radar.mjs`(3.4) → 상위 N 얕은 클론 → `repo-reviewer`.

### 3.3 렌즈 (D3)

- 새 변수 `LENSES`: `agent-architecture` · `ui` · `self-improving` · `plugins`. `UI_SCOPE` · `PLUGIN_SCOPE`는 호환 별칭(`PLUGIN_SCOPE`의 light/full · 대상용/환경용 세부 옵션은 유지).
- **에이전트 아키텍처 렌즈(새로):** `target-cartographer` 계약에 선택 블록 `agents` 추가 — 에이전트 인벤토리(LLM 호출 · 프롬프트 파일 · 레지스트리 · 큐 · 상태 enum · `.claude/agents`), 조직도 간선, 원칙 8개(단일 출처 · 단일 전이 지점 · 핸드오프 계약 · 생성·판정 분리 · 판정만 · 규칙의 위치 · 재개 경계 · 관측성) 판정, 쪼개기/합치기 후보. 설계 문서 레퍼런스가 있으면 그 원칙이 기준, 없으면 8개가 기준. 리포트에 조직도 · 갭 표 장.
- **자기개선 렌즈(새로, 체크리스트만):** 사람 수정이 학습 신호로 쓰이는가 · 수리 로그 · 예시 승격 경로. 스크립트 없음.

### 3.4 레이더 (D4)

- `references/radar-format.md`: 공통 형식 `radar-index/1` — `data/meta.json`(schema · topic · generated_at · counts · sources · queue) · `data/index.json`(full_name · url · description · summary_ko{what,decision,point} · category{slug,label,emoji,confidence} · keywords · topics · language · license · stars · forks · stars_7d_delta · pushed_at · created_at · first_seen · sources · verified · decision_types · flags · score).
- `scripts/radar.mjs`(코어): 인덱스 받기 → 신선도(48h) → 생성 이후 즉석 보충(팩의 `radar.live_queries`) → FOCUS·판단 지점 키워드로 거르기 → 상위 N 얕은 클론 경로 출력. `sources-watch`(소스 변화 경보)와는 역할이 다르다.
- `PineappleBingo/jev-radar`(공개, 별도 리포)가 첫 인스턴스: 매일 06:00 KST 수집 · Jev 분야 분류 · Gemini 한국어 3줄 요약 · ⭐ · 🍴 · ✅ 코드 검증 · 결정 유형 · 🆕 신규 · 🔥 7일 급상승 · 📚 문서·모델 변경 · README 헤더에 마지막 업데이트. 파서는 `lib/parsers.mjs`를 가져다 쓴다. 형식을 먼저 확정하고 jev-radar와 v3.1을 병행.

### 3.5 배포 (D5 · D6 · 통합 결정)

- 정본: **공개 리포 `PineappleBingo/upgrade-scout`**(MIT) = 플러그인 겸 마켓플레이스. `.claude-plugin/plugin.json`(name `upgrade-scout`, version `3.1.0`) + `marketplace.json`(항목 source `"./"`). 스킬은 `skills/upgrade-scout/`(브리프 폴더 `agents/`는 스킬 안에 두어 플러그인 에이전트로 등록되지 않게).
- 설치: `claude plugin marketplace add PineappleBingo/upgrade-scout` → `claude plugin install upgrade-scout@upgrade-scout`, 또는 `npx skills add PineappleBingo/upgrade-scout -g`. 호출: 플러그인 `/upgrade-scout:upgrade-scout`, npx 설치 `/upgrade-scout`.
- claude-sync-kit: `skills/upgrade-scout/`를 지우고 키트의 전역 플러그인 목록에 upgrade-scout 설치 한 줄(키트 PR). 키트 v3.0 커밋은 이력으로 남고, 플러그인 리포 CHANGELOG에 출처 커밋을 적는다.
- 공개 정리: 개인 아티팩트 링크 · 로컬 경로(`E:\gitprojects\…`) · 프로젝트 예시(RepoReel · TV-Strategy-Extractor)를 자리표시자로. 교훈·실행 레퍼런스의 출처 약어는 남기되 비공개 링크는 설계서에만. README 한국어 + 영어, 스킬 본문 한국어, 트리거 설명에 영어 키워드, 리포트는 사용자 언어.
- 업데이트: 릴리스마다 `version` 올림 · CHANGELOG · `claude plugin validate --strict` · `selfcheck --strict` · 테스트 · `claude plugin tag --push`.
- 이 PC: 로컬 경로 마켓플레이스로 개발. 설치 후 `~/.claude/skills/upgrade-scout`(v2.0)와 `~/.claude/agents/scout-*.md`는 백업 폴더로.

## 4. 검증

- 기존 44 테스트 + selfcheck 유지(경로 이동 반영).
- 추가 테스트: 팩 트리거(Jev 문서 → 로드 / 무관 요청 → 미로드) · 팩 없이 코어 완결 · `design-mapper` 계약 · `target-cartographer` `agents` 블록 · `radar.mjs`(픽스처 인덱스, 신선도, 필터) · 호환 별칭(`JEV_MODE` · `CANDIDATES` · `UI_SCOPE` · `PLUGIN_SCOPE`).
- evals 추가: 설계 문서 기준 리뷰 · 에이전트 아키텍처 렌즈 · 혼합 레퍼런스 · Jev 무관 요청(팩 미발동).
- `claude plugin validate --strict` · `claude plugin details`로 스킬 1 확인 · 플러그인/npx 두 설치 경로에서 `/upgrade-scout` 로드.
- 실사용 3회: 리포 결합 · 설계 문서 기준 리뷰 · Jev 능력(키가 있는 이 PC에서 라이브 1회 — v3.0 리스크 "라이브 미검증" 해소).
- jev-radar: 수집 self-test · 로컬 백필 · Actions 수동 실행 · 두 번째 실행 증분 커밋 · README 렌더.

## 5. 위험

- 경로 이동으로 selfcheck·테스트·문서 참조가 깨짐 → 이동과 selfcheck 갱신을 한 커밋에.
- 호환 별칭이 늘어 SKILL.md가 복잡해짐 → 별칭은 표 하나로, 다음 메이저(v4)에서 제거 예고.
- 두 판 공존(로컬 v2.0 · 키트 v3.0 · 플러그인 v3.1) → 설치 절차에 백업·제거 단계, 설계서가 정본.
- 팩 오발동 · 유형 판별 오류 → 트리거는 URL·명시 키워드만, 애매하면 묻기, 평가 케이스.
- 공개 시 개인 정보 → 공개 전 grep 체크리스트(아티팩트 URL · 로컬 경로 · 이메일 · 키 패턴).
