---
title: 똑독 (DDOKDOK)
slug: ddokdok
order: 5
status: 구현 기록
group: 영남대 · 데이터베이스 과목 팀 프로젝트
period: 2023.09 – 2023.12
team: 4인 (기능 단위 분담)
role: 사용자 화면 4개 구현 · 7개 테이블 ERD 공동 설계
summary: 구독 관리 + 타겟 광고 플랫폼 — "구독을 똑똑하게". 흩어진 구독 결제일과 금액을 한눈에 보고, 서비스 제공자는 성별·연령 타겟 배너로 신규 고객을 만난다.
thumbnail: /assets/img/projects/ddokdok-thumb.svg
domains: [데이터베이스, 백엔드]
tech: [PHP, MySQL, Apache]
repo: https://github.com/leeminseok11/subscribe_pjt
---

## 배경

<dl class="kv">
  <dt>시장</dt><dd>OTT, 소프트웨어, 생필품 등 구독 서비스의 급격한 증가로 지출 관리가 어려워졌다</dd>
  <dt>문제</dt><dd><b>사용자</b>는 여러 플랫폼에 흩어진 구독 결제일과 금액을 한눈에 파악하기 힘들고, <b>제공자</b>는 신규 서비스를 타겟 고객에게 노출할 효율적인 채널이 부족하다</dd>
  <dt>솔루션</dt><dd>통합 지출 관리 + 데이터 기반 구독 서비스 추천(타겟 광고) 시스템</dd>
</dl>

## 스키마 — 7개 테이블

4인이 공동으로 설계했습니다. MySQL 8.0 덤프 기준입니다.

| 테이블 | 역할 | 설계 결정 |
|---|---|---|
| `usertbl` | 사용자 | `email`·`phonenumber` UNIQUE, `birth` 범위 CHECK |
| `serviceprovidertbl` | 서비스 제공자(회사) | `name`·`websiteURL` UNIQUE |
| `subscriptiontbl` | 구독 상품 | `price`, `renewperiod` — 시작일 + 주기로 다음 결제일을 파생 계산 |
| `mysubscriptiontbl` | 사용자의 구독 | **복합 PK `(subscriptionID, userId)`** — 중복 구독 원천 차단, FK CASCADE |
| `mysubscriptiontbl_log` | 구독 등록/해지 이력 | 변경 유형·시각을 로그 테이블에 적재 |
| `paymentinformationtbl` | 결제 내역 | 사용자 FK CASCADE |
| `advertisementtbl` | 타겟 광고 | `targetgender`·`targetage`, `clicks`·`impressions` 집계 |

## 내가 맡은 화면

- **사용자 홈** — 3중 조인 한 번으로 서로 다른 회사의 구독을 모아 다음 결제일 순 정렬 · 총 구독료 계산
- **구독 둘러보기 / 검색 / 추가** — 회사명·서비스명 검색, 이미 구독 중인 상품은 `NOT IN (...)` 동적 필터로 제외
- **구독 등록 / 해지 처리**
- **광고 클릭 처리** — 성별·연령대 타겟 배너 노출 → 클릭 집계 → 해당 회사 구독 목록 → 구독 추가로 이어지는 전환 경로

```php
// add-subscription.php (발췌) — 검색어가 없으면 WHERE 1 로 뒤의 AND 가 항상 성립하게
$sql = "SELECT sc.*, sp.name AS company
        FROM subscriptiontbl sc
        JOIN serviceprovidertbl sp ON sc.serviceProviderID = sp.serviceProviderID";
if (!empty($searchTerm)) {
    $sql .= ($searchType == "company")
        ? " WHERE sp.name LIKE '%{$searchTerm}%'"
        : " WHERE sc.name LIKE '%{$searchTerm}%'";
} else {
    $sql .= " WHERE 1";
}
if (!empty($msc_data)) {                       // 내 구독 ID 목록이 비어 있으면 NOT IN () 문법 오류 — 분기로 방어
    $sql .= " AND sc.subscriptionID NOT IN (" . $msc_data . ")";
}
$sql .= " ORDER BY sc.price ASC";
```

배너 광고는 사용자의 성별과 연령대(10살 단위로 내림)를 인자로 저장 프로시저 `getAdvertisement(age, gender)`를 호출해 고릅니다.

## 문제 해결 기록

- [이미 구독 중인 상품이 다시 뜨는 문제 — 복합 PK와 NOT IN 동적 필터](/posts/ddokdok-duplicate-subscription/)
