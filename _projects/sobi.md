---
title: 소비 (SOBI)
slug: sobi
order: 2
status: 개발 완료
group: SSAFY 15기 · 특화프로젝트
period: 2026.08 – 2026.09 (6주)
team: 6인 (백엔드 3 / 프론트 2 / 인프라 1)
role: 인프라·DevOps 단독 + RAG(공고 적재 · 자격 판정 · 자연어 검색)
summary: 소상공인 정책자금 탐색·자격 판정 플랫폼. 빈 EC2 한 대에서 시작해 4계층 망 격리, CI/CD, 백업·감시·모니터링까지 혼자 구축했고, 자격 판정 정확도를 0.80에서 0.97로 올렸다.
thumbnail: /assets/img/projects/sobi-landing.png
hero: /assets/img/projects/sobi-architecture.webp
hero_alt: 소비 서버 아키텍처 — 외부 포트는 22·80·443뿐, data·monitoring 망은 internal
hero_caption: 직접 설계·구축한 서버 아키텍처. 외부 공개 포트는 22·80·443 세 개뿐이고 data·monitoring 망은 internal 이다.
domains: [인프라, AI]
tech: [AWS EC2, Docker, Nginx, Jenkins, PostgreSQL, Redis, Prometheus, Grafana, FastAPI, pgvector]
repo: https://github.com/leeminseok11/sobi_pjt
---

## 왜 만들었나

2026년 창업·소상공인 지원 통합공고 기준으로 **111개 기관이 508개 사업에 3조 4,645억 원**을 씁니다. 그런데 사장님들은 자기가 받을 수 있는 게 뭔지 모릅니다.

- 공고는 부처·지자체 사이트에 흩어져 있고, 자격 조건은 공고문 안 표 속 문장으로만 적혀 있습니다.
- 매출·업력·근로자 수·신용등급을 상품마다 손으로 대조해야 합니다.
- 신청 서류는 대부분 HWP 서식이고, 도장 하나 빠져서 반려되면 다음 공고까지 기다려야 합니다.

**소비**는 브로커가 팔던 정보 탐색·자격 판정·서류 안내를 수수료 0원으로 제공합니다. 사업자·매출 데이터를 다루므로 기능 구현 전에 **데이터 격리 · 전 구간 HTTPS · 복구 가능한 백업 · 되돌릴 수 있는 배포 · 관측 가능성**을 전제로 설계했습니다.

<div class="stats">
  <div><b>3</b><span>외부 공개 포트</span><i>22 · 80 · 443</i></div>
  <div><b>10</b><span>운영 컨테이너</span><i>4계층 망 격리</i></div>
  <div><b>#75</b><span>누적 빌드</span><i>배포 40여 회</i></div>
  <div><b>0.97</b><span>자격 판정 정확도</span><i>0.80 → 0.97</i></div>
</div>

## 주요 기능

| 기능 | 설명 |
|---|---|
| 자격 판정 | 사업자 인증 + 마이데이터 연동 후 대출·지원사업 전체를 한 번에 판정. `가능 / 확인 필요 / 불가` 배지 |
| 자연어 검색 | "키오스크 지원금"처럼 본문 의미로 검색 — KoE5 임베딩 + pgvector, LLM 호출 없이 1초 안 |
| 자금 조합 | 무상 지원금을 먼저 채우고 남는 금액만 대출로 구성한 조합을 금리·월 상환액과 함께 비교 |
| 서류 초안·검증 | HWP/HWPX/DOCX 서식을 분석해 초안을 채우고(Document Agent), 제출 서류는 OCR로 본인·종류·유효기간 검증 |
| 상환 관리 | SSAFY 금융망 연동으로 실행된 대출의 잔액·회차·자동이체 추적 |
| 상권 분석 | 서울시 상권 데이터로 업종·동 단위 진단 — 사업자 인증 없이도 쓰는 유일한 분석 기능 |

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, TanStack Query v5, Zustand |
| Backend | Java 21, Spring Boot 3.5, Spring Security + JWT, Spring Data JPA, Flyway |
| AI | Python 3.11, FastAPI, sentence-transformers (KoE5), PaddleOCR (PP-OCRv5), PyMuPDF |
| Database | PostgreSQL 16 + pgvector, Redis 7 |
| Infra | Docker Compose, Nginx, Jenkins, AWS EC2, Let's Encrypt, Prometheus · Grafana |

