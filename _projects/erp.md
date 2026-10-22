---
title: SSAFY International ERP
slug: erp
order: 3
status: 개발 완료
group: SSAFY 15기 · 관통프로젝트
period: 2026.05.25 – 2026.06.26 (5주)
team: 2인 풀스택 (도메인 단위 분담)
role: 구매/BOM · 재고 · 물류 도메인 end-to-end · AI 수요예측 · 경영/영업 대시보드
award: 관통프로젝트 우수상
summary: 영업·구매·재무·인사·물류·재고를 하나로 묶은 ERP. Northwind를 확장한 시드 29,611건 위에서 2인이 백/프론트 구분 없이 도메인을 통째로 나눠 만들었다.
thumbnail: /assets/img/projects/erp-purchase-order.webp
hero: /assets/img/projects/erp-home.webp
hero_alt: ERP 홈 화면 — 캘린더 · 진행 중인 업무 · 근태 · 알림 · 사내 메신저
hero_caption: 홈 화면 — 캘린더, 진행 중인 업무, 근태, 알림, 그리고 WebSocket 사내 메신저(우측 하단)가 한 화면에 모인다.
domains: [백엔드, 프론트엔드, 데이터]
tech: [Django, DRF, Vue 3, Pinia, Chart.js, Django Channels, SQLite]
repo: https://github.com/leeminseok11/erp_pjt
demo: https://glistening-twilight-831e13.netlify.app
---

## 개요

Northwind 데이터셋을 기반으로 한 가상의 국제 무역회사 "SSAFY International"의 통합 ERP입니다. 영업(고객·주문)부터 구매(발주·입고), 생산(BOM), 재무(예산·채권/채무), 인사(근태·급여), 물류(배차)까지 전 영역을 다루고, AI가 매출을 예측하고 그날 해야 할 업무 우선순위를 추천합니다.

<div class="stats">
  <div><b>10</b><span>Django 앱</span></div>
  <div><b>41</b><span>모델(테이블)</span></div>
  <div><b>93</b><span>API 엔드포인트</span></div>
  <div><b>31</b><span>Vue 화면</span></div>
</div>

시스템 전체 규모(2인 팀 전체 기준, 코드에서 직접 측정)입니다.

- **Backend**: Django 5 / DRF / SimpleJWT / dj-rest-auth / Django Channels(WebSocket)
- **Frontend**: Vue 3 (Composition API) / Pinia / Vue Router / Chart.js / Bootstrap 5
- **AI**: GMS(SSAFY API 게이트웨이, OpenAI 호환) — 통계 계산은 서버가 끝내고 AI는 "해설"만
- **데이터**: Northwind 기반 증강 데이터셋 약 3만 건

## 분담

| 담당 | 영역 |
|---|---|
| 팀원 | 프로젝트 초기 셋업, ERD 설계 및 초기 데이터셋 업로드, 인사(employees) 도메인, 사내 메신저(Django Channels) |
| **나** | 영업/구매/재무/재고/물류/급여 도메인 백엔드 전반, Works(캘린더·업무관리·AI 워크플로우 추천) 전체, AI 수요예측(analytics), 영업/경영/성과분석 대시보드, 데이터 정합성 버그 다수 발견·수정 |

두 사람 모두 백엔드 전반에 걸쳐 서로의 기능을 보완하며 커밋했고, 위 표는 각자가 **주로** 설계·구현을 주도한 영역입니다.

## 내가 맡은 것

### 구매/BOM · 재고 · 물류 — API부터 화면까지

도메인 앱마다 `_list`(GET 목록 + POST 생성)와 `_detail`(GET 단건 + PUT/PATCH + DELETE) 두 종류의 함수형 뷰로 패턴을 통일했습니다. PurchaseOrder/GoodsReceipt(구매), Dispatch/Vehicle(물류), Order/Customer(영업) 모두 같은 구조라 새 리소스를 추가할 때 그대로 재사용합니다. 직렬화는 `ModelSerializer` + `source=`로 화면에서 바로 쓸 이름(`supplier_name`, `category_name`)을 서버에서 JOIN 해 내려줍니다.

<figure>
  <img src="/assets/img/projects/erp-purchase-order-modal.webp" alt="발주 관리 화면 — 발주 목록과 발주등록 모달" loading="lazy">
  <figcaption>발주 관리 — 이번달 발주 44건·발주대기 7건·지연 7건 KPI, 검색/상태/물류센터 필터, 발주등록 모달(공급업체·물류센터·품목·예상 발주금액). 상태 배지(발주대기·입고완료)와 지연 표시까지 한 화면에서 처리한다</figcaption>
</figure>

### AI 수요예측

실제 주문 데이터만 쓰고, 부족한 부분은 통계적으로 명확히 처리합니다.

1. **집계** — `unitprice × quantity × (1 - discount)`로 주문별 실매출을 계산하고 연-월로 묶는다
2. **활동 구간 선별** — 월 주문 건수가 임계값 미만인 "희소 구간"은 제외하고, 가장 최근의 연속된 활동 구간만 학습에 쓴다
3. **추세** — 단순 선형회귀로 다음 1~3개월을 예측, 신뢰구간은 `예측값 ± 1.96 × RMSE`(근사 95%)
4. **백테스트** — train/test 75:25로 나눠 MAPE를 재고 `100 - MAPE`를 정확도로 표시
5. **제품별** — 최근 6건을 전·후반으로 나눠 성장률을 추정하고, 현재고 ÷ 평균 판매량 = "공급 가능 월수"로 과잉/부족을 판정

<figure>
  <img src="/assets/img/projects/erp-ai-forecast.webp" alt="AI 예측 화면 — 월별 매출 실적 vs 예측, 95% 신뢰구간, 백테스트 정확도" loading="lazy">
  <figcaption>AI 예측 — 월별 매출 실적(파랑) 위에 다음 3개월 예측(주황 점선)과 95% 신뢰구간 띠를 그린다. 상단 KPI: 백테스트 정확도 83.2% · 2026-07 예측 매출 8,990만원 · 신뢰구간 ±23.8% · 재고과잉 위험 2종. 하단에 "기준일: 데이터상 최신 주문월 · 희소 구간 제외"를 명시했다</figcaption>
</figure>

### Works — 캘린더 · 업무 · AI 워크플로우 추천

로그인한 직원 기준으로 그 주(일~토)의 Task, 그날의 CalendarEvent, 배송 요청일·입고 예정일이 그날인 주문·발주를 모아 우선순위를 추천합니다. 응답은 직원·날짜별 60초 캐시, Task/CalendarEvent가 바뀌면 **그 날짜가 속한 주 전체**의 캐시를 무효화합니다.

### 직급 → 레벨 접근제어

DB에 권한 컬럼을 두지 않고 코드에서 직급 문자열을 레벨 1~5로 매핑합니다. 프론트는 라우트마다 `meta.requiresLevel`을 선언하고 `beforeEach`에서 비교합니다.

```js
// router/index.js — 같은 CRUD 화면도 레벨로 통제
if (to.meta.requiresLevel && level < to.meta.requiresLevel)
  return { name: 'accessDenied' }
```

## 한계

- 결제, 이메일/SMS 알림 같은 외부 연동은 범위에서 제외
- 모바일 반응형은 별도로 대응하지 않음
- 데이터셋이 증강 도구로 주기적으로 갱신되는 구조라, 마이그레이션과 실제 DB 스키마가 어긋나는 일이 반복됐음
