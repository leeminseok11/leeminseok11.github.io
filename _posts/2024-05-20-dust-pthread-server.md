---
title: 주기가 다른 세 가지 일을 한 서버에서 — pthread 4스레드와 뮤텍스 2개
date: 2024-05-20 21:00:00 +0900
category: 설계
tags: [C, pthread, TCP]
project: dust
description: 5초 주기 센서 브로드캐스트, 1초 주기 알람 판정, 클라이언트 명령 수신이 서로를 밀어내며 지연됐다. 역할별 스레드로 분리하고 공유 자원마다 독립 뮤텍스를 둬 잠금 범위를 최소화한 C 서버 설계.
---

## 서버가 해야 하는 일 세 가지

1. **5초마다** 접속한 모든 앱에 현재 미세먼지 수치를 뿌린다
2. **1초마다** 등록된 알람을 검사해 시각이 된 것을 해당 앱에 보낸다
3. **언제든** 앱이 보내는 명령(`set_alarm 2024-05-20 07:00:00`)을 받아 처리한다

처음 파이썬 초안은 이 셋을 한 루프에서 돌렸다. `recv()`가 블로킹이라 명령을 기다리는 동안 5초 브로드캐스트가 밀렸고, 알람 판정도 밀렸다. 주기가 다른 일을 한 루프에 넣으면 **가장 느린 일이 나머지를 끌고 간다.**

서버를 C로 다시 짰다. 스레드를 쓰려는 것이 주된 이유였고, 소켓과 스레드를 직접 다뤄 보고 싶기도 했다.

## 역할별 스레드 4종

```
main           accept 루프 — 접속마다 handle_client 스레드 생성
pm_sensor      5초 주기 브로드캐스트
alarm_check    1초 주기 알람 판정
handle_client  클라이언트 1:1 — 명령 수신 (접속 수만큼)
```

```c
// server.c — 공유 자원과 그 보호자
Client clients[MAX_CLIENTS];
Alarm  alarms[MAX_CLIENTS];
int client_count = 0;
int alarm_count  = 0;

pthread_mutex_t clients_mutex = PTHREAD_MUTEX_INITIALIZER;   // clients 배열 보호
pthread_mutex_t alarms_mutex  = PTHREAD_MUTEX_INITIALIZER;   // alarms 배열 보호
```

### 공유 자원별 뮤텍스 — 하나가 아니라 둘

전역 락 하나로도 동작은 한다. 하지만 `pm_sensor`가 `clients`를 순회하며 `send()`하는 동안 `handle_client`가 알람을 등록하려고 기다릴 이유가 없다. 둘은 다른 배열을 만진다. **공유 자원마다 독립 뮤텍스**를 두면 잠금 범위가 "그 배열을 만지는 순간"으로 줄어든다.

```c
void* pm_sensor(void* arg) {
    while (1) {
        pthread_mutex_lock(&clients_mutex);            // clients 만 잠근다
        for (int i = 0; i < client_count; i++)
            send(clients[i].socket, pm_level, strlen(pm_level), 0);
        pthread_mutex_unlock(&clients_mutex);
        sleep(5);                                      // 잠금 밖에서 대기
    }
}

void* alarm_check(void* arg) {
    while (1) {
        time_t now = time(NULL);
        pthread_mutex_lock(&alarms_mutex);             // alarms 만 잠근다
        for (int i = 0; i < alarm_count; i++) {
            if (alarms[i].alarm_time <= now) {
                send(alarms[i].client_socket, alarm_message, strlen(alarm_message), 0);
                alarms[i] = alarms[alarm_count - 1];   // 마지막 요소를 당겨와 빈칸 제거
                alarm_count--;
                i--;                                   // 당겨온 요소를 다시 검사
            }
        }
        pthread_mutex_unlock(&alarms_mutex);
        sleep(1);
    }
}
```

`sleep()`은 반드시 잠금 **밖**에서. 안에서 자면 5초 동안 아무도 `clients`를 못 만진다.

### 명령 파싱

```c
if (strncmp(buffer, "set_alarm", 9) == 0) {
    struct tm alarm_tm;
    sscanf(buffer + 10, "%d-%d-%d %d:%d:%d",
           &alarm_tm.tm_year, &alarm_tm.tm_mon, &alarm_tm.tm_mday,
           &alarm_tm.tm_hour, &alarm_tm.tm_min, &alarm_tm.tm_sec);
    alarm_tm.tm_year -= 1900;            // tm 기준 보정
    alarm_tm.tm_mon  -= 1;
    alarm_tm.tm_isdst = -1;
    time_t alarm_time = mktime(&alarm_tm);

    pthread_mutex_lock(&alarms_mutex);
    alarms[alarm_count].alarm_time    = alarm_time;
    alarms[alarm_count].client_socket = client->socket;
    alarm_count++;
    pthread_mutex_unlock(&alarms_mutex);
}
```

접속이 끊기면 `handle_client`가 `clients`에서 자기 항목을 지우고 `free()`한다 — 메인이 `malloc`으로 넘겨준 구조체는 스레드가 책임진다.

## 결과

어느 한 주기가 다른 주기를 지연시키지 않는 구조. 5초 갱신은 5초에, 알람은 그 시각에, 명령은 즉시. 다만 "그 시각에 알람이 **도달**하는가"는 또 다른 문제였다 — [TCP 메시지 경계 이야기](/posts/dust-tcp-message-boundary/).

<div class="tip">주기가 다른 일은 스레드를 나누고, 공유 자원이 다르면 락도 나눈다. 락의 범위는 "자원을 만지는 줄"에서 끝나야 하고, 대기는 락 밖에서.</div>
