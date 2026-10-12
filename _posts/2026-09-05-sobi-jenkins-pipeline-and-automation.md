---
title: 빌드번호 태그와 4초 롤백 — 사람이 안 봐도 도는 운영 자동화
date: 2026-09-05 19:00:00 +0900
category: 인프라·운영
tags: [Jenkins, CI/CD, Docker, 백업, 모니터링]
project: sobi
description: master 는 빌드→배포, develop 은 빌드 검증만. 이미지를 빌드번호와 latest 로 이중 태깅해 롤백을 4초로 만들고, 백업·감시·인증서 갱신을 cron 에 맡긴 기록. 첫 배포 전 설정 대조로 실패 요인 3건을 미리 잡았다.
---

## 파이프라인 — 조건부 병렬 빌드

Jenkinsfile 하나로 backend · frontend · ai 세 이미지를 **병렬로** 빌드한다. 각 스테이지는 해당 디렉터리에 Dockerfile과 빌드 파일이 있을 때만 돈다 — 초반에 아직 Dockerfile이 없는 파트가 있어도 파이프라인이 깨지지 않게 하려는 것이다.

```groovy
// Jenkinsfile (발췌)
options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()            // 배포가 겹치지 않게
}
stage('Build') {
    parallel {
        stage('backend') {
            when { expression { fileExists('backend/Dockerfile') && (fileExists('backend/build.gradle') || fileExists('backend/pom.xml')) } }
            steps { sh 'docker build -t sobi-backend:$BUILD_NUMBER -t sobi-backend:latest backend' }
        }
        stage('frontend') { /* 같은 패턴 */ }
        stage('ai')       { /* 같은 패턴 */ }
    }
}
stage('Deploy') {
    steps {
        sh '''
            SVCS=""
            docker image inspect sobi-backend:latest  >/dev/null 2>&1 && SVCS="$SVCS backend"
            docker image inspect sobi-ai:latest       >/dev/null 2>&1 && SVCS="$SVCS ai"
            docker image inspect sobi-frontend:latest >/dev/null 2>&1 && SVCS="$SVCS frontend"
            [ -n "$SVCS" ] && docker compose -f $COMPOSE up -d $SVCS
        '''
    }
}
post {
    failure { echo "FAILED #${env.BUILD_NUMBER}  →  롤백: /home/ubuntu/infra/rollback.sh <서비스> <이전번호>" }
}
```

### 빌드번호 + latest 이중 태깅

이미지를 `sobi-backend:$BUILD_NUMBER`와 `sobi-backend:latest`로 **두 번** 태깅한다. compose는 `latest`를 보고, 롤백은 빌드번호로 한다. 이전 번호의 이미지를 `latest`로 다시 태깅하고 `up -d`하면 끝이라 **약 4초**다. 빌드를 다시 돌릴 필요가 없다.

### master / develop 분리

- `master` → 빌드 → 배포
- `develop` → **배포와 같은 이미지 빌드로 검증만** — 빌드가 실패하면 배포 단계가 건너뛰어져 운영 서버가 보호된다

## 첫 배포 전 설정 대조

첫 배포를 돌리기 전에 로컬 설정과 서버 설정을 나란히 놓고 대조했다. 실패 요인 3건이 미리 나왔다.

1. **Java 버전 불일치** — 빌드 이미지와 런타임 이미지의 JDK가 달랐다
2. **context-path 누락** — nginx가 `/api`로 넘기는데 Spring 쪽 context-path 설정이 없었다
3. **Flyway 설정 위치** — 프로파일별 설정 파일에서 Flyway 경로가 엉뚱한 곳에 있었다

세 개 다 "배포하고 나서 로그 보고 알았을" 종류다. 대조표 한 장이 첫 배포를 한 번에 통과시켰다.

## 사람이 안 봐도 도는 것

| 주기 · 계기 | 작업 |
|---|---|
| 매일 04:00 | PostgreSQL `pg_dump` → 7일 보관 → **별도 DB에 복구 리허설**로 백업이 실제로 복구되는지 검증 |
| 5분 | 컨테이너 상태 감시 → 비정상이면 재시작 + Mattermost 알림. **상태가 바뀔 때만** 알린다 — 매번 울리면 아무도 안 본다 |
| 15초 | Prometheus 수집 (보관 7일 · 2GB 상한) → Grafana 13패널 |
| 30일 전 | Let's Encrypt 인증서 자동 갱신 + nginx reload |

백업은 "찍었다"가 아니라 "복구된다"까지 확인해야 백업이다. 리허설 없이 7일치를 쌓아 두는 것은 안심만 준다. 실제로 이 백업이 **사흘 동안 조용히 실패하고 있던 것**을 발견한 이야기는 [따로 적었다](/posts/sobi-env-triple-failure/).

## 숫자

<div class="stats">
  <div><b>#75</b><span>누적 빌드</span></div>
  <div><b>40여 회</b><span>배포</span></div>
  <div><b>~4초</b><span>롤백</span></div>
  <div><b>4일 연속</b><span>자동 백업 성공 (복구 후)</span></div>
</div>

<div class="tip">자동화의 목적은 편해지는 것이 아니라, 사람이 잊어도 돌아가는 것이다. 그리고 자동화된 것일수록 "돌았는가"가 아니라 "성공했는가"를 따로 봐야 한다.</div>
