/**
 * =============================================================================
 *  MemGuard Vision – Phase 1 Core Header
 *  memguard.hpp
 * =============================================================================
 *
 *  PURPOSE
 *  -------
 *  Central type definitions, the MemoryTracker singleton, and all helper
 *  routines used by the global operator new/delete overloads.
 *
 *  DESIGN OVERVIEW
 *  ---------------
 *  Every allocation goes through three layers:
 *
 *    1. INTERCEPT  – Our overloaded ::operator new() is called instead of the
 *                    system one.
 *    2. CANARY     – We over-allocate so that a sentinel "canary" value sits
 *                    immediately before AND after the usable payload.
 *    3. TRACK      – The tracker stores metadata in a hash map so we can
 *                    query any live allocation at any point.
 *
 *  FINAL raw block layout (self-contained – works without external tracker)
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *    raw_ptr (from malloc)
 *    ↓
 *    ┌───────────────────┬────────────────────┬─────────────────┬────────────────────┐
 *    │ payload_size  8 B │  HEAD CANARY   8 B │ user payload NB │  TAIL CANARY
 * 8 B │
 *    └───────────────────┴────────────────────┴─────────────────┴────────────────────┘
 *                                               ↑
 *                                               user_ptr  (returned to caller)
 *
 *    user_ptr  = raw_ptr + SIZE_HEADER_BYTES + CANARY_BYTES
 *    overhead  = SIZE_HEADER_BYTES + 2 × CANARY_BYTES  = 8 + 8 + 8 = 24 bytes
 *
 *  THREAD SAFETY
 *  -------------
 *  Uses Windows CRITICAL_SECTION for maximum compatibility across MinGW
 *  versions (avoids the C++11 <mutex> dependency that old MinGW 32-bit
 *  does not ship).  On non-Windows targets we use POSIX pthread_mutex_t.
 *
 * =============================================================================
 */

#pragma once

/* ── System includes ─────────────────────────────────────────────────────── */
#include <stdint.h> /* uint8_t, uint64_t, uintptr_t                        */
#include <stdio.h>  /* printf, fflush, snprintf                             */
#include <stdlib.h> /* malloc, free                                         */
#include <string.h> /* memcpy                                               */
#include <time.h>   /* time_t, time(), localtime()                          */

/* ── C++ standard includes ───────────────────────────────────────────────── */
#include <map> /* std::map for the allocation registry  (avoids       */
#include <sstream>
#include <string>
/* potential operator new recursion inside unordered)  */

/* ── Platform-specific sync primitives ──────────────────────────────────── */
#if defined(_WIN32) || defined(__WIN32__) || defined(__MINGW32__)
#define WIN32_LEAN_AND_MEAN
#include <windows.h> /* CRITICAL_SECTION, HANDLE, CreateThread, etc.  */
typedef CRITICAL_SECTION mg_mutex_t;
typedef LONG mg_atomic_t; /* InterlockedIncrement target    */
#define MG_MUTEX_INIT(m) InitializeCriticalSection(m)
#define MG_MUTEX_DESTROY(m) DeleteCriticalSection(m)
#define MG_MUTEX_LOCK(m) EnterCriticalSection(m)
#define MG_MUTEX_UNLOCK(m) LeaveCriticalSection(m)
#else
#include <pthread.h>
typedef pthread_mutex_t mg_mutex_t;
typedef long mg_atomic_t;
#define MG_MUTEX_INIT(m) pthread_mutex_init(m, NULL)
#define MG_MUTEX_DESTROY(m) pthread_mutex_destroy(m)
#define MG_MUTEX_LOCK(m) pthread_mutex_lock(m)
#define MG_MUTEX_UNLOCK(m) pthread_mutex_unlock(m)
#endif

/* ═══════════════════════════════════════════════════════════════════════════
   CANARY CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * CANARY_VALUE – The sentinel pattern.
 * 0xDEADBEEFDEADBEEF fills 8 bytes and is trivially spotted in a hex dump.
 * If an out-of-bounds write overwrites this value, we know exactly where the
 * memory corruption occurred.
 */
static const uint64_t CANARY_VALUE = (uint64_t)0xDEADBEEFDEADBEEFULL;
static const size_t CANARY_BYTES = sizeof(CANARY_VALUE); /* 8 */
static const size_t SIZE_HEADER_BYTES = sizeof(size_t);

/* Total overhead per allocation (size field + head canary + tail canary) */
static const size_t MG_OVERHEAD =
    SIZE_HEADER_BYTES + CANARY_BYTES + CANARY_BYTES;

/* Status strings – used verbatim in JSON "status" fields */
static const char *const STATUS_SAFE = "safe";
static const char *const STATUS_FREED = "freed";
static const char *const STATUS_LEAK = "leak";
static const char *const STATUS_BREACH = "breach";
static const char *const STATUS_DOUBLE = "double_free";

