---
title: 캐시 무효화는 TTL이 아니라 '바뀌는 시점'에 — AI 워크플로우 추천 캐시
date: 2026-06-10 21:00:00 +0900
category: 설계
tags: [Django, 캐시, LLM]
project: erp
description: 직원별 그 주의 업무를 모아 LLM 이 우선순위를 매기는 기능. 응답을 60초 캐시하되, Task 나 일정이 바뀌면 그 날짜가 속한 주 전체의 캐시를 즉시 지운다. TTL 만 짧게 주는 것과 무엇이 다른가.
---

## 기능

Works의 "AI 워크플로우 추천"은 로그인한 직원 기준으로 그 날짜가 속한 **주(일~토)** 안에 마감인 Task, 그날의 CalendarEvent, 배송 요청일·입고 예정일이 그날인 주문·발주를 모아 `source_type:source_id`로 정규화하고, LLM에 보내 우선순위가 매겨진 JSON 배열을 받는다.

LLM 호출은 느리고 비싸다. 같은 직원이 같은 날짜를 다시 열 때마다 부를 수는 없다. 캐시가 필요하다.

## 1차 — TTL 60초

```python
cache_key = f'ai_recommend:{emp.employeeid}:{date_str}'
cached = cache.get(cache_key)
if cached is not None:
    return Response(cached)
...
cache.set(cache_key, result, 60)
```

직원·날짜별로 60초. 간단하다. 그런데 사용자가 업무를 하나 추가하고 워크플로우 탭으로 넘어오면 **방금 추가한 업무가 없다.** 최대 60초를 기다려야 한다. "추가했는데 왜 안 보이지"가 첫 반응이 된다.

TTL을 10초로 줄이면? 체감은 나아지지만 LLM 호출이 6배로 늘고, 여전히 10초 동안은 틀린 화면이다. TTL은 **"얼마나 오래 틀려도 되는가"**를 정하는 값이지, 틀리지 않게 하는 값이 아니다.

## 2차 — 바뀌는 시점에 정확히 지운다

데이터가 바뀌는 시점은 명확하다. Task/CalendarEvent의 생성·수정·삭제. 그 시점에 캐시를 지우면 된다. 문제는 **어떤 키를** 지우느냐다.

추천은 "그 주간 업무"를 함께 본다. 수요일 마감 업무를 추가하면 월요일 화면의 추천도, 금요일 화면의 추천도 바뀐다. 그래서 바뀐 날짜가 속한 **주 전체(7일)**의 키를 지운다.

```python
def _week_range(target_date):
    """target_date 가 속한 주(일~토)의 날짜 7개"""
    days_since_sunday = (target_date.weekday() + 1) % 7
    week_start = target_date - timedelta(days=days_since_sunday)
    return [week_start + timedelta(days=i) for i in range(7)]


def _invalidate_ai_cache(employee_id, dates):
    """해당 직원의 AI 추천 캐시를 지정된 날짜가 포함된 주(일~토) 전체에 대해 무효화한다.
    AI 추천이 '해당 날짜가 속한 주간 마감 업무'를 함께 분석하므로,
    그 주의 어느 날짜를 보고 있었든 캐시가 무효화되어야 한다."""
    if not employee_id:
        return
    for d in dates:
        if not d:
            continue
        target = d if isinstance(d, date) else datetime.strptime(d, '%Y-%m-%d').date()
        for day in _week_range(target):
            cache.delete(f'ai_recommend:{employee_id}:{day.isoformat()}')
```

호출 지점은 Task/CalendarEvent 뷰의 생성·수정·삭제 전부다. 수정은 **이전 날짜와 새 날짜 둘 다** 넘긴다 — 마감일을 이번 주에서 다음 주로 옮기면 두 주 모두 바뀌기 때문이다. 담당자가 바뀌면 이전 담당자와 새 담당자 둘 다 지운다.

```python
# 수정: 날짜가 옮겨가면 양쪽 주를 전부 무효화
_invalidate_ai_cache(updated.employee_id, {date.today().isoformat(), old_date, new_date})

# 담당자 변경: 이전 담당자 + 새 담당자
_invalidate_ai_cache(old_assignee, dates)
if updated.assignee_id != old_assignee:
    _invalidate_ai_cache(updated.assignee_id, dates)
```

TTL 60초는 그대로 뒀다. 이제 TTL은 "무효화를 놓친 경우의 안전망"이지 신선도의 주된 수단이 아니다.

## 왜 이게 중요했나

캘린더 · 업무관리 · AI 추천 세 화면이 **같은 백엔드 데이터**를 공유한다. 한 화면에서 바꾼 것이 다른 화면에 즉시 반영되지 않으면 사용자는 세 화면을 서로 다른 시스템으로 느낀다. "같은 데이터를 같은 방식으로 가리키게 만드는 것"이 ERP에서 기능 추가보다 어렵고 중요한 일이라는 것을 이 기능에서 배웠다.

<div class="tip">단순히 TTL만 짧게 주는 것보다 "데이터가 바뀌는 시점에 정확히 무효화"하는 설계가 왜 필요한지 체감했다. 지울 키의 범위는 캐시된 값이 무엇을 '보고' 계산됐는지에서 나온다 — 이 경우엔 하루가 아니라 한 주.</div>
