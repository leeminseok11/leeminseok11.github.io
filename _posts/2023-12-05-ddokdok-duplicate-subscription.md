---
title: 이미 구독 중인 상품이 다시 뜨는 문제 — 복합 PK와 NOT IN 동적 필터
date: 2023-12-05 20:00:00 +0900
category: 트러블슈팅
tags: [MySQL, PHP]
project: ddokdok
description: 구독 추가 화면에 이미 담은 상품이 다시 노출됐다. DB 층에서는 단일 대리키를 복합 PK 로 바꿔 중복을 원천 차단하고, 화면 층에서는 내 구독 ID 를 조립한 NOT IN 동적 필터로 걸렀다. 빈 NOT IN () 문법 오류는 분기로 방어했다.
---

## 증상

"구독 둘러보기 / 추가" 화면에 **이미 구독 중인 상품이 다시 나온다.** 다시 추가를 누르면 같은 구독이 두 줄 생기고, 홈의 총 구독료가 두 배로 잡힌다.

## DB 층 — 복합 PK

초기 ERD에서 `mysubscriptiontbl`(사용자의 구독)은 자동 증가 대리키 하나를 PK로 두고 있었다. 이러면 같은 사용자가 같은 상품을 두 번 담아도 **DB는 막지 않는다.** 두 행은 PK가 다르니까.

"한 사용자는 한 상품을 한 번만 구독한다"는 비즈니스 규칙은 PK로 표현할 수 있다.

```sql
CREATE TABLE `mysubscriptiontbl` (
  `userId`         int NOT NULL,
  `subscriptionID` int NOT NULL,
  `startedAt`      date NOT NULL,
  `paymentMethod`  varchar(45) NOT NULL,
  PRIMARY KEY (`subscriptionID`, `userId`),           -- 복합 PK: 같은 쌍은 두 번 못 들어간다
  CONSTRAINT `fk_mysub_subscription` FOREIGN KEY (`subscriptionID`)
    REFERENCES `subscriptiontbl` (`subscriptionID`) ON DELETE CASCADE ON UPDATE CASCADE
);
```

이제 중복 INSERT는 DB에서 에러가 난다. 하지만 **에러 메시지를 사용자에게 보여주는 것은 해결이 아니다.** 애초에 담을 수 없는 상품은 화면에 뜨지 않아야 한다.

## 화면 층 — NOT IN 동적 필터

사용자의 구독 ID를 먼저 모아 문자열로 조립하고, 상품 목록 쿼리에 `NOT IN (...)`으로 붙인다.

```php
// add-subscription.php (발췌)
$sql = "SELECT sc.*, sp.name AS company
        FROM subscriptiontbl sc
        JOIN serviceprovidertbl sp ON sc.serviceProviderID = sp.serviceProviderID";

// 검색어가 없을 때 WHERE 1 — 뒤에 붙는 AND 조건이 항상 성립하도록
if (!empty($searchTerm)) {
    if ($searchType == "company") {
        $sql .= " WHERE sp.name LIKE '%{$searchTerm}%'";
    } elseif ($searchType == "service") {
        $sql .= " WHERE sc.name LIKE '%{$searchTerm}%'";
    }
} else {
    $sql .= " WHERE 1";
}

// 내 구독 ID 조립: "3,7,12"
$mRes = mysqli_query($connect, "SELECT * FROM mysubscriptiontbl WHERE userId=$userid");
$msc_data = "";
$first = true;
while ($mRow = mysqli_fetch_array($mRes)) {
    $msc_data .= ($first ? "" : ",") . $mRow['subscriptionID'];
    $first = false;
}

// 신규 사용자는 구독이 없다 → NOT IN () 은 문법 오류 → 분기로 방어
if (!empty($msc_data)) {
    $sql .= " AND sc.subscriptionID NOT IN (" . $msc_data . ")";
}
$sql .= " ORDER BY sc.price ASC";
```

두 가지 작은 결정이 있다.

- **`WHERE 1`** — 검색어가 없을 때도 뒤의 `AND NOT IN`이 문법적으로 붙을 수 있게 항상 참인 조건을 깔아 둔다. 조합 가능한 쿼리 조각을 만드는 흔한 기법이다
- **빈 `NOT IN ()` 방어** — 신규 사용자는 구독이 없어 `$msc_data`가 빈 문자열이다. `NOT IN ()`은 MySQL 문법 오류다. 비어 있으면 조건 자체를 붙이지 않는다

같은 쿼리 조합을 **광고 클릭 경로**도 재사용한다. 배너를 클릭하면 `update-clicks.php`가 클릭을 집계한 뒤 `add-subscription.php?searchType=company&searchTerm={회사명}`으로 보내고, 같은 화면이 그 회사의 상품 중 아직 안 담은 것만 보여준다.

## 결과

중복 구독 시도가 화면에서 원천 차단됐다. DB 제약은 '에러 메시지'가 아니라 **'최후의 안전망'**으로 물러났다 — 화면이 걸러 주고, 혹시 놓쳐도 DB가 막는다.

<div class="tip">무결성은 DB가, 경험은 화면에서. 같은 규칙을 두 층에 두되 역할을 다르게 — DB는 "절대 안 된다", 화면은 "애초에 보이지 않는다".</div>
