---
title: 길봄 (GILBOM)
slug: gilbom
order: 1
status: 개발 완료
group: SSAFY 15기 · 공통프로젝트
period: 2026.07 – 2026.08 (7주)
team: 7인 (임베디드·AI 4 / 웹 3)
role: 임베디드팀 팀장 — 자율주행 로직 · 파손 판정 모델 · 하드웨어
award: 공통프로젝트 최우수상
summary: 점자블록 파손을 찾아내는 자율주행 순찰 로봇과 관제 플랫폼. 인도 자율주행 → 파손 판정 → 사진·GPS 태깅 → 관제 지도까지 한 흐름으로 이어진다.
thumbnail: /assets/img/projects/gilbom-robot.webp
hero: /assets/img/projects/gilbom-dfd.png
hero_alt: 길봄 데이터 흐름도
hero_caption: 로봇(Jetson Orin Nano) → MQTTS / HTTPS → 서버 → 관제 웹으로 이어지는 데이터 흐름
domains: [임베디드, AI]
tech: [Python, Jetson Orin Nano, YOLO, TensorRT, OpenCV, pytest, MQTT]
repo: https://github.com/leeminseok11/gilbom_pjt
---

## 왜 만들었나

파손된 뒤 민원이 들어와야 인지되던 점자블록을, 로봇이 보도 위를 대신 순찰하며 상시 점검하는 플랫폼입니다. 인도 자율주행부터 파손 판정, 사진·GPS 태깅, 관제 지도 표시까지 한 번에 이어지는 흐름을 만들었습니다.

1. 인도 자율주행 → 2. 각종 장애물 좌/우 회피 → 3. 점자블록 탐지·상태 판정 → 4. 이상 시 **사진 촬영 + GPS 태깅** → 5. 횡단보도 발견 시 횡단보도–인도 사이 점자블록 유무 판단(없으면 **미설치 구역** 태깅) → 6. 웹 지도에 핀 표시

로봇 저장소의 책임은 1~5단계이고, 6단계(서버 전송·지도 핀)는 통신 코드가 담당합니다.

## 시스템 구성

```
Browser ──HTTPS 443──> Nginx ──/api──> Spring Backend ──JDBC──> PostgreSQL/PostGIS
Robot   ──MQTTS 8883─────────────────> Mosquitto ─────────────> Backend
Robot   ──HTTPS 이미지 업로드─────────> Nginx ────────────────> Backend
```

| 구분 | 버전 |
|---|---|
| Robot | Jetson Orin Nano, JetPack L4T R36.4.7, Python 3.10 |
| Backend | Java 21, Spring Boot 3.5, Gradle 8.14 |
| Frontend | React 19, Node 24 |
| Web/DB/MQTT | Nginx 1.30, PostgreSQL 16 + PostGIS 3.5, Mosquitto 2.1 |

운영 외부 공개 포트는 `80`·`443`·`8883`뿐이고, 로봇이 구독하는 토픽은 `commands/request` 하나입니다.

## 내가 맡은 것

- **자율주행 로직 설계·구현** — FSM · 조향 · 회피 · 세그멘테이션 코스트맵 (Python, Jetson Orin Nano)
- **점자블록 파손 판정 모델** 학습 및 온디바이스 배포 — YOLO26n, TensorRT FP16
- **로봇 하드웨어 설계·배선** — PCA9685 서보, TB6612FNG 모터 드라이버, GPS, 실측 캘리브레이션
- 개발 착수 전 **임베디드·웹·통신·DB 명세서 4종** 확정 (팀장)

## 로봇 온디바이스 파이프라인

두 카메라 · 두 모델 · 한 프로세스. 주행 카메라의 세그멘테이션이 인도를 따라 달리며 점자블록을 찾고, 하향 탐지 카메라의 탐지 모델이 **주행하며** 블록의 파손을 판정합니다.

| 단계 | 내용 | 구현 |
|---|---|---|
| 웹캠 입력 | 전방 주행 카메라 + 하향 검사 카메라 (Brio 100) | 본인 |
| 세그멘테이션 | YOLO11n-seg · 7클래스 | 팀원 학습 → 본인이 출력을 주행 판단에 사용 |
| 코스트맵 조향 | 슬롯별 통행 비용 → 최소 비용 방향 | 본인 |
| FSM 주행 · 회피 | 순수 함수 · pytest | 본인 |
| 점자블록 탐지 · 정차 | 세그 + HSV 이중 관측 | 본인 |
| 파손 판정 | YOLO26n · TensorRT FP16 | 본인 |
| 사진 · GPS 태깅 → MQTT | `reports/events.jsonl` + JPEG → 서버 전송 | 팀원 (연동) |

