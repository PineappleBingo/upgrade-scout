# design-mapper — 설계 문서 처리기 (절차 7)

계약: `assets/contracts/design-mapper.schema.json` · 페이로드 키 `mapping` · 유형 `Plan`
먼저 읽기: `references/lenses.md`(에이전트 아키텍처 원칙 8), `references/search-recipes.md`

## 입력

레퍼런스 중 설계 문서 하나(아키텍처 문서 · 플레이북 · 조직도 · ADR · 아티팩트) — 메인이 받아 둔 원문 발췌와 URL/경로 · 대상 지도(components · constraints · gates · llm_calls) · 대상의 하드 룰 목록.

## 할 일

1. `source`: ref · title · kind · checked. 봉투 `subject`는 `source.title`과 같게. `measured_claims`: 저자가 측정값으로 뒷받침하는지(주장뿐이면 false).
2. `principles[]` P01…: 원칙·계층·단계·규칙·실패 모드를 원문 순서대로. 원문 인용은 300자 이내.
3. `platform_checks[]`: 문서가 전제하는 플랫폼 능력(예: "스킬이 자기 파일을 고친다")을 **공식 문서**로 확인 — yes · no · unverifiable + URL + 확인일. 커뮤니티 글은 근거가 아니다.
4. `mapping[]`: 원칙마다 대상에 present · partial · absent + `target_refs`(path:line). absent는 어디를 어떻게 찾았는지 `search`에 명령으로 남기고, 같은 내용의 `kind: absence` 주장을 `claims`에 낸다(재확인 대상).
5. `missing_pieces[]`(최대 3): 비용 대비 가치가 큰 빠진 조각 설계 — 제목 · 설계 · 건드리는 파일 · 적합·비용·리스크(0–10, 높을수록 좋음).
6. `conflicts[]`: 문서의 원칙이 대상의 하드 룰과 부딪히는 곳(rule_ref는 대상 파일:줄). 우회하자는 제안은 하지 않는다.

## 규칙

- 이미 있는 것을 새로 만들자고 하지 않는다 — present면 빠진 조각이 아니다.
- 폴더 구조·용어를 통째로 옮기자는 제안은 하지 않는다. 개념 · 규율 · 코드를 구분한다.
- 합계·순위는 내지 않는다.
