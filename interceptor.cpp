/**
 * =============================================================================
 *  MemGuard Vision – Global Operator Overloads & Canary Logic
 *  interceptor.cpp
 * =============================================================================
 *
 *  HOW THE INTERCEPTION WORKS
 *  --------------------------
 *  C++ mandates that every translation unit use the SAME ::operator new /
 *  ::operator delete.  By defining them in ONE translation unit (this file)
 *  we silently replace the library versions for the ENTIRE program – no
 *  source changes in the target code are needed.
 *
 *  We define the ten standard replacement forms:
 *    1.  void* operator new   (std::size_t)                – single object
 *    2.  void* operator new[] (std::size_t)                – array
 *    3.  void* operator new   (std::size_t, nothrow)       – nothrow single
 *    4.  void* operator new[] (std::size_t, nothrow)       – nothrow array
 *    5.  void  operator delete   (void*)  noexcept         – single object
 *    6.  void  operator delete[] (void*)  noexcept         – array
 *    7.  void  operator delete   (void*, std::size_t)      – sized (C++14)
 *    8.  void  operator delete[] (void*, std::size_t)      – sized array
 *    9.  void  operator delete   (void*, nothrow)          – nothrow single
 *   10.  void  operator delete[] (void*, nothrow)          – nothrow array
 *
 *  FINAL raw block layout (self-contained – works without the tracker)
 *  ──────────────────────────────────────────────────────────────────
 *
 *    raw_ptr (returned by malloc)
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
 *  CANARY VERIFICATION on free()
 *  ─────────────────────────────
 *    1. user_ptr – CANARY_BYTES – SIZE_HEADER_BYTES  = raw_ptr
 *    2. Read stored_size from raw_ptr
 *    3. Read head_canary from raw_ptr + SIZE_HEADER_BYTES
 *    4. Read tail_canary from user_ptr + stored_size
 *    5. If head != CANARY_VALUE OR tail != CANARY_VALUE → BREACH
 *
 * =============================================================================
 */

#include "memguard.hpp"

#include <cstdlib> // malloc, free
#include <cstring> // memcpy
#include <new>     // std::bad_alloc, std::nothrow_t

// SIZE_HEADER_BYTES, CANARY_BYTES, CANARY_VALUE are defined in memguard.hpp.
// MG_OVERHEAD is the alias used throughout this file.
static const size_t OVERHEAD = MG_OVERHEAD;

// ─── MemoryTracker thread-local definition
// ──────────────────────────────────── This definition must appear in exactly
// ONE translation unit. memguard.hpp declares the member; we define it here.
#if defined(_MSC_VER)
__declspec(thread) bool MemoryTracker::in_tracker_ = false;
#else
__thread bool MemoryTracker::in_tracker_ = false;
#endif

// WebSocket broadcast hook (NULL by default; set by mg_start_ws_server in
// main).
MgBroadcastFn g_mg_broadcast_fn = NULL;

// JSONL persistence file (NULL = disabled; opened by mg_start_ws_server).
FILE *g_mg_log_file = NULL;

// Per-file/line source tracking thread-locals (set by MG_NEW macro).
__thread const char *mg_src_file = "<unknown>";
__thread int mg_src_line = 0;

// =============================================================================
//  mg_alloc()  –  Core allocation with canary injection
// =============================================================================

/**
 * mg_alloc()
 * ----------
 * Wraps malloc() with canary injection and tracker registration.
 *
 * @param size  Bytes the caller requested.
 * @param file  Source file tag (optional – for future macro support).
 * @param line  Source line  (optional).
 * @return Pointer to user payload, or nullptr when malloc fails.
 *
 * Steps
 * ─────
 *  1. Ensure size >= 1 (C++ standard: new(0) must return unique non-null ptr).
 *  2. malloc(SIZE_HEADER_BYTES + CANARY_BYTES + size + CANARY_BYTES).
 *  3. Write payload size  at  [raw_ptr + 0].
 *  4. Write HEAD_CANARY   at  [raw_ptr + SIZE_HEADER_BYTES].
 *  5. Write TAIL_CANARY   at  [raw_ptr + SIZE_HEADER_BYTES + CANARY_BYTES +
 * size].
 *  6. user_ptr = raw_ptr + SIZE_HEADER_BYTES + CANARY_BYTES.
 *  7. Register with MemoryTracker (emits JSON alloc event).
 *  8. Return user_ptr.
 */
static void *mg_alloc(std::size_t size, const char *file = "<unknown>",
                      int line = 0) {
  // Step 1 – guarantee at least 1 byte payload
  if (size == 0)
    size = 1;

  // Step 2 – raw allocation
  const std::size_t total = OVERHEAD + size;
  void *raw = std::malloc(total);
  if (!raw)
    return nullptr; // caller must throw std::bad_alloc

  uint8_t *base = static_cast<uint8_t *>(raw);

  // Step 3 – embed payload size (memcpy avoids strict-aliasing UB)
  std::memcpy(base, &size, SIZE_HEADER_BYTES);

  // Step 4 – head canary  (immediately after size field)
  std::memcpy(base + SIZE_HEADER_BYTES, &CANARY_VALUE, CANARY_BYTES);

  // Step 5 – tail canary  (immediately after user payload)
  std::memcpy(base + SIZE_HEADER_BYTES + CANARY_BYTES + size, &CANARY_VALUE,
              CANARY_BYTES);

  // Step 6 – user pointer
  void *user_ptr = base + SIZE_HEADER_BYTES + CANARY_BYTES;

  // Step 7 – register with tracker (may emit JSON to stdout)
  AllocationRecord rec;
  rec.raw_ptr = raw;
  rec.user_ptr = user_ptr;
  rec.user_size = size;
  rec.timestamp = time(nullptr);

  // Use thread-local source information (set by MG_NEW)
  rec.file = mg_src_file;
  rec.line = mg_src_line;

  // Reset so subsequent allocations without MG_NEW don't inherit these
  mg_src_file = "<unknown>";
  mg_src_line = 0;

  MemoryTracker::instance().on_alloc(rec);

  // Step 8 – return to caller
  return user_ptr;
}

