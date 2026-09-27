# Jev 팩 — capability-analyst 부록

`capability-analyst`가 Jev(TypeSafe System One) 문서를 다룰 때 붙이는 추가 지시. 기준·근거는 `packs/jev/lens.md`.

- `subject`: `TypeSafe Jev (<모델 버전>)`, `pack`: `jev`, `registry_as_of`: `$S/sources-watch.mjs --registry jev` 결과의 as_of.
- `points[].id`는 `CP01…`(v3.0의 `JP01…`도 받음). `primitive`는 `choice|score|noul|none`.
- `pack_scores.j`: J1–J12 각 0·1·2(`packs/jev/criteria.json`). 합계·판정은 내지 않는다 — 메인이 `$S/score-table.mjs <지점 파일> --mode jev`로 낸다. 지점 파일 항목은 `{ id, label: decision_ko, j: pack_scores.j }`.
- `triage`: NOT_FIT 대신 `NOT_FOR_JEV`를 써도 된다(같은 뜻).
- `question_sketch`: 영어 `instructions_en`·`criteria_en`(한국어 금지), no-match 선택지 포함. `node "$SKILL_DIR/packs/jev/scripts/jev-client.mjs" lint`를 통과해야 한다.
- 원장·라벨이 없는 지점은 J9 = 0. 한국어만 있는 state는 J6 ≤ 1.
