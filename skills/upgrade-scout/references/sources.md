# 소스 — 코어 레지스트리

코어가 직접 감시하는 소스(`assets/registry/plugins.json`). 도메인 소스는 각 팩의 `sources.md`에 있다(예: `packs/jev/sources.md`). 명령: `$S/sources-watch.mjs --registry plugins`.

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
