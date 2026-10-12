---
title: 같은 정보가 세 곳에 있으면 반드시 어긋난다 — 7클래스 표를 단일 출처로
date: 2026-08-06 19:40:00 +0900
category: 설계
tags: [자율주행, 코스트맵, pytest, 설정 관리]
project: gilbom
description: 클래스별 주행가능·비용·차도 취급이 config 세 곳에 흩어져 있었고 실제로 어긋나 있었다. 표 하나로 합치고, 어긋나면 기동 전에 실패하도록 테스트와 preflight 로 고정한 기록.
---

## 흩어져 있던 것

주행 판단에 쓰이는 "클래스 취급" 정보가 `config.yaml` 안에서 세 곳에 나뉘어 있었다.

- `drivable_classes` — 이 클래스 위를 달려도 되는가
- `roadway_classes` — 차도로 취급할 클래스
- `costmap.class_costs` — 코스트맵 통행 비용

한 클래스의 취급을 바꾸려면 세 곳을 맞춰야 했고, **실제로 어긋나 있었다.**

<div class="warn">
<ul>
<li><code>alley</code>가 drivable 목록에 있으면서 비용은 0.2였다 — 골목은 차량이 드나드는 노면인데 거의 인도처럼 취급됐다</li>
<li><code>bike_lane</code>은 비용표에만 있고 drivable 목록에는 없어 '주행불가 = 장애물'로 잡혔다 — 자전거도로 옆을 지나는 것만으로 회피가 걸렸다</li>
</ul>
</div>

문제는 이런 어긋남이 **로그에도 동작에도 안 보이게** 판정을 약하게 만든다는 것이다. 에러가 나지 않는다. 그냥 조금 이상하게 달린다.

## 표 하나로

```yaml
# config.yaml — perception.segmentation.classes (발췌)
# 7클래스 우선순위 표 — 주행 판단의 단일 출처
classes:
  braille_guide_blocks:   # 미션 대상. 밟아도 되고 오히려 그 위를 가는 편이
    drivable: true        # 하향 탐지 카메라 화각에 블록이 들어온다
    cost: 0.0
  sidewalk:               # 주행 기본면
    drivable: true
    cost: 0.0
  caution_zone:           # 인도 내 위험·공사 구역 — 지나갈 수는 있으나 피한다
    drivable: false
    cost: 0.8
  alley:                  # 골목 — 차량이 드나드는 노면이다. 인도가 아니다
    drivable: false
    cost: 1.5
  bike_lane:              # 자전거도로 — 인도보다 위험(자전거 속도)
    drivable: false
    cost: 2.0
  crosswalk:              # 횡단보도 = 차도 위 도색면
    drivable: false
    cost: .inf
    roadway: true         # 빼면 횡단보도 앞 방어가 조용히 사라진다
  roadway:                # 차도 — 절대 접근 금지
    drivable: false
    cost: .inf
    roadway: true
```

필드는 셋뿐이다. `drivable`은 인도 경계 판정·중심선 적합·자유공간 도달거리가 전부 쓰는 합집합이고, `cost`는 코스트맵 통행 비용으로 **우선순위의 실체가 이 숫자**다(작을수록 우선). `roadway`는 코리도에 들어오면 회피 선회(ESCAPE), 임계 초과면 ESTOP.

우선순위를 한 줄로 쓰면: 점자블록 = 인도 < 주의구역 < 골목 < 자전거도로 < 횡단보도 = 차도(절대 금지).

## 어긋나면 기동 전에 실패하게

표를 합친 것만으로는 부족하다. 누가 다시 흩어 놓을 수 있다. 그래서 정합성을 두 겹으로 고정했다.

1. `tests/test_costmap.py::TestClassPriorityTable` — 10개 테스트가 표의 일관성을 검사한다 (drivable인데 비용이 ∞인 클래스는 없는가, roadway는 반드시 ∞인가 …)
2. `scripts/preflight.sh` — 보드에서 주행 전에 돈다. 설정이 어긋나면 종료 코드가 0이 아니고, `deploy.sh`가 그 코드를 그대로 쓴다

```bash
# scripts/preflight.sh — 확인 순서는 '못 고치면 주행이 불가능한 것' → '없어도 주행은 되는 것'
echo "== 1. 파이썬 / 의존성 (실추론 경로) =="
"$PY" -c 'import sys; assert sys.version_info[:2] == (3, 10), sys.version' \
    && pass "$("$PY" -V 2>&1) (보드는 3.10 고정)" \
    || fail "python3 버전이 3.10이 아니다 — wheel 호환이 깨진다"
```

프로젝트 규칙으로도 적었다 — **튜닝 숫자와 경로는 문서가 아니라 `config.yaml`에. 숫자의 단일 출처.**

<div class="tip">같은 정보를 두 곳에 두면 언젠가 반드시 어긋난다. 그리고 어긋남이 에러로 드러나지 않는 종류라면, 합치는 것만으로 끝내지 말고 "어긋나면 실패하는" 장치를 같이 둬야 한다.</div>
