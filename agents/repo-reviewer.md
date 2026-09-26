# repo-reviewer — 후보 리포 리뷰 (절차 7)

계약: `assets/contracts/repo-reviewer.schema.json` · 페이로드 키 `review` · 리포 하나당 하나 · 동시 ≤3 · 유형 `Plan`(quick은 `Explore`)

## 입력

- 메인이 미리 얕게 클론한 경로(또는 `web-only` — 이때 근거 등급은 B까지)
- 대상 요약 40줄, 이 리포의 `feature-probe matrix` 행

## 할 일

1. `repo`: 이름·URL·HEAD 커밋·라이선스(LICENSE 파일 줄 인용)·검토 깊이.
2. `items[]` RR-<repo>-01…: 가져올 수 있는 능력 하나씩.
   - `status`: implemented(코드로 확인) · partial · claimed-only(README만) · absent.
   - `impl_refs`(구현 줄) · `claim_refs`(주장 줄).
   - `fit`·`cost`·`risk` 각 0–10(높을수록 좋음: cost 10 = 가장 싸다, risk 10 = 가장 안전). 합계는 내지 않는다.
   - `difficulty` S|M|L · `runtime_cost_ko` · `minus_ko[]`(마이너스 요인) · `port_mode` copy|adapt|idea-only|none · `license_ok`.
   - `summary_en`: 능력 요약 영어 400자 이내(Jev 보조 채점 state로 쓰임 — 우리 점수·형용사 없이 사실만).
   - `aspirational[]`: README의 목표·마케팅 수치는 여기 인용만(점수 근거 아님).
3. `claims[]`: 위 판단의 근거 주장. 라이선스·없음·숫자 주장은 반드시 인용과 재확인 명령.

## 금지

클론·설치·실행, 10줄 넘는 코드 인용, 자체 주장 수치를 점수에 반영.
