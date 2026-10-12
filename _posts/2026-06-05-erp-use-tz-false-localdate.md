---
title: USE_TZ=False 와 timezone.localdate() 의 충돌 — 같은 버그를 여러 번 만난 뒤
date: 2026-06-05 22:00:00 +0900
category: 트러블슈팅
tags: [Django, Python]
project: erp
description: Django 설정에서 타임존을 비활성화한 채 timezone-aware 헬퍼를 쓰면 ValueError 가 난다. 프로젝트 전반에서 같은 패턴이 여러 번 재발했고, 결국 타임존 비의존적인 호출로 통일했다.
---

## 증상

```
ValueError: localtime() cannot be applied to a naive datetime
```

근태(출퇴근) 화면에서 처음 났다. 고쳤다. 며칠 뒤 Works의 캐시 무효화 로직에서 또 났다. 같은 에러, 다른 파일.

## 원인

`settings.py`에 `USE_TZ = False`가 설정돼 있었다. 이 상태에서 Django는 DB에 **naive datetime**을 저장하고 돌려준다. 그런데 `django.utils.timezone`의 헬퍼 — `timezone.localdate()`, `timezone.localtime()` — 는 aware datetime을 전제로 한다. naive 값에 `localtime()`을 적용하려는 순간 `ValueError`다.

<div class="warn">"오늘 날짜"가 필요할 때 습관적으로 `timezone.localdate()`를 썼다. 타임존을 끈 프로젝트에서는 이 습관이 그대로 버그다. 그리고 습관이라서 파일마다 반복된다.</div>

개발자 한 사람의 실수가 아니라, 프로젝트 설정과 Django 관용구가 충돌하는 지점이었다. 누가 작성해도 같은 자리에서 같은 에러를 낸다.

## 해결

타임존 비의존적인 호출로 **프로젝트 전체를 통일**했다.

```python
# before — USE_TZ=False 에서는 터진다
from django.utils import timezone
today = timezone.localdate()

# after — naive 로 일관
from datetime import date
today = date.today()
```

Works의 캐시 무효화 코드도 같은 원칙으로 `date.today().isoformat()`을 쓴다. 날짜 문자열 파싱도 `datetime.strptime(d, '%Y-%m-%d').date()`로 naive하게 맞췄다.

## 왜 USE_TZ 를 켜지 않았나

켜는 것이 정석이다. 하지만 이 프로젝트는 Northwind 기반 증강 데이터셋 약 3만 건을 fixture로 올리고, 그 데이터셋이 외부 스크립트로 주기적으로 재생성되는 구조였다. 설정을 중간에 바꾸면 기존 fixture의 naive datetime과 새 설정이 어긋나고, 5주 안에 그 마이그레이션까지 감당할 여유는 없었다. 그래서 **"끈 상태에서 일관되게"**를 택했다.

## 그래서 남긴 것

직접 겪은 패턴을 메모해 두지 않으면 같은 실수를 반복한다는 것을 배웠다. README의 트러블슈팅 노트에 이 항목을 가장 먼저 적었다.

<div class="tip">프레임워크 설정 하나가 "관용구"를 버그로 바꿀 수 있다. 같은 에러가 두 번째로 나면 그 자리를 고치지 말고 패턴을 찾아 전체를 통일한다.</div>
