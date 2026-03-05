# 🛡️ MemGuard Vision (Core Engine)

> **A real-time, low-overhead C++ memory tracker with visual telemetry.**

MemGuard Vision is a custom memory allocator interceptor built in C++. It globally tracks `new` and `delete` calls, injects canary values around allocations to catch buffer overflows, detects memory leaks, and streams memory events as JSON.

This repository currently contains **Phase 1** (The C++ Core Engine).
*Phase 2 (The 3D Web Dashboard & WebSockets) is actively under development.*

---

## ✨ Features

- **Global Interception**: Overrides standard `operator new` and `operator delete` across the entire application without needing to change your source code.
- **Buffer Overflow Detection (Canaries)**: Injects unique 8-byte boundaries (`0xDEADBEEFDEADBEEF`) around every allocation. If the tail canary is overwritten, the breach is instantly flagged on `delete`.
- **Zero-Dependency Core**: The core tracking engine has zero third-party dependencies and uses standard `map` and `mutex` implementations.
- **Actionable JSON Telemetry**: Outputs clean JSON logs containing `alloc`, `free`, `breach`, and `leak_report` events.
- **Thread-safe Registry**: Employs recursion-guarded, platform-agnostic synchronization (Win32 Critical Sections / POSIX pthreads) to track multithreaded allocations perfectly.

---

## 🏗️ Architecture Layout

Every allocation is safely padded with metadata. On a 64-bit system, the layout adds exactly 24 bytes of overhead to ensure memory safety:

```text
  [ Payload Size (8B) ]  ← Stores the requested block size
  [ HEAD CANARY (8B)  ]  ← Sentinel value to prevent underflows
  [ User Payload      ]  ← The actual usable memory returned to your app
  [ TAIL CANARY (8B)  ]  ← Sentinel value to detect buffer overflows
```

---

## 🚀 Building the Core

The project uses CMake as its cross-platform build system. You can build it on Windows, macOS, or Linux. Minimum requirement is **C++11**.

### Quick Start

```bash
# 1. Create a build directory
mkdir build && cd build

# 2. Generate the build files
cmake ..

# 3. Compile the project
cmake --build . --config Release

# 4. Run the demo
./memguard_demo
```

---

## 📊 Example Output

When running the demo, the MemGuard engine will output logs like this:

**Normal Allocation:**
```json
{"action":"alloc","address":"0x9c1874","size":4,"status":"safe","timestamp":"2026-03-05T14:06:30"}
```

**Buffer Overflow Detected:**
```json
{"action":"breach","address":"0x9c7724","size":16,"status":"breach","timestamp":"2026-03-05T14:06:30","breach_detail":"canary overwritten - buffer overflow detected!"}
```

**Memory Leak Report (On Exit):**
```json
{"action":"leak_report","address":"0x9c16cc","size":256,"status":"leak","timestamp":"2026-03-05T14:06:31","file":"<unknown>","line":0,"age_seconds":0}
{"action":"summary","total_allocs":25,"total_frees":24,"leaks_found":1,"leaked_bytes":256}
```
