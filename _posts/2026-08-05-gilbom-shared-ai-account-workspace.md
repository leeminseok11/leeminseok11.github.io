---
title: 공용 AI 코딩 계정에서 주행 코드가 뒤엎이던 문제 — 사람이 아니라 구조를 바꾸기
date: 2026-08-05 21:00:00 +0900
category: 인프라·운영
tags: [협업, 배포, Jetson]
project: gilbom
description: 젯슨의 팀 공용 AI 코딩 계정을 두 사람이 공유하다 보니, 의도치 않은 파일 수정과 환각 반영으로 잘 만든 주행 코드가 반나절 만에 훼손됐다. 팀원을 탓하는 대신 작업 공간을 분리하고 deploy.sh / preflight.sh 로 배포 게이트를 세웠다.
---

## 상황

로봇 코드는 Jetson 보드 위에서 돌아야 한다. 그래서 초반에는 모두가 젯슨에 SSH로 붙어 **보드 위에서 직접** 코드를 고쳤다. AI 코딩 도구도 젯슨의 팀 공용 계정 하나로 썼다.

두 사람이 같은 계정, 같은 작업 트리에서 동시에 작업하자 일이 벌어졌다.

- 한 사람의 AI 세션이 **다른 사람이 만지던 파일을 의도치 않게 수정**했다
- 환각으로 만들어진 코드가 그대로 반영됐다
- 반나절 전까지 잘 돌던 주행 코드가 어느 순간 안 돌았고, 누가 무엇을 바꿨는지 추적이 안 됐다

<div class="warn">원인은 "누가 실수했다"가 아니었다. 실행 환경과 편집 환경이 같은 디렉터리였고, 그 디렉터리에 둘 이상이 동시에 손을 대는 구조였다. 같은 구조에서는 누구라도 같은 사고를 낸다.</div>

## 해결 — 작업 공간 분리

**로컬에서 작업하고, 젯슨에는 배포만 한다.** 젯슨은 실행 환경이지 편집 환경이 아니다.

```
개발 PC (각자)                      Jetson (실행 전용)
  ├─ 코드 편집 · AI 도구 · git  ──▶  scripts/deploy.sh
  └─ 테스트 (pytest, mock HW)        ├─ tar | ssh 로 전송
                                     ├─ preflight.sh 자동 실행
                                     └─ 통과해야 배포 끝
```

### deploy.sh — 전송

```bash
# scripts/deploy.sh <젯슨_리눅스_계정>@<젯슨IP>[:<경로>]
#   scripts/deploy.sh ubuntu@192.168.0.42
#   scripts/deploy.sh ubuntu@192.168.0.42 --no-check   # 점검 생략(전송만)
#
# rsync 대신 tar | ssh 를 쓴다 — ssh·tar 만 있으면 되므로 개발 PC가 Windows
# (Git Bash)여도 그대로 돈다. rsync 는 Git Bash 기본 구성에 없다.
#
# 전송하지 않는 것: __pycache__ · .pytest_cache · reports/ · 녹화 영상 · git 메타 ·
# var/ (개발 PC의 학습 데이터셋·프레임 덤프 — 100MB가 넘는다).
# 모델 가중치(models/*.pt)는 **전송한다** — 그것이 배포의 본체다.
set -euo pipefail
```

### preflight.sh — 배포 후 점검

"주행 전에 이걸 통과시키는 것이 배포의 끝이다." 확인 순서는 **못 고치면 주행이 불가능한 것 → 없어도 주행은 되는 것**이다. 앞의 것이 하나라도 실패하면 종료 코드가 0이 아니고, `deploy.sh`가 그 코드를 그대로 쓴다.

```bash
echo "== 1. 파이썬 / 의존성 (실추론 경로) =="
"$PY" -c 'import sys; assert sys.version_info[:2] == (3, 10), sys.version' \
    && pass "$("$PY" -V 2>&1) (보드는 3.10 고정)" \
    || fail "python3 버전이 3.10이 아니다 — wheel 호환이 깨진다 (requirements.txt)"

for module in yaml numpy cv2 ultralytics; do
    "$PY" -c "import $module" 2>/dev/null \
        && pass "import $module" \
        || fail "import $module 실패 — 실추론(--perception real)이 기동하지 못한다"
done
"$PY" -c 'import serial' 2>/dev/null \
    && pass "import serial (GPS)" \
    || warn "import serial 실패 — GPS 좌표 없이 보고된다 (fix=false)"
```

파이썬 버전, 필수 모듈, 설정 표 정합성(`config.yaml`의 7클래스 표)은 `fail`이고, GPS 시리얼처럼 배선을 뽑고 주행 로직만 보는 운용이 있는 것은 `warn`이다. 배선 없이도 테스트할 수 있어야 하기 때문이다.

## 결과

이후 코드 충돌이 재발하지 않았고, 반복 개선 주기가 "고치고 → 로컬 테스트 → 배포 → preflight 통과 → 주행"으로 고정됐다. 누가 무엇을 바꿨는지는 git이 답한다.

<div class="tip">팀원을 탓하지 않고 구조의 결함으로 보고 고쳤다. "조심하자"는 규칙은 사람이 피곤하면 깨지지만, "젯슨에서는 편집하지 않는다"는 구조는 피곤해도 지켜진다.</div>
