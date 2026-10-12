---
title: 미세먼지 감지 시스템 "Dust5"
slug: dust
order: 4
status: 구현 기록
group: 영남대 · 졸업작품 종합설계(캡스톤)
period: 2024.03 – 2024.06 (14주)
team: 2인 (하드웨어·서버 / Android 앱)
role: 하드웨어 설계 · C 멀티스레드 TCP 서버 · 서버–앱 프로토콜
summary: 센서 → 서버 → 앱으로 이어지는 양방향 실시간 미세먼지 알림 시스템. 아두이노 센서 노드와 C/pthread TCP 서버를 직접 설계했다.
thumbnail: /assets/img/projects/dust-thumb.svg
domains: [임베디드, 백엔드]
tech: [C, pthread, TCP Socket, Arduino, Linux]
repo: https://github.com/leeminseok11/dust_pjt
---

## 개요

- 센서 값을 아두이노에서 처리해 LED로 표시한다
- 서버에 전달하면 서버가 TCP 통신으로 앱에 전송한다
- 반대로 앱에서 알람을 등록하면 서버가 그 시각에 맞춰 데이터를 전달한다 — **양방향**이 이 프로젝트의 핵심이다

## 데이터 흐름

```
센서 (GP2Y1010AU0F 미세먼지 · DHT11 온습도)
   │
   ▼
Arduino Uno ── 펌웨어 · 8방향 LED 바 · Text LCD
   │  USB 시리얼
   ▼
C 서버 (pthread · 포트 12345)
   ├─ main          accept 루프
   ├─ pm_sensor     5초 주기 브로드캐스트
   ├─ alarm_check   1초 주기 알람 판정
   └─ handle_client 클라이언트 명령 수신 (set_alarm …)
   │
   ▼  서버 → 앱 : 5초 실시간 · 알람 시각 도달 시 push
   ▲  앱 → 서버 : 알람 시각 등록
Android 앱 (팀원 구현)
```

## 서버 구조 — 역할별 스레드 4종, 공유 자원별 뮤텍스 2개

5초 주기 실시간 갱신, 1초 단위 알람 판정, 사용자 명령 수신이 서로를 밀어내며 지연이 생겼습니다. 역할별 스레드로 분리하고, 공유 자원(`clients`, `alarms`)마다 독립 뮤텍스를 둬 잠금 범위를 최소화했습니다.

```c
// server.c (발췌) — 공유 배열마다 뮤텍스를 하나씩
Client clients[MAX_CLIENTS];
Alarm  alarms[MAX_CLIENTS];
pthread_mutex_t clients_mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t alarms_mutex  = PTHREAD_MUTEX_INITIALIZER;

void* alarm_check(void* arg) {
    while (1) {
        time_t now = time(NULL);
        pthread_mutex_lock(&alarms_mutex);
        for (int i = 0; i < alarm_count; i++) {
            if (alarms[i].alarm_time <= now) {
                send(alarms[i].client_socket, alarm_message, strlen(alarm_message), 0);
                alarms[i] = alarms[alarm_count - 1];   // 마지막 요소를 당겨와 빈칸 제거
                alarm_count--;
                i--;
            }
        }
        pthread_mutex_unlock(&alarms_mutex);
        sleep(1);
    }
}
```

## 하드웨어

| 부품 | 역할 |
|---|---|
| GP2Y1010AU0F | 미세먼지 센서 — 아날로그 출력, 280µs 단위 샘플링 타이밍 요구 |
| DHT11 | 온습도 센서 |
| 8방향 LED 바 · Text LCD | 8단계 농도 표시 · 수치 출력 |
| Arduino Uno | 라즈베리파이에서 전환 — ADC와 타이밍 보장이 필요했다 |

## 문제 해결 기록

- [라즈베리파이를 버리고 아두이노로 — 280µs 샘플링과 ADC](/posts/dust-raspberry-to-arduino/)
- [주기가 다른 세 가지 일을 한 서버에서 — pthread 4스레드와 뮤텍스 2개](/posts/dust-pthread-server/)
- [TCP는 스트림이다 — 메시지 경계와 연결 단일화](/posts/dust-tcp-message-boundary/)

## 산출물

졸업논문과 최종보고서는 저장소에 함께 있습니다. (`졸업논문_이민석_971210.pdf`, `최종보고서_이민석_박성호.hwp`)
