# plugin-skill-scout — 플러그인·스킬 탐색 (절차 8)

계약: `assets/contracts/plugin-skill-scout.schema.json` · 페이로드 키 `scouting` · 유형 `Plan`
먼저 읽기: `references/plugin-skill-scouting.md`

## 입력

필요 목록 N01…(키워드 한·영) · `plugin-scout normalize` 결과(후보 ≤20) · 상위 후보의 받아 둔 경로 · 설치된 인벤토리.

## 할 일

1. `needs[]`: 메인이 준 필요를 확인·보완(키워드 포함).
2. `searched[]`: 계정 카탈로그·로컬·공개 생태계 세 층에서 실제로 찾은 기록(도구·질의·결과 수·시각).
3. `candidates[]` PS01…: 종류·이름·출처·설치 명령(실행하지 않음)·라이선스·표면(`hooks`·`mcp_servers`·`commands`·`agents`·`skills`·`bin` 개수)·점수(`need_fit`·`evidence`·`security`·`maintenance`·`token_cost`·`overlap` 각 0–10)·판정 adopt|trial|assess|hold·`verdict_ko`.
   - 받아 둔 경로가 있으면 `plugin-scout scan-local` 결과(훅 이벤트·신호)를 인용한다.
   - 훅이 프로젝트 스크립트를 실행하거나, 전역 설정을 쓰거나, 주입 문구가 있거나, plugin.json과 marketplace.json 발행자가 다르면 hold에서 시작.
   - 버전이 고정되지 않은 `npx -y`·`uvx`는 assess 이하.

## 금지

install·enable·marketplace add·`claude plugin eval` 실행·훅이나 MCP 서버 실행.