`driving/` 패키지는 순수 계산만 합니다 — I/O·`time.sleep`·시계 접근 금지. 그래서 상태 전이를 pytest로 고정할 수 있었습니다(`tests/test_state_machine.py`, `test_costmap.py`, `test_ego_connectivity.py` 등 22개 테스트 파일).

### 7클래스 통행 비용 — 주행 판단의 단일 출처

`config.yaml`의 표 하나가 drivable / cost / roadway를 정합니다. 우선순위의 실체는 cost 숫자입니다.

| 클래스 | drivable | cost | 취급 |
|---|---|---|---|
| `braille_guide_blocks` | ✅ | 0.0 | 밟고 지나간다 + TRACE로 추종하며 탐지 |
| `sidewalk` | ✅ | 0.0 | 주행 기본면 · 중심선 추종 대상 |
| `caution_zone` | ❌ | 0.8 | 위험·공사 구역 — 회피 대상 |
| `alley` | ❌ | 1.5 | 차량이 드나드는 노면 — 강하게 회피 |
| `bike_lane` | ❌ | 2.0 | 자전거 속도가 인도보다 위험 — 강하게 회피 |
| `crosswalk` | ❌ | ∞ · roadway | 차도 위 도색면 — 미설치 판정의 트리거 |
| `roadway` | ❌ | ∞ · roadway | 절대 접근 금지 — 코리도에 들어오면 ESCAPE |

<figure>
  <video controls preload="metadata" playsinline poster="/assets/img/projects/gilbom-drive-poster.jpg" src="/assets/video/gilbom-drive-test.mp4"></video>
  <figcaption>인도 추종 야외 주행 테스트 — 세그 오버레이 위에 진행 코리도 · 중심선 · 조향 목표 표시</figcaption>
</figure>

## 하드웨어

| 항목 | 내용 |
|---|---|
| 보드 | Jetson Orin Nano (40핀 헤더 · I2C 버스 7) |
| 구동 | 모터 HAT (PCA9685 0x40) + TB6612FNG — PWM/IN1/IN2 채널, 숏브레이크 지원 |
| 조향 | 서보 보드 (PCA9685 0x60) |
| 카메라 | 전방 웹캠(세그 입력) · Logitech Brio 100(파손 검사) — USB 2.0 허브 공유로 MJPG 필수 |
| 위치 | u-blox 7 GPS (`/dev/ttyACM0`) — 보고 좌표 태깅 |
| 시작 트리거 | 터치 센서 — GPIO 폴링 + 누름 엣지 1회 소비 |
| IMU | MPU6050 클론 — 있으면 더 정확하고, 없어도 미션은 돈다 |

하드웨어 인벤토리는 `scripts/hardware_inventory.py`로 보드에서 재실행해 언제든 재검증할 수 있게 했고, `config.yaml`의 하드웨어 수치는 전부 여기서 나왔습니다.

<figure>
  <img src="/assets/img/projects/gilbom-report-sample.jpg" alt="로봇이 자동 촬영한 점자블록 미설치 구역 보고 사진" loading="lazy">
  <figcaption>로봇이 주행 중 자동으로 남긴 보고 사진 — 횡단보도–인도 사이 점자블록 미설치 구역 (2026-08-07)</figcaption>
</figure>

## 성과 — Before → After

| 지표 | 초기 YOLOv8n | 최종 YOLO26n |
|---|---|---|
| 실사 불량 판정률 (231장) | 61.0% | **14.3%** (실제 불량률 15.3%) |
| 주행 시점 mAP50 (600장) | 0.580 | **0.811** |
| 클린 99장 F1 | 0.487 | **0.722** |
| 노면 300장 오탐률 | 16.7% | **0%** |
| 세로형 박스 비율 (학습셋) | 99.3% | 49.9% |

주행 쪽은 라이다를 버리고 비전 기반으로 전환하면서 장애물 유효 인지 범위가 지면 약 0.4~1.2m에서 **6~7m**로 늘었고, 장애물 대응이 '정지'에서 '회피 선회'로 바뀌었습니다.

## 팀장으로서 세운 원칙

- **계약을 먼저 동결한다** — 임베디드 4인이 주행·차체·통신·인지를 병렬로 맡으므로, 인터페이스를 뒤늦게 맞추면 통합 시점에 무너진다 → 명세서 4종 확정 후 착수
- **실패한 실험도 자산이다** — 라이다 실패 · 증강 한계 · 타이머 역전을 전부 기록으로 남겨 다음 결정의 근거로 사용
