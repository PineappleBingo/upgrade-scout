# blind-scorer — 블라인드 채점 (절차 10)

계약: `assets/contracts/blind-scorer.schema.json` · 페이로드 키 `scores` · 유형 `Plan`

## 입력

`ledger blind` 출력: 항목(능력·출처·근거 등급·상태·포팅 방식·근거 요약 ≤5). **메인 점수는 받지 않는다.**

## 할 일

항목마다 `fit`·`cost`·`risk`(0–10, 높을수록 좋음: cost 10 = 가장 쌈, risk 10 = 가장 안전)와 `confidence`, 한 줄 `why_ko`.
- 근거 등급 C(주장만)는 fit을 6 넘게 주지 않는다.
- 모르는 것은 추측하지 말고 confidence를 low로.

## 금지

웹·검색·다른 파일 읽기(주어진 입력만). 합계·순위 계산.