## 내가 맡은 것

### 1. 서버 아키텍처 — Docker의 방화벽 우회를 전제로

빈 EC2 한 대, 인프라 1인. Docker는 iptables에 직접 규칙을 넣어 ufw를 우회하므로 방화벽 규칙만 믿으면 DB 포트가 인터넷에 노출됩니다. 그래서 포트를 '막는' 대신 **'만들지 않는'** 쪽으로 설계했습니다.

- 네트워크를 `frontend · backend · data · monitoring` 4계층으로 나누고 `data`·`monitoring`은 `internal: true` — DB·Redis는 포트 매핑 없이 내부망에만 연결, 모든 요청은 nginx 하나로
- data 망 이중 보안: 망 격리 + Redis 인증 (팀원 지적을 수용)
- 인증 없는 Prometheus는 비노출, Grafana 13패널 대시보드

```yaml
# deploy/docker-compose.infra.yml (발췌)
networks:
  frontend:
  backend:
  data:
    internal: true      # postgres · redis 는 여기에만 붙는다 — 포트 매핑 없음
```

### 2. 운영 자동화 — 사람이 안 봐도 도는 것

| 주기 · 계기 | 작업 |
|---|---|
| 매일 04:00 | PostgreSQL 백업 · 7일 보관 · 별도 DB에 복구 리허설로 검증 |
| 5분 | 컨테이너 감시 → 재시작 + Mattermost 알림 (상태 전이 시에만) |
| master / develop | 빌드 → 배포 (빌드번호 + latest 태그) / 빌드 검증만 |
| 15초 · 30일 전 | Prometheus 수집 (7일 · 2GB 상한) / 인증서 자동 갱신 + reload |

롤백은 빌드번호 태그로 약 4초. 발표 당일 장애를 사전에 막은 이야기는 [환경변수 한 글자가 만든 3중 장애](/posts/sobi-env-triple-failure/)에 적었습니다.

### 3. 자격 판정 고도화 (AI)

공고 222건을 사업자 정보 7개(`region address business_code employee_count open_date annual_revenue birth_date`)로 판정합니다. 프롬프트를 여섯 번 고쳐도 엄격 정확도가 0.80에서 멈췄고, 결국 **모델과 코드의 역할 경계를 다시 그어** 0.97까지 올렸습니다.

```
기업마당 공고 222건
   │  MinerU(PDF) · hwp5html(HWP) · XML 파싱(HWPX)
   ▼
본문 텍스트 ─▶ 조건 추출(LLM) ─▶ program_condition (지역·업종·매출·업력·근로자 수)
   │
   └─▶ 350토큰 청킹 ─▶ KoE5 임베딩(1024차원) ─▶ program_chunk (pgvector)

사용자 프로필 ─▶ ① SQL 정형 필터 (시도 · 소상공인 규모 · 매출 상한 · 업력)
               ─▶ ② 후보 전량 검증 (시군구 · 1인 사업장 · 문장형 조건)
               ─▶ eligible / unknown / ineligible + 확인 항목
```

| 단계 | 핵심 변경 | 결과 |
|---|---|---|
| ① 후보 선별 | 벡터 검색 → SQL 정형 필터 | 포함률 0.368 → 1.000 |
| ② 판정 범위 한정 | 대조 가능한 조건만 판정 | 0.478 → 0.826 |
| ③ 프롬프트 튜닝 | 규칙 추가 · 절차형 재작성 (84줄) | 0.783 · 0.609 (하락) |
| ④ 분류 모델 + 원문 | 확률형 분류 모델 + 공고 원문 투입 | 0.776 → 0.972 |
| ⑤ 코드 게이트 | '확인 필요'는 코드가 결정 | 위험 오판 13 → 0 |
| ⑥ 임계값 측정 | 개발 0.95 / 검증 1.00 · 10회 반복 | 엄격 0.97 · 심각 0 |

![자격 판정 결과 화면 — 가능 · 확인 필요 · 불가 배지](/assets/img/projects/sobi-judgement.png)

## 팀

SSAFY 15기 특화 프로젝트 · D101. 팀장(백엔드) 1, 백엔드·AI 2, 프론트 2, 그리고 인프라·AI 1(나). 나는 CI/CD, Docker·Nginx, EC2 배포, 환경변수·DB 운영과 RAG(공고 적재·자격 판정·자연어 검색)를 맡았습니다.
