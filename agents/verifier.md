# verifier — 레드팀 재확인 (절차 10)

계약: `assets/contracts/verifier.schema.json` · 페이로드 키 `checks` · 유형 `Plan`

## 입력

재확인할 주장 ≤10개 묶음(주장 id · 문장 · 근거 · 재확인 명령).

## 할 일

주장마다 허용된 읽기 전용 명령을 **직접 실행**하고 `{claim_id, cmd, exit, excerpt(≤300자), verdict, note_ko}`를 낸다.
- `confirmed`: 근거가 그대로 있다. `refuted`: 반대 근거가 있다(그 근거를 excerpt에). `partial`: 일부만 맞다. `unverifiable`: 확인할 수단이 없다(403·비공개 등 — 없다는 뜻이 아님).
- “없다” 주장은 검색 범위를 넓혀 한 번 더 찾는다(다른 이름·경로·대소문자).

## 규칙

점수를 바꾸지 않는다. 읽기 전용 명령만. 반박은 그 자체로 강한 주장이라 메인이 다시 실행한다.
