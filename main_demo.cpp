/**
 * =============================================================================
 *  MemGuard Vision – Phase 1 Demo Program
 *  main_demo.cpp
 * =============================================================================
 *
 *  PURPOSE
 *  -------
 *  Exercises every code path in the MemGuard interceptor and prints the
 *  resulting JSON events to stdout.
 *
 *  SCENARIOS
 *  ---------
 *  1. Normal allocation + free
 *  2. Array new / delete[]
 *  3. Deliberate buffer overflow (canary breach)
 *  4. Intentional memory leak (reported at exit)
 *  5. STL containers (std::string, std::vector)
 *  6. Concurrent allocations via Win32 threads
 *
 *  PORTABILITY
 *  -----------
 *  Threading uses CreateThread/WaitForSingleObject on Windows to avoid the
 *  C++11 <thread> dependency that old MinGW 32-bit does not support.
 *
 * =============================================================================
 */

#include "memguard.hpp" /* must come first – pulls in platform headers     */

#include <stdio.h>
#include <string.h> /* memset */
#include <string>
#include <vector>


/* ─── Scenario banner ────────────────────────────────────────────────────── */

static void section(const char *title) {
  printf("\n// ════════════════════════════════════════════════\n");
  printf("// SCENARIO: %s\n", title);
  printf("// ════════════════════════════════════════════════\n");
  fflush(stdout);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 1 – Normal alloc + free
   ═══════════════════════════════════════════════════════════════════════════
 */
static void scenario_normal_alloc_free() {
  section("1 – Normal alloc + free");

  int *p = new int(42);
  /* Expected JSON:
   * {"action":"alloc","address":"0x...","size":4,"status":"safe",...} */

  printf("// [C++]  *p = %d\n", *p);
  fflush(stdout);

  delete p;
  /* Expected JSON:
   * {"action":"free","address":"0x...","size":4,"status":"freed",...} */
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 2 – Array new / delete[]
   ═══════════════════════════════════════════════════════════════════════════
 */
static void scenario_array_alloc_free() {
  section("2 – Array alloc + free");

  /* 16 doubles = 128 bytes */
  double *arr = new double[16];
  memset(arr, 0, 16 * sizeof(double));
  arr[0] = 3.14;
  arr[15] = 2.71;
  printf("// [C++]  arr[0]=%.2f  arr[15]=%.2f\n", arr[0], arr[15]);
  fflush(stdout);

  delete[] arr;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 3 – Deliberate buffer overflow
   ═══════════════════════════════════════════════════════════════════════════
 */
static void scenario_buffer_overflow() {
  section("3 – Buffer Overflow (Canary Breach)");

  /*
   * Layout reminder:
   *   [size_hdr 8B][HEAD_CANARY 8B][user payload 16B][TAIL_CANARY 8B]
   *                                 ↑
   *                                 buf  (what the caller sees)
   *
   * Writing memset(buf+16, 0xFF, 8) overwrites the TAIL canary.
   */
  char *buf = new char[16];
  memset(buf, 'A', 16); /* safe write – fill all 16 legitimate bytes */

  printf("// [C++]  About to overflow 8 bytes past end of 16-byte buffer!\n");
  fflush(stdout);

  /* ⚠ INTENTIONAL OVERFLOW – educational demonstration only! */
  memset(buf + 16, 0xFF, 8); /* zaps the TAIL canary                    */

  delete[] buf;
  /* Expected JSON:
   * {"action":"breach",...,"status":"breach","breach_detail":"..."} */
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 4 – Intentional memory leak
   ═══════════════════════════════════════════════════════════════════════════
 */
static void scenario_leak() {
  section("4 – Intentional Memory Leak (visible at program exit)");

  char *secret = new char[256];
  memset(secret, 0xCC, 256);

  printf("// [C++]  Allocated 256 bytes at %p – deliberately leaked.\n",
         (void *)secret);
  printf("// The leak will appear in the summary JSON when main() returns.\n");
  fflush(stdout);

  /* secret is intentionally NOT freed */
  (void)secret;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 5 – STL containers (proves transparency of interception)
   ═══════════════════════════════════════════════════════════════════════════
 */
static void scenario_stl_containers() {
  section("5 – STL Containers (std::string, std::vector)");

  {
    /* std::string heap-allocates when the string > SSO threshold (~15 B) */
    std::string s(64, 'X');
    printf("// [C++]  std::string[0] = '%c'  (64-char string)\n", s[0]);
  }
  /* Destructor → delete → JSON free event */

  {
    std::vector<int> v(32, 7);
    printf("// [C++]  std::vector<int>[0] = %d  (32 elements)\n", v[0]);
  }
  /* Destructor → delete[] → JSON free event */
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scenario 6 – Concurrent allocations (Win32 threads)
   ═══════════════════════════════════════════════════════════════════════════
 */

struct WorkerArgs {
  int thread_id;
  int iterations;
};

/* Win32 thread function: must return DWORD and take LPVOID */
static DWORD WINAPI thread_alloc_worker(LPVOID param) {
  WorkerArgs *a = (WorkerArgs *)param;

  for (int i = 0; i < a->iterations; ++i) {
    size_t sz = (size_t)(64 * (a->thread_id + 1));
    char *buf = new char[sz];
    buf[0] = (char)('A' + a->thread_id);
    buf[sz - 1] = (char)('a' + a->thread_id);
    Sleep(1); /* tiny sleep to maximise interleaving */
    delete[] buf;
  }
  return 0;
}

static void scenario_multithreaded() {
  section("6 – Multi-threaded Concurrent Allocations (4 threads × 5 iter)");

  static const int NUM_THREADS = 4;
  static const int ITERATIONS = 5;

  HANDLE handles[NUM_THREADS];
  WorkerArgs args[NUM_THREADS];

  for (int t = 0; t < NUM_THREADS; ++t) {
    args[t].thread_id = t;
    args[t].iterations = ITERATIONS;
    handles[t] = CreateThread(NULL, /* default security attributes  */
                              0,    /* default stack size           */
                              thread_alloc_worker, /* thread function */
                              &args[t], /* argument                     */
                              0,        /* run immediately              */
                              NULL      /* don't need thread ID         */
    );
  }

  /* Wait for all threads to finish */
  WaitForMultipleObjects(NUM_THREADS, handles, TRUE /* wait all */, INFINITE);

  for (int t = 0; t < NUM_THREADS; ++t)
    CloseHandle(handles[t]);

  printf("// [C++]  %d threads × %d iterations = %d alloc/free pairs.\n",
         NUM_THREADS, ITERATIONS, NUM_THREADS * ITERATIONS);
  fflush(stdout);
}

/* ═══════════════════════════════════════════════════════════════════════════
   main()
   ═══════════════════════════════════════════════════════════════════════════
 */

int main() {
  printf("// ╔═══════════════════════════════════════════════════╗\n");
  printf("// ║        MemGuard Vision – Phase 1 Demo             ║\n");
  printf("// ║  Non-comment lines are valid JSON events.         ║\n");
  printf("// ╚═══════════════════════════════════════════════════╝\n");
  fflush(stdout);

  scenario_normal_alloc_free(); /* 1 */
  scenario_array_alloc_free();  /* 2 */
  scenario_buffer_overflow();   /* 3 – breach event */
  scenario_stl_containers();    /* 5 – run before leak for cleaner output */
  scenario_multithreaded();     /* 6 */
  scenario_leak();              /* 4 – LAST: shows in exit summary */

  printf("\n// All scenarios complete. Exiting...\n");
  printf("// MemoryTracker destructor will now emit leak + summary JSON.\n");
  fflush(stdout);

  return 0;
  /* MemoryTracker::~MemoryTracker() fires here:
     → leak_report events for scenario 4
     → summary event with total_allocs / total_frees / leaks_found         */
}
