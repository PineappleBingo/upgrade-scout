# 검색 레시피

## grep 매트릭스

```bash
node "$SKILL_DIR/scripts/feature-probe.mjs" matrix --repos tvse=/p/tvse,cand=/p/cand --keywords keywords.json --format md
```

keywords.json: `[{ "id": "jev", "patterns": ["typesafe", "\\bjev\\b", "/v1/systemone"] }]`. 셀 분류 implemented(코드) · claimed-only(문서만) · absent.

손으로 볼 때:
- `rg -n --hidden -g '!node_modules' -g '!.git' "<패턴>" <경로>`
- 정의 찾기: `rg -n "export (async )?function <이름>|const <이름> ="`
- 스키마: `rg -n "z\.(enum|boolean|object)\(" src` · `rg -n "Literal\[" -t py`

## “없다”를 증명하는 법

없다는 결론에는 **검색 범위**를 같이 적는다: 패턴 목록 · 폴더 · 제외 폴더 · 훑은 파일 수 · 대소문자 · git 역사(`git log --all -S <단어> --oneline`) · 원격 브랜치·PR. `feature-probe assume`이 이 기록을 만든다. 범위가 좁으면 “찾지 못함”이지 “없음”이 아니다.

## 질의 템플릿

- 한국어: `<기능> 오픈소스`, `<기능> 라이브러리 비교`, `<도메인> <기능> 사례`
- 영어: `<capability> open source`, `<capability> github`, `"<exact phrase>" site:github.com`, `<capability> vs <alternative>`
- Jev: `"jev" typesafe <도메인>`, `topic:jev`, `awesome-jev <도메인>`

## 무료 자원 점검

무료 한도마다 **한도 · 출처 URL · 확인일**을 쓴다. 셋 중 하나라도 없으면 “추정”. 가입·키가 필요한 것은 따로 표시한다.

## 드리프트 레시피

```bash
node "$SKILL_DIR/scripts/drift-probe.mjs" scan <target> > scan.json
yt-dlp --help > $W/help/yt-dlp.txt   # 메인이 직접 뜬다(스크립트는 아무것도 실행하지 않음)
node "$SKILL_DIR/scripts/drift-probe.mjs" compare scan.json --help-dir $W/help
node "$SKILL_DIR/scripts/drift-probe.mjs" compare-doc --doc api.md --expect-keys state,questions,criteria
```

## 번호 목록 기사(HackerNoon 류)

요약 도구는 링크를 빠뜨린다 — 원문을 받아 파서로:

```bash
curl -s "<URL>" -o article.html
node "$SKILL_DIR/scripts/link-check.mjs" article.html --parser html-numbered-list --profile --concurrency 8 > check.json
```

`--profile`은 README 첫 문단 · LICENSE · 매니페스트 · README 속 Jev 호출 흔적을 raw로 읽는다.

## GitHub 접근

- 클라우드 세션: github.com HTML·비세션 API가 403일 수 있다 → `git ls-remote --symref <url> HEAD`(존재·기본 브랜치·HEAD), raw.githubusercontent.com(파일), 얕은 클론 `git clone --depth 1 --filter=blob:limit=300k`.
- 403은 “막힘”이지 “없음”이 아니다. link-check는 `unverified`로 적는다.
- 세션에 연결된 리포는 GitHub MCP 도구로 읽을 수 있다.