/* ═══════════════════════════════════════════════════════════════════════════
   AllocationRecord
   ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * AllocationRecord
 * ----------------
 * Everything we know about one live heap allocation.
 *
 *   raw_ptr   – Pointer returned by malloc() (starts at size-header field).
 *   user_ptr  – Pointer returned to the caller (past head canary).
 *   user_size – Bytes the caller requested.
 *   timestamp – Unix epoch at the moment of allocation.
 *   file      – Source-file tag (populated by macro, "<unknown>" otherwise).
 *   line      – Source-line (0 if unknown).
 */
struct AllocationRecord {
  void *raw_ptr;
  void *user_ptr;
  size_t user_size;
  time_t timestamp;
  const char *file;
  int line;
};

/* Zero-initialise a record (C-friendly helper) */
inline void mg_record_init(AllocationRecord *r) {
  r->raw_ptr = 0;
  r->user_ptr = 0;
  r->user_size = 0;
  r->timestamp = 0;
  r->file = "<unknown>";
  r->line = 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   JSON / Formatting helpers
   ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ptr_to_hex()
 * Converts a raw pointer to a "0x…" hex string.
 */
inline std::string ptr_to_hex(const void *ptr) {
  std::ostringstream oss;
  oss << "0x" << std::hex << (uintptr_t)(ptr);
  return oss.str();
}

/**
 * current_iso_timestamp()
 * Returns "YYYY-MM-DDTHH:MM:SS" using localtime (not thread-safe, but fine
 * for diagnostic-only output).
 */
inline std::string current_iso_timestamp() {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  if (!t)
    return "1970-01-01T00:00:00";

  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d", t->tm_year + 1900,
           t->tm_mon + 1, t->tm_mday, t->tm_hour, t->tm_min, t->tm_sec);
  return buf;
}

/**
 * emit_json()
 * -----------
 * Immediately prints a single-line JSON event to stdout.
 *
 * Example:
 *   {"action":"alloc","address":"0x7ff1abc","size":64,"status":"safe","timestamp":"2024-01-01T10:00:00"}
 *
 * @param action   "alloc" | "free" | "leak_report" | "breach"
 * @param address  Hex string of the user-facing pointer
 * @param size     Bytes the caller requested
 * @param status   One of the STATUS_* string constants
 * @param extra    Optional raw JSON fragment appended before the closing '}'
 *                 (must start with ',' if non-empty, e.g. ,"key":"value")
 */
