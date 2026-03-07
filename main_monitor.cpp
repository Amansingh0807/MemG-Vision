/*
 * main_monitor.cpp  –  Phase 3: Standalone Real-Time System Memory Monitor
 *
 * Runs indefinitely, streaming live Windows system memory stats to the
 * MemGuard Vision dashboard via WebSocket on port 9001.
 *
 * What it reports every second:
 *   - Total physical RAM
 *   - Available / used RAM
 *   - Memory load percentage
 *
 * Build:
 *   & "C:\MinGW\bin\g++.exe" -std=c++11 -Wall -o memguard_monitor.exe
 * main_monitor.cpp -lws2_32
 *
 * Run alongside the dashboard (vs. memguard_demo_ws.exe which exits after
 * the 6 scenarios, this runs until you press Ctrl+C).
 */

#ifndef _WINSOCKAPI_
#define _WINSOCKAPI_
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>


#include "ws_server.hpp" /* zero-dependency WS server */

#include <stdio.h>
#include <time.h>

/* ──────────────────────────────────────────────────────────────── */
/* Produce an ISO-8601 timestamp string like "2026-03-07T15:00:00" */
/* ──────────────────────────────────────────────────────────────── */
static void iso_now(char *buf, int cap) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  if (t)
    snprintf(buf, cap, "%04d-%02d-%02dT%02d:%02d:%02d", t->tm_year + 1900,
             t->tm_mon + 1, t->tm_mday, t->tm_hour, t->tm_min, t->tm_sec);
  else
    snprintf(buf, cap, "1970-01-01T00:00:00");
}

/* ──────────────────────────────────────────────────────────────── */
/* main()                                                           */
/* ──────────────────────────────────────────────────────────────── */
int main() {
  /* Start WebSocket server on port 9001 */
  WsServer ws(9001);
  ws.start();

  printf("┌──────────────────────────────────────────────┐\n");
  printf("│  MemGuard Vision  –  Phase 3 System Monitor  │\n");
  printf("│  Streaming to ws://localhost:9001             │\n");
  printf("│  Press Ctrl+C to stop                        │\n");
  printf("└──────────────────────────────────────────────┘\n\n");
  fflush(stdout);

  while (true) {
    /* ── Query system memory ── */
    MEMORYSTATUSEX ms;
    ms.dwLength = sizeof(ms);
    GlobalMemoryStatusEx(&ms);

    ULONGLONG total_mb = ms.ullTotalPhys / (1024ULL * 1024ULL);
    ULONGLONG avail_mb = ms.ullAvailPhys / (1024ULL * 1024ULL);
    ULONGLONG used_mb = total_mb - avail_mb;
    DWORD load_pct = ms.dwMemoryLoad;

    char ts[32];
    iso_now(ts, sizeof(ts));

    /* ── Format JSON event ── */
    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"action\":\"sys_mem\","
             "\"total_mb\":%I64u,"
             "\"available_mb\":%I64u,"
             "\"used_mb\":%I64u,"
             "\"used_pct\":%lu,"
             "\"status\":\"monitor\","
             "\"timestamp\":\"%s\"}\n",
             total_mb, avail_mb, used_mb, (unsigned long)load_pct, ts);

    printf("%s", buf);
    fflush(stdout);
    ws.broadcast(buf);

    Sleep(1000); /* poll every second */
  }

  ws.stop();
  return 0;
}
