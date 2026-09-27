# 레이더 공통 형식 `radar-index/1`

레이더 = 한 주제(예: Jev)의 공개 구현을 매일 모아 정리한 공개 리포. 생태계 처리기(`$S/radar.mjs`)는 이 형식이면 주제와 무관하게 읽는다. 첫 인스턴스: `PineappleBingo/jev-radar`(Jev 팩 `radar_index`).

## 파일

- `data/meta.json` — `schema`(`radar-index/1`) · `topic` · `generated_at`(ISO 8601) · `counts{total,new_24h,new_7d,verified}` · `sources[{id,url,status,checked_at}]` · `queue{summaries_pending,verification_pending}`
- `data/index.json` — 항목 배열(아래)
- 사람용: `README.md` · `categories/<slug>.md` · `changes/YYYY-MM-DD.md`. 주제별 추가 데이터는 `data/extra/`.

## 항목

| 필드 | 형 | 뜻 |
|---|---|---|
| `full_name` · `url` | 문자열 | `owner/repo` · GitHub 리포 URL(`https://github.com/<owner>/<repo>`만 — 다른 값은 스키마에서 invalid) |
| `description` | 문자열 | 리포 설명 원문 |
| `readme_excerpt` | 문자열 또는 null (선택) | README 첫 문단 원문 발췌(≤300자) |
| `summary_ko` | `{what, decision, point}` 또는 null | 한국어 3줄 요약(무엇 · 판단하는 것 · 포인트). 아직이면 null |
| `category` | `{slug, label, emoji, confidence}` | 분야. confidence는 0–1 또는 null(규칙 분류) |
| `keywords` · `topics` | 문자열 배열 | |
| `language` · `license` | 문자열 또는 null | |
| `stars` · `forks` · `stars_7d_delta` | 정수 | 델타는 이력 8일 미만이면 null |
| `pushed_at` · `created_at` · `first_seen` | ISO 날짜 | |
| `sources` | 문자열 배열 | 어디서 발견했나(`github-search` · `awesome:<id>` · `seed:<id>`) |
| `verified` | `code` · `docs` · `pending` | 코드에 실제 호출이 있나 |
| `decision_types` | 문자열 배열 | 예: `choice`, `score`, `noul` |
| `flags` | 문자열 배열 | `spam-suspect` · `archived` · `fork` · `empty` |
| `score` | 수 | 레이더의 정렬 점수(0–10) |

검증 스키마: `assets/radar-index.schema.json`.
