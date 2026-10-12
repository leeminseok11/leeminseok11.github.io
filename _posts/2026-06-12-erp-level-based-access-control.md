---
title: DB에 권한 컬럼을 두지 않는 접근제어 — 직급을 코드에서 레벨로
date: 2026-06-12 20:00:00 +0900
category: 설계
tags: [Django, Vue, 접근제어]
project: erp
description: 직급 문자열을 코드에서 레벨 1~5로 매핑하고, 프론트는 라우트마다 requiresLevel 을 선언해 통제한다. 같은 CRUD 화면도 레벨에 따라 다르게 열린다. 권한 테이블을 안 만든 이유와 그 대가.
---

## 요구

경영성과·예산관리는 임원 이상만, 급여는 레벨 5 이상 **또는** 인사팀만, 일반 CRUD는 모두. 전형적인 ERP 권한이다.

정석은 Role · Permission 테이블을 두고 사용자에 역할을 붙이는 것이다. 하지만 이 프로젝트의 데이터는 Northwind 기반이고, 직원 테이블에는 이미 `title`(직급)이 있다. 대표이사, Vice President, Sales Manager, Inside Sales Coordinator, Sales Representative — 다섯 개. 권한이 직급을 따라가는 조직이라면 **직급이 곧 권한**이다.

## 백엔드 — 매핑은 코드에

```python
# employees/views.py
TITLE_LEVEL = {
    '대표이사': 5,
    'Vice President, Sales': 4,
    'Sales Manager': 3,
    'Inside Sales Coordinator': 2,
    'Sales Representative': 1,
}
```

로그인 응답에 직원의 `level`을 실어 보낸다. DB에는 권한 컬럼이 없다. 직급이 바뀌면 레벨이 자동으로 따라간다. 마이그레이션도 없다.

## 프론트 — 라우트마다 선언

```js
// router/index.js — 라우트가 자기 요구 레벨을 선언한다
{
  path: '/management/performance',
  name: 'managementPerformance',
  component: () => import('@/views/ManagementPerformanceView.vue'),
  meta: { requiresLevel: 4 },
},
{
  path: '/finance/budget',
  name: 'financeBudget',
  component: () => import('@/views/FinanceBudgetView.vue'),
  meta: { requiresLevel: 4 },
},
```

```js
// router.beforeEach — 같은 CRUD 화면도 레벨로 통제
if (to.meta.requiresLevel) {
  if (level < to.meta.requiresLevel) return { name: 'accessDenied' }
}
if (to.meta.requiresHRorLevel5) {
  const allowed = level >= 5 || department === '인사팀'
  if (!allowed) return { name: 'accessDenied' }
}
```

`requiresHRorLevel5`처럼 "레벨 5 이상 또는 특정 부서" 복합 조건도 meta 하나로 선언한다. 급여처럼 민감한 화면에 썼다.

같은 패턴으로 CRUD 엔드포인트는 `_list`(GET/POST)와 `_detail`(GET/PUT/DELETE)로 표준화돼 있어, 화면은 같은 API를 쓰되 **진입 자체를 레벨로** 막는다.

```python
# procurement/views.py — 표준 CRUD 엔드포인트
@api_view(['GET', 'POST'])            # 목록 · 생성
def purchase_order_list(request): ...

@api_view(['GET', 'PUT', 'DELETE'])   # 조회 · 수정 · 삭제
def purchase_order_detail(request, pk): ...
```

## 대가

이 설계에는 분명한 한계가 있다.

- **새 직급이 생기면 코드를 고쳐야 한다.** `TITLE_LEVEL`에 없는 직급은 레벨 0이 된다
- **같은 직급 안에서 예외를 둘 수 없다.** "이 Sales Manager만 예산을 보게"가 안 된다
- 프론트의 라우트 가드는 UX용 통제다. 실제 보호는 API 쪽 검사가 같이 있어야 한다

5주, 2인, 직급 5개짜리 가상 회사에서는 테이블 둘을 더 만들고 관리 화면까지 붙이는 비용이 이 한계보다 컸다. 조직이 커지면 Role 테이블로 옮기면 되고, 그때 옮기기 쉽도록 매핑을 **한 곳(`TITLE_LEVEL`)**에만 뒀다.

<div class="tip">"DB에 저장하지 않는 권한 모델"도 선택지다. 중요한 것은 매핑이 한 곳에 있고, 그 한 곳을 나중에 테이블로 바꿀 수 있게 두는 것이다.</div>
