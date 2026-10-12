---
title: 운영 DB에 들어갈 뻔한 더미데이터 — 환경변수 한 줄로 만든 게이트
date: 2026-09-10 18:30:00 +0900
category: 인프라·운영
tags: [Flyway, Spring Boot, Docker, 배포]
project: sobi
description: 스키마 변경 배포 직전, Flyway 경로에 재실행형(R__) 더미데이터가 들어 있었다. 코드 수정을 기다리는 대신 서버 compose 에 SPRING_FLYWAY_LOCATIONS 한 줄을 덮어써 로컬은 유지하고 서버만 차단했다. 성공 기준은 숫자로 미리 정했다.
---

## 상황

스키마 변경이 포함된 배포 직전이었다. 마이그레이션 디렉터리를 훑다가 `R__` 접두사가 붙은 파일을 봤다. Flyway에서 `R__`은 **Repeatable** — 체크섬이 바뀔 때마다 다시 실행되는 스크립트다. 내용은 개발용 더미데이터였고, 주석에는 이렇게 적혀 있었다.

> 배포 시 삭제해야 함

삭제되지 않은 채 배포 브랜치에 들어와 있었다. 이대로 올리면 운영 DB에 더미 사업자와 더미 공고가 들어가고, 더 나쁘게는 **체크섬이 바뀔 때마다 다시** 들어간다.

<div class="warn">"배포 시 삭제해야 함"은 사람의 기억에 거는 안전장치다. 기억은 배포 직전의 바쁜 시간에 가장 먼저 사라진다.</div>

## 선택

코드를 고쳐 달라고 하고 기다릴 수도 있었다. 하지만 그 파일은 로컬 개발에는 필요한 것이었고, 백엔드 팀이 지금 당장 경로를 분리할 여유도 없었다. 그리고 다음에 또 누가 `R__` 파일을 추가하면 같은 일이 반복된다.

**서버에서만 경로를 바꾸면 된다.** Spring Boot는 환경변수로 설정을 덮어쓸 수 있다. 서버 compose에 한 줄을 넣었다.

```yaml
# deploy/docker-compose.app.yml (발췌)
services:
  backend:
    environment:
      SPRING_FLYWAY_BASELINE_ON_MIGRATE: "true"
      SPRING_FLYWAY_LOCATIONS: classpath:db/migration   # 더미데이터 경로는 여기 없다
```

- 로컬: 기존 설정 그대로 — 더미데이터 포함, 개발 편의 유지
- 서버: `classpath:db/migration`만 — 더미데이터 경로는 아예 스캔 대상이 아니다

코드는 한 글자도 안 바꿨다. 앞으로 누가 더미 스크립트를 추가해도, 그 경로에 있는 한 운영에는 안 들어간다.

## 성공 기준을 숫자로 먼저 정하기

"배포하고 DB를 열어 더미가 있나 본다"는 검증은 약하다. 더미가 어떤 모양인지 알아야 하고, 있다는 것을 못 찾을 수도 있다. 대신 Flyway가 배포 로그에 찍는 숫자를 기준으로 삼았다.

- 차단되면 `validated 9` — 정규 마이그레이션 9개만
- 뚫리면 `validated 12` — 더미 스크립트 3개가 더해져서

배포 로그에 `Successfully validated 9 migrations`가 찍혔다. 끝.

## 결과

이후 **배포 40여 회 + DB 리셋 1회** 동안 운영 DB의 `flyway_schema_history`에 REPEATABLE 항목 **0건**.

<div class="tip">사람의 기억에 걸지 않고 구조로 막는다. 그리고 "됐는지"를 확인할 방법은 손대기 전에 숫자로 정해 둔다. 9냐 12냐는 논쟁의 여지가 없다.</div>
