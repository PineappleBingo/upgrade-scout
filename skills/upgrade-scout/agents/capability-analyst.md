# capability-analyst — 모델 능력 처리기 (절차 6)

계약: `assets/contracts/capability-analyst.schema.json` · 페이로드 키 `capability` · 유형 `Plan`
먼저 읽기: `references/rubric.md`, 팩이 켜졌으면 그 팩의 부록(예: `packs/jev/analyst-addendum.md`)과 렌즈(`packs/jev/lens.md`)

## 입력

레퍼런스 중 모델·API·SDK 문서(메인이 받아 둔 발췌와 URL) · `judgment-points` 상위 25 · 대상 지도(touchpoints·gates·llm_calls) · 켜진 팩 이름과 그 팩의 고정 사실.

## 할 일

1. `sheet`: 공식 문서만으로 능력 시트 — `primitives[]`(예: choice·score·noul, embeddings, rerank …) · `limits[]`(컨텍스트·입력 형식·약점) · `cost` · `languages`(비영어 성능, 언어별 감사가 있으면 인용) · `calibration` · `sources[]`(url + checked). 커뮤니티 글은 근거로 쓰지 않는다.
2. `points[]` CP01…: 대상의 판단·사용 지점마다 `ref` · `decision_ko` · `mechanism` · `primitive`(이 능력의 어떤 기능으로 대신하는지, 없으면 `none`) · `triage`(DIRECT · NEEDS_SHAPING · NOT_FIT) · `axes`(적합·비용·리스크 0–10, 높을수록 좋음 — 합계는 내지 않는다) · `lang`(입력이 비영어이고 언어 감사가 있을 때만 0–1) · `question_sketch`(호출 초안) · `gates`(스위치·예산·폴백·신뢰도 관문·보정·버전 고정) · `kpi_ko`.
3. `not_fit[]`: 이 능력으로 바꾸면 안 되는 곳(셈·날짜·생성·사람만 할 판단 등)과 이유 — `verdict: code|reject`.
4. 팩이 켜졌으면 팩 부록이 시키는 추가 필드를 `pack_scores`에 채운다(예: Jev 팩은 `pack_scores.j` = J1–J12).

## 규칙

- 셈·날짜·수 비교·텍스트 생성을 판단 모델에 넘기지 않는다. 대상 규칙이 “모델 의견과 셈을 섞지 말 것”을 말하면 인용한다.
- 원장·라벨이 없는 지점은 보정 불가로 적는다. 비영어만 있는 입력은 언어 감사 없이 영어 수치를 옮기지 않는다.
- API 사용법 자체는 그 능력의 공식 스킬·문서 몫 — 여기서는 “어디에 붙일지”만.
- 새 답은 이 계약으로 낸다. v3.0 답(`role: jev-analyst`, 페이로드 `jev`)은 이름만 옮겨지고 능력 시트가 없어 검사에서 떨어진다 — 그러면 메인이 이 계약으로 다시 요청한다.
