# 계약 — 서브에이전트 답의 형식

## 봉투 (모든 역할)

`assets/contracts/envelope.schema.json`

```json
{ "role": "repo-reviewer", "contract": "upgrade-scout/repo-reviewer@2", "run_id": "2026-09-26-tvse-jev",
  "subject": "hunch", "status": "ok|partial|failed",
  "claims": [{ "id": "rr1", "text_ko": "…", "kind": "fact|absence|number|license|opinion",
    "evidence": [{ "type": "file", "ref": "hunch:packages/core/src/jev.ts:102-169" },
                 { "type": "url", "url": "https://…", "checked": "2026-09-26", "quote": "≤300자" }],
    "recheck": { "cmd": "rg -n validateAnswers packages/core/src", "expect": ">=1" }, "confidence": "high|mid|low" }],
  "gaps_ko": ["…"], "tool_calls": 31 }
```

- json 블록은 **정확히 하나**. 블록 밖 글(Plan의 “Critical Files” 꼬리 등)은 버린다 — `lib/text.mjs extractJsonBlock`.
- `_ko` 필드는 한국어, `_en` 필드는 영어(Jev state로 쓰일 수 있음).
- 역할별 페이로드 키: cartographer `map` · reviewer `review` · researcher `research` · capability-analyst `capability` · design-mapper `mapping` · scout `scouting` · verifier `checks` · blind-scorer `scores` · drafter `sections`.

## id 체계

| 접두어 | 뜻 | 누가 |
|---|---|---|
| K01 | 제약 | cartographer |
| A01 · GAP01 | 자산 · 빈칸 | cartographer |
| T01 · G01 · L01 | 사람 접점 · 게이트 · LLM 호출 | cartographer |
| CP01 | 모델 능력 판단 지점(v3.0 JP01도 받음) | capability-analyst |
| P01 · MP01 | 설계 원칙 · 빠진 조각 | design-mapper |
| RR-<repo>-01 | 리포 항목 | repo-reviewer |
| W01 | 웹 대안 | web-researcher |
| N01 · PS01 | 필요 · 플러그인 후보 | scout |
| C-001 | 전역 주장(합칠 때 부여) | ledger |
| F-01 | 수리 로그 | ledger |
| `<source>#<key>` | 레지스트리 항목 | sources-watch |

## 근거 참조 문법

- 대상: `path/to/file.ts:40` · `path:40-88`
- 후보 리포: `<repo>:path:40-88` (repo는 클론 폴더 이름)
- 웹: `url` + `checked`(YYYY-MM-DD) + `quote`
- 명령: `{ "type": "cmd", "ref": "git log --all -S tv-mcp --oneline" }`

## 허용되는 재확인 명령

`rg` · `grep` · `sed -n` · `ls` · `wc` · `git log` · `git show` · `git ls-files` · `git ls-remote` · `curl -sI` · `curl -s`(공개 URL) · `node "$SKILL_DIR/scripts/<읽기 전용 스크립트>.mjs"`. 설치·빌드·테스트 실행·쓰기 명령은 계약 위반.

## 고치기 규칙

스키마 위반은 한 번 돌려보낸다. 두 번째도 틀리면 메인이 읽을 수 있는 부분만 정규화해 `status: partial`로 싣고, 빠진 부분을 리포트 “실행 메타”에 적는다.

## 검사 명령

```bash
node "$SKILL_DIR/scripts/ledger.mjs" validate repo-reviewer reply.txt
```
