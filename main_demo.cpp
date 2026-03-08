/*
 * main_demo.cpp  –  Phase 2 Demo Driver
 *
 * Starts a WebSocket server on port 9001 before running the Phase 1
 * allocation scenarios.  Every JSON event that was previously just
 * printf-ed is now also broadcast to the live 3D dashboard in real-time.
 *
 * Run the frontend (cd frontend && npm run dev) and then do:
 *   .\memguard_demo_ws.exe
 * Open http://localhost:3000 to watch the heap visualizer.
 */

/* Pull in ws_broadcaster FIRST so winsock2.h comes before windows.h */
#include "ws_broadcaster.hpp"

#include <stdio.h>
#include <string.h>
#include <string>
#include <vector>

/* ---------------------------------------------------------------------- */
static void section(const char *title) {
  printf("\n// ── SCENARIO: %s ──\n", title);
  fflush(stdout);
}

/* ======================================================================
   Scenario 1 – Normal alloc + free
   ====================================================================== */
static void scenario_normal_alloc_free() {
  section("1 – Normal alloc + free");
  int *p = MG_NEW(int, 42);
  printf("// [C++]  *p = %d\n", *p);
  fflush(stdout);
  MG_DEL(p);
}

/* ======================================================================
   Scenario 2 – Array new / delete[]
   ====================================================================== */
static void scenario_array_alloc_free() {
  section("2 – Array alloc + free");
  double *arr = MG_NEW_ARR(double, 16);
  for (int i = 0; i < 16; i++)
    arr[i] = (double)i * 3.14;
  printf("// [C++]  arr[0]=%.2f  arr[15]=%.2f\n", arr[0], arr[15]);
  fflush(stdout);
  MG_DEL_ARR(arr);
}

/* ======================================================================
   Scenario 3 – Buffer overflow (tail canary breach)
   ====================================================================== */
static void scenario_buffer_overflow() {
  section("3 – Buffer Overflow (Canary Breach)");
  char *buf = MG_NEW_ARR(char, 16);
  memset(buf, 'A', 16);
  printf("// [C++]  About to overflow 8 bytes past end of 16-byte buffer...\n");
  fflush(stdout);
  memset(buf + 16, 0xFF, 8); /* intentional overflow – demo only! */
  MG_DEL_ARR(buf);
}

/* ======================================================================
   Scenario 4 – Intentional memory leak
   ====================================================================== */
static void scenario_leak() {
  section("4 – Intentional Memory Leak (reported at exit)");
  char *secret = MG_NEW_ARR(char, 256);
  memset(secret, 0xCC, 256);
  printf("// [C++]  Leaked 256 bytes at %p – not freed.\n", (void *)secret);
  fflush(stdout);
  (void)secret;
}

/* ======================================================================
   Scenario 5 – STL containers
   ====================================================================== */
static void scenario_stl_containers() {
  section("5 – STL Containers (std::string, std::vector)");
  {
    std::string s(64, 'X');
    printf("// [C++]  std::string[0]='%c'  (64-char)\n", s[0]);
  }
  {
    std::vector<int> v(32, 7);
    printf("// [C++]  std::vector<int>[0]=%d  (32 elements)\n", v[0]);
  }
  fflush(stdout);
}

/* ======================================================================
   Scenario 6 – Concurrent allocations (Win32 threads)
   ====================================================================== */
struct WorkerArgs {
  int id;
  int iters;
};

static DWORD WINAPI thread_worker(LPVOID p) {
  WorkerArgs *a = (WorkerArgs *)p;
  for (int i = 0; i < a->iters; i++) {
    size_t sz = (size_t)(64 * (a->id + 1));
    char *buf = MG_NEW_ARR(char, sz);
    buf[0] = (char)('A' + a->id);
    Sleep(2);
    MG_DEL_ARR(buf);
  }
  return 0;
}

static void scenario_multithreaded() {
  section("6 – Multi-threaded Concurrent Allocations (4 × 5)");
  static const int N = 4, ITER = 5;
  HANDLE handles[N];
  WorkerArgs args[N];

  for (int t = 0; t < N; t++) {
    args[t] = {t, ITER};
    handles[t] = CreateThread(NULL, 0, thread_worker, &args[t], 0, NULL);
  }
  WaitForMultipleObjects(N, handles, TRUE, INFINITE);
  for (int t = 0; t < N; t++)
    CloseHandle(handles[t]);
  printf("// [C++]  %d threads × %d iterations done.\n", N, ITER);
  fflush(stdout);
}

/* ======================================================================
   main()
   ====================================================================== */
int main() {
  printf("// MemGuard Vision – Demo + Live System Monitor\n");
  printf("// Streaming to ws://localhost:9001\n");
  printf("// Press Ctrl+C to stop.\n");
  fflush(stdout);

  mg_start_ws_server(9001);

  printf("\n// ========================================================\n");
  printf("// Waiting for dashboard to connect. Open http://localhost:3000\n");
  printf("// then press ENTER in this window to start the memory tests...\n");
  printf("// ========================================================\n\n");
  fflush(stdout);
  getchar();

  // ── Run the 6 demo scenarios ──────────────────────────────────────
  scenario_normal_alloc_free();
  Sleep(600);
  scenario_array_alloc_free();
  Sleep(600);
  scenario_buffer_overflow();
  Sleep(800);
  scenario_stl_containers();
  Sleep(600);
  scenario_multithreaded();
  Sleep(600);
  scenario_leak();
  Sleep(600);

  printf("\n// Demo complete. Now streaming live system RAM (Ctrl+C to "
         "stop)...\n");
  fflush(stdout);

  // ── Stay alive forever: stream real system memory every second ────
  // Exactly like a Node.js server – runs until you hit Ctrl+C.
  while (true) {
    MEMORYSTATUSEX ms;
    ms.dwLength = sizeof(ms);
    GlobalMemoryStatusEx(&ms);

    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char ts[32] = "1970-01-01T00:00:00";
    if (t)
      snprintf(ts, sizeof(ts), "%04d-%02d-%02dT%02d:%02d:%02d",
               t->tm_year + 1900, t->tm_mon + 1, t->tm_mday, t->tm_hour,
               t->tm_min, t->tm_sec);

    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"action\":\"sys_mem\","
             "\"total_mb\":%I64u,"
             "\"available_mb\":%I64u,"
             "\"used_mb\":%I64u,"
             "\"used_pct\":%lu,"
             "\"status\":\"monitor\","
             "\"timestamp\":\"%s\"}\n",
             ms.ullTotalPhys / (1024ULL * 1024ULL),
             ms.ullAvailPhys / (1024ULL * 1024ULL),
             (ms.ullTotalPhys - ms.ullAvailPhys) / (1024ULL * 1024ULL),
             (unsigned long)ms.dwMemoryLoad, ts);

    printf("%s", buf);
    fflush(stdout);
    if (g_mg_broadcast_fn)
      g_mg_broadcast_fn(buf);

    Sleep(1000);
  }

  return 0;
}
