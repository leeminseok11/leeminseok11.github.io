---
title: 빈 EC2 한 대에서 시작한 서버 설계 — Docker가 ufw를 우회한다는 전제에서
date: 2026-08-26 20:30:00 +0900
category: 인프라·운영
tags: [Docker, Nginx, AWS, 네트워크, PostgreSQL]
project: sobi
description: 인프라 1인. Docker는 iptables에 직접 규칙을 넣어 ufw를 우회하므로, 방화벽만 믿으면 DB 포트가 인터넷에 노출된다. 포트를 '막는' 대신 '만들지 않는' 4계층 망 격리로 설계한 기록.
---

## 상황

빈 EC2 한 대. 인프라 담당은 나 혼자. 팀이 만들 서비스가 사업자번호·매출 같은 마이데이터를 다루므로, 기능보다 먼저 **데이터 격리 · 전 구간 HTTPS · 복구 가능한 백업 · 되돌릴 수 있는 배포 · 관측 가능성**을 전제로 깔아야 했다.

설계 전에 한 가지를 확인했다. **Docker는 iptables에 직접 규칙을 넣는다.** `ufw`로 5432를 막아 놓아도, 컨테이너에 `ports: - "5432:5432"`를 쓰는 순간 Docker가 DOCKER 체인에 허용 규칙을 넣어 ufw를 우회한다. "방화벽에서 막았으니 괜찮다"는 전제는 Docker 호스트에서 성립하지 않는다.

<div class="warn">방화벽 규칙만 믿으면 DB 포트가 인터넷에 노출된다. 사람이 ufw 규칙을 아무리 잘 관리해도 compose 파일의 한 줄이 그것을 무효화한다.</div>

## 설계 — 포트를 '막는' 대신 '만들지 않는다'

노출될 수 있는 포트를 애초에 만들지 않으면 우회할 규칙도 없다.

```
인터넷 ──22/80/443──▶ [frontend 망] nginx ──▶ [backend 망] backend · ai · frontend
                                                   │
                                           [data 망 · internal] postgres · redis
                                           [monitoring 망 · internal] prometheus · exporters
```

- **4계층 망**: `frontend · backend · data · monitoring`. `data`와 `monitoring`은 `internal: true` — 외부 라우팅 자체가 없다
- DB·Redis는 **포트 매핑 없이** data 망에만 붙는다. 호스트에서조차 `localhost:5432`로만 닿는다
- 모든 외부 요청은 **nginx 하나**로 들어온다. HTTPS 종료, `/api` 프록시, 정적 파일
- 외부 공개 포트는 **22 · 80 · 443** 세 개뿐

```yaml
# deploy/docker-compose.infra.yml (발췌)
services:
  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80", "443:443"]          # 외부에 열리는 포트는 여기뿐
    networks: [frontend, backend]
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/health"]

  postgres:
    image: pgvector/pgvector:pg16
    networks: [data]                      # 포트 매핑 없음
    command: >
      postgres -c shared_buffers=768MB -c effective_cache_size=2GB
      -c work_mem=32MB -c max_connections=100
    deploy: { resources: { limits: { memory: 2560M } } }

  redis:
    image: redis:7-alpine
    command: >
      redis-server --requirepass ${REDIS_PASSWORD}
      --maxmemory 384mb --maxmemory-policy allkeys-lru --appendonly no
    networks: [data]

networks:
  frontend:
  backend:
  data:
    internal: true
```

### data 망 이중 보안

망 격리만으로 충분하다고 생각했는데, 팀원이 "backend 망에 있는 컨테이너가 뚫리면 data 망은 그대로 열리는 것 아니냐"고 지적했다. 맞는 말이었다. **망 격리 + Redis 인증**(`requirepass`)으로 한 겹을 더 뒀다. 포스트그레스는 당연히 비밀번호가 있고, Redis는 기본이 무인증이라 빠뜨리기 쉽다.

### 모니터링도 internal

Prometheus는 인증이 없다. 외부에 노출하면 메트릭이 그대로 보인다. monitoring 망도 internal로 두고, Grafana(13패널)만 nginx 뒤로 냈다. 수집은 15초 주기, 보관은 7일 · 2GB 상한.

### 컨테이너마다 메모리 상한

EC2 한 대에 컨테이너 10개가 올라간다. AI 서버(임베딩 모델 + OCR)가 4GB까지 먹을 수 있어서, 하나가 폭주해 전체를 끌어내리지 않도록 **컨테이너마다 `memory` limit**을 걸었다. nginx 256M, frontend 128M, backend 1G, ai 4G, postgres 2.5G, redis 512M.

## 결과

<div class="stats">
  <div><b>3</b><span>외부 공개 포트</span><i>22 · 80 · 443</i></div>
  <div><b>loopback</b><span>DB 포트</span><i>호스트 내부에서만</i></div>
  <div><b>10</b><span>운영 컨테이너</span><i>회수 직전까지 전부 정상</i></div>
  <div><b>~4초</b><span>롤백</span><i>빌드번호 태그</i></div>
</div>

배포 파이프라인과 백업·감시 자동화는 [다음 글](/posts/sobi-jenkins-pipeline-and-automation/)에 이어진다.

<div class="tip">사람의 주의력이 아니라 구조로 막는다. "조심해서 포트를 안 열면 된다"는 조심하지 않는 날 뚫린다. 열 수 있는 포트 자체를 없애면 조심할 필요가 없다.</div>