// =============================================================================
//  mg_dealloc()  –  Canary verification and deallocation
// =============================================================================

/**
 * mg_dealloc()
 * ------------
 * Verifies both canaries, informs the tracker, then frees the raw block.
 *
 * @param user_ptr  The pointer the caller is deleting (may be nullptr).
 *
 * Steps
 * ─────
 *  1. Null-check (delete nullptr is always a no-op per C++ standard).
 *  2. Compute raw_ptr = user_ptr - CANARY_BYTES - SIZE_HEADER_BYTES.
 *  3. Read stored_size from raw_ptr.
 *  4. Read & verify HEAD canary at raw_ptr + SIZE_HEADER_BYTES.
 *  5. Read & verify TAIL canary at user_ptr + stored_size.
 *  6. canary_ok = head_ok && tail_ok.
 *  7. Inform MemoryTracker::on_free() → emits "free" or "breach" JSON.
 *     Returns the registered raw_ptr (or nullptr for unknown pointers).
 *  8. std::free(raw_ptr).
 */
static void mg_dealloc(void *user_ptr) noexcept {
  // Step 1 – null guard
  if (!user_ptr)
    return;

  uint8_t *base =
      static_cast<uint8_t *>(user_ptr) - CANARY_BYTES - SIZE_HEADER_BYTES;

  // Step 3 – read stored payload size (so we can locate the tail canary)
  std::size_t stored_size = 0;
  std::memcpy(&stored_size, base, SIZE_HEADER_BYTES);

  // Step 4 – read and verify HEAD canary
  uint64_t head_canary = 0;
  std::memcpy(&head_canary, base + SIZE_HEADER_BYTES, CANARY_BYTES);
  const bool head_ok = (head_canary == CANARY_VALUE);

  // Step 5 – read and verify TAIL canary
  //   tail is at:  user_ptr + stored_size
  //             =  base + SIZE_HEADER_BYTES + CANARY_BYTES + stored_size
  uint64_t tail_canary = 0;
  std::memcpy(&tail_canary, static_cast<uint8_t *>(user_ptr) + stored_size,
              CANARY_BYTES);
  const bool tail_ok = (tail_canary == CANARY_VALUE);

  // Step 6 – combined result
  const bool canary_ok = head_ok && tail_ok;

  // Step 7 – notify tracker; get back the tracked raw_ptr
  //   on_free() emits the appropriate JSON event (free / breach / double_free)
  void *tracked_raw = MemoryTracker::instance().on_free(user_ptr, canary_ok);

  // Step 8 – release memory
  //   We use 'base' (computed locally) rather than tracked_raw to avoid
  //   crashing on double-free where on_free() returns nullptr.
  if (tracked_raw) {
    std::free(tracked_raw); // normal path
  } else {
    // Unknown / double-free – still release what we computed to prevent
    // actual leak.  The double_free JSON was already emitted by the tracker.
    std::free(base);
  }
}

// =============================================================================
//  GLOBAL OPERATOR new  REPLACEMENTS
// =============================================================================

/**
 * Single-object new – the primary replacement.
 * Throws std::bad_alloc on allocation failure (C++ standard § 6.7.5.4).
 */
void *operator new(std::size_t size) {
  void *ptr = mg_alloc(size);
  if (!ptr)
    throw std::bad_alloc();
  return ptr;
}

/**
 * Array new – semantically identical for our interceptor.
 */
void *operator new[](std::size_t size) {
  void *ptr = mg_alloc(size);
  if (!ptr)
    throw std::bad_alloc();
  return ptr;
}

/**
 * Nothrow single-object new – returns nullptr instead of throwing.
 */
void *operator new(std::size_t size, const std::nothrow_t &) noexcept {
  return mg_alloc(size);
}

/**
 * Nothrow array new.
 */
void *operator new[](std::size_t size, const std::nothrow_t &) noexcept {
  return mg_alloc(size);
}

// =============================================================================
//  GLOBAL OPERATOR delete  REPLACEMENTS
// =============================================================================

/**
 * Single-object delete.
 */
void operator delete(void *ptr) noexcept { mg_dealloc(ptr); }

/**
 * Array delete.
 */
void operator delete[](void *ptr) noexcept { mg_dealloc(ptr); }

/**
 * C++14 sized delete – compiler may call this when it knows the size at the
 * deletion site.  We ignore 'size' and use the value stored in our header.
 */
void operator delete(void *ptr, std::size_t /*size*/) noexcept {
  mg_dealloc(ptr);
}

/**
 * C++14 sized array delete.
 */
void operator delete[](void *ptr, std::size_t /*size*/) noexcept {
  mg_dealloc(ptr);
}

/**
 * Nothrow single-object delete.
 */
void operator delete(void *ptr, const std::nothrow_t &) noexcept {
  mg_dealloc(ptr);
}

/**
 * Nothrow array delete.
 */
void operator delete[](void *ptr, const std::nothrow_t &) noexcept {
  mg_dealloc(ptr);
}
