# MemGuard Vision

MemGuard Vision is a custom memory allocator interceptor built in C++. It globally tracks `new` and `delete` calls, injects canary values around allocations to catch buffer overflows, detects memory leaks, and streams memory events as JSON.

## Features (Phase 1)
- Custom global `operator new`/`delete` overloads
- 8-byte Canary boundaries for buffer overflow detection
- Thread-safe Memory Tracker singleton
- Automated memory leak detection at program exit
- JSON event streaming

## Building
You can build with `CMake` on Windows, Linux, or macOS. Minimum C++11 required.

```sh
mkdir build
cd build
cmake ..
cmake --build . --config Release
./memguard_demo
```