inline void emit_json(const std::string &action, const std::string &address,
                      size_t size, const char *status,
                      const std::string &extra = "") {
  /* Use %I64u on old MinGW/MSVC; %llu on GCC/Clang targeting 64-bit. */
#if defined(__MINGW32__) && !defined(__MINGW64__)
  printf("{\"action\":\"%s\",\"address\":\"%s\",\"size\":%I64u,"
         "\"status\":\"%s\",\"timestamp\":\"%s\"%s}\n",
         action.c_str(), address.c_str(), (unsigned long long)(size), status,
         current_iso_timestamp().c_str(), extra.c_str());
#else
  printf("{\"action\":\"%s\",\"address\":\"%s\",\"size\":%llu,"
         "\"status\":\"%s\",\"timestamp\":\"%s\"%s}\n",
         action.c_str(), address.c_str(), (unsigned long long)(size), status,
         current_iso_timestamp().c_str(), extra.c_str());
#endif
  fflush(stdout);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MemoryTracker  – Thread-safe allocation registry (singleton)
   ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * MemoryTracker
 * -------------
 * Singleton class that maintains a registry of all live allocations.
 *
 * THREAD SAFETY
 *   Uses a platform-native mutex (CRITICAL_SECTION on Windows, pthread on
 *   POSIX).  A per-thread recursion guard prevents infinite loops when the
 *   registry's own internal allocation triggers our operator new.
 *
 * SINGLETON PATTERN
 *   instance() returns a reference to a function-local static, which the
 *   C++ standard guarantees is initialised exactly once (thread-safe since
 *   C++11; acceptable even on older standards for single-threaded init).
 */
class MemoryTracker {
public:
  /** Returns the single global instance. */
  static MemoryTracker &instance() {
    static MemoryTracker tracker;
    return tracker;
  }

  /* Non-copyable */
  MemoryTracker(const MemoryTracker &);
  MemoryTracker &operator=(const MemoryTracker &);

  /* ── Registration ──────────────────────────────────────────────────── */

  /**
   * on_alloc()
   * ----------
   * Record a new allocation and emit the JSON "alloc" event.
   *
   * @param record  Fully-populated AllocationRecord.
   */
  void on_alloc(const AllocationRecord &record) {
    if (!active_)
      return;

    /* Recursion guard prevents infinite loop if the map allocates */
    if (in_tracker_)
      return;
    in_tracker_ = true;

    MG_MUTEX_LOCK(&mutex_);
    records_[(uintptr_t)record.user_ptr] = record;
    total_allocs_++;
    live_bytes_ += record.user_size;
    MG_MUTEX_UNLOCK(&mutex_);

    emit_json("alloc", ptr_to_hex(record.user_ptr), record.user_size,
              STATUS_SAFE);

    in_tracker_ = false;
  }

  /* ── Deregistration ────────────────────────────────────────────────── */

  /**
   * on_free()
   * ---------
   * Remove an allocation from the registry and emit the appropriate event.
   *
   * @param user_ptr  The pointer being deleted.
   * @param canary_ok TRUE if both canaries were intact; FALSE = overflow.
   * @return          The raw malloc() pointer to actually free(), or NULL
   *                  when the pointer was not registered (double-free).
   */
  void *on_free(void *user_ptr, bool canary_ok) {
    if (!active_)
      return NULL;
    if (in_tracker_)
      return NULL;
    in_tracker_ = true;

    void *raw = NULL;
    size_t freed_size = 0;

    MG_MUTEX_LOCK(&mutex_);
    std::map<uintptr_t, AllocationRecord>::iterator it =
        records_.find((uintptr_t)user_ptr);

    if (it == records_.end()) {
      /* Unknown pointer – either double-free or a pointer we didn't
         allocate (e.g., from a static buffer or the C runtime).      */
      MG_MUTEX_UNLOCK(&mutex_);
      emit_json("free", ptr_to_hex(user_ptr), 0, STATUS_DOUBLE);
      in_tracker_ = false;
      return NULL;
    }

    raw = it->second.raw_ptr;
    freed_size = it->second.user_size;
    records_.erase(it);
    total_frees_++;
    live_bytes_ -= freed_size;
    MG_MUTEX_UNLOCK(&mutex_);

    if (!canary_ok) {
      /* 🔴 SECURITY BREACH – canary was overwritten (buffer overflow) */
      std::string extra = ",\"breach_detail\":\"canary overwritten - buffer "
                          "overflow detected!\"";
      emit_json("breach", ptr_to_hex(user_ptr), freed_size, STATUS_BREACH,
                extra);
    } else {
      emit_json("free", ptr_to_hex(user_ptr), freed_size, STATUS_FREED);
    }

    in_tracker_ = false;
    return raw;
  }

  /* ── Leak reporting ────────────────────────────────────────────────── */

  /**
   * report_leaks()
   * --------------
   * Called from the destructor at program exit.  Emits one JSON event for
   * every allocation that was never freed, then a final summary.
   */
  void report_leaks() {
    if (!active_)
      return;
    active_ = false;

    MG_MUTEX_LOCK(&mutex_);

    unsigned long long leak_count = 0;
    unsigned long long leak_bytes = 0;

    for (std::map<uintptr_t, AllocationRecord>::iterator it = records_.begin();
         it != records_.end(); ++it) {
      const void *ptr = (void *)(it->first);
      const AllocationRecord &rec = it->second;

      ++leak_count;
      leak_bytes += (unsigned long long)(rec.user_size);

      std::ostringstream extra;
      extra << ",\"file\":\"" << (rec.file ? rec.file : "?") << "\""
            << ",\"line\":" << rec.line
            << ",\"age_seconds\":" << (long)(time(NULL) - rec.timestamp);

      emit_json("leak_report", ptr_to_hex(ptr), rec.user_size, STATUS_LEAK,
                extra.str());
    }

    MG_MUTEX_UNLOCK(&mutex_);

    /* Final summary */
#if defined(__MINGW32__) && !defined(__MINGW64__)
    printf(
        "{\"action\":\"summary\",\"total_allocs\":%I64u,\"total_frees\":%I64u,"
        "\"leaks_found\":%I64u,\"leaked_bytes\":%I64u}\n",
        (unsigned long long)total_allocs_, (unsigned long long)total_frees_,
        leak_count, leak_bytes);
#else
    printf("{\"action\":\"summary\",\"total_allocs\":%llu,\"total_frees\":%llu,"
           "\"leaks_found\":%llu,\"leaked_bytes\":%llu}\n",
           (unsigned long long)total_allocs_, (unsigned long long)total_frees_,
           leak_count, leak_bytes);
#endif
    fflush(stdout);
  }

  /* ── Accessors ─────────────────────────────────────────────────────── */
  unsigned long long total_allocs() const { return total_allocs_; }
  unsigned long long total_frees() const { return total_frees_; }
  size_t live_bytes() const { return live_bytes_; }

private:
  MemoryTracker()
      : active_(true), total_allocs_(0), total_frees_(0), live_bytes_(0) {
    MG_MUTEX_INIT(&mutex_);
  }
  ~MemoryTracker() {
    report_leaks();
    MG_MUTEX_DESTROY(&mutex_);
  }

  bool active_;
  mg_mutex_t mutex_;
  std::map<uintptr_t, AllocationRecord> records_;

  unsigned long long total_allocs_;
  unsigned long long total_frees_;
  size_t live_bytes_;

  /*
   * Per-thread recursion guard.
   *
   * We use a __thread (GCC) / __declspec(thread) (MSVC) storage-class
   * specifier rather than C++11 thread_local, because old MinGW 32-bit
   * does not support the C++11 keyword but DOES support __thread.
   */
#if defined(_MSC_VER)
  __declspec(thread) static bool in_tracker_;
#else
  static __thread bool in_tracker_;
#endif
};

/* NOTE: The out-of-class definition of in_tracker_ must appear in exactly
   ONE .cpp file (interceptor.cpp).  It is NOT defined here to avoid the
   multiple-definition linker error when this header is included in more
   than one translation unit.                                              */
