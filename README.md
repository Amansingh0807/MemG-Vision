# 🛡️ MemGuard Vision

> **A real-time, low-overhead C++ memory tracker with a live 3D web dashboard.**

MemGuard Vision globally intercepts every `new` and `delete` call in a C++ program, injects canary sentinels around every heap allocation, detects buffer overflows and memory leaks in-process, and streams all events as JSON through a WebSocket to a Next.js dashboard where you can watch your heap breathe in 3D.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Global Interception** | Overrides `operator new` / `operator delete` across the entire program — no source changes required |
| **Buffer Overflow Detection** | `0xDEADBEEFDEADBEEF` canary values border every allocation; a corrupted tail canary triggers an instant `breach` event |
| **Memory Leak Detection** | Every un-freed block is reported with its size and age at program exit |
| **Thread-safe Registry** | Win32 `CRITICAL_SECTION`-guarded allocation map with a per-thread re-entrancy guard |
| **Zero-dependency WebSocket** | Inline SHA-1 + Base64, raw WinSock2 — no Boost, no Crow, no vcpkg |
| **Live 3D Dashboard** | Next.js + vanilla Three.js heap grid; cubes animate in/out with color-coded status |
| **Actionable JSON events** | `alloc`, `free`, `breach`, `leak_report`, `summary` — pipe them anywhere |

---

## 🏗️ Memory Layout

Each allocation carries **24 bytes of overhead** on a 64-bit build:

```
 ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
 │  Payload Size 8B │  HEAD CANARY  8B │  User Payload NB │  TAIL CANARY  8B │
 └──────────────────┴──────────────────┴──────────────────┴──────────────────┘
                                         ↑ pointer returned to caller
 CANARY_VALUE = 0xDEADBEEFDEADBEEF
```

---

## 🚀 Running Locally

### Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| **MinGW GCC** (Windows) | g++ 5+ | Must be on `PATH` at `C:\MinGW\bin\` |
| **Node.js** | 18+ | For the Next.js dashboard |
| **npm** | 9+ | Comes with Node.js |

---

### Step 1 — Build the C++ Backend

Open a **PowerShell** or **Command Prompt** terminal and run:

```powershell
cd "C:\Users\<YOU>\Desktop\MemG Vision"

# Note the & operator — required in PowerShell for quoted exe paths
& "C:\MinGW\bin\g++.exe" -std=c++11 -Wall -o memguard_demo_ws.exe interceptor.cpp main_demo.cpp -lws2_32
```

No output = success. The executable `memguard_demo_ws.exe` will appear in the project root.

---

### Step 2 — Install & Start the Dashboard (first time)

Open a **second terminal**:

```powershell
cd "C:\Users\<YOU>\Desktop\MemG Vision\frontend"

npm install      # installs Next.js, Three.js, Tailwind etc.
npm run dev      # starts at http://localhost:3000
```

> On subsequent runs you only need `npm run dev`.

---

### Step 3 — Run the C++ Demo

Back in the **first terminal**:

```powershell
.\memguard_demo_ws.exe
```

Expected output:
```
[WS] Listening on ws://localhost:9001 — open the dashboard!
// Waiting 2s for dashboard to connect...
[WS] Client connected  (active=1)

// ── SCENARIO: 1 – Normal alloc + free ──
{"action":"alloc","address":"0x...","size":4,"status":"safe",...}
{"action":"free","address":"0x...","size":4,"status":"freed",...}
...
{"action":"breach","address":"0x...","status":"breach","breach_detail":"canary overwritten - buffer overflow detected!"}
...
{"action":"leak_report","address":"0x...","size":256,"status":"leak",...}
{"action":"summary","total_allocs":25,"total_frees":24,"leaks_found":1,"leaked_bytes":256}
```

---

### Step 4 — Watch the Heap Live

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

| Visual | Meaning |
|---|---|
| 🟢 Green cube rising | Memory allocated (`alloc`) |
| ⬇️ Cube fading out | Memory freed (`free`) |
| 🔴 Red cube pulsing | Buffer overflow detected (`breach`) |
| 🟡 Amber cube breathing | Memory leak — block not freed (`leak`) |

**Controls:** drag to orbit · scroll to zoom

---

## 📊 Example JSON Output

```json
{"action":"alloc",  "address":"0x9c1874","size":4,  "status":"safe",   "timestamp":"..."}
{"action":"free",   "address":"0x9c1874","size":4,  "status":"freed",  "timestamp":"..."}
{"action":"breach", "address":"0x9c7724","size":16, "status":"breach", "timestamp":"...", "breach_detail":"canary overwritten - buffer overflow detected!"}
{"action":"leak_report","address":"0x9c16cc","size":256,"status":"leak","file":"<unknown>","age_seconds":0}
{"action":"summary","total_allocs":25,"total_frees":24,"leaks_found":1,"leaked_bytes":256}
```

---

## 📂 Project Structure

```
MemG Vision/
├── memguard.hpp          # Core tracker, canary logic, JSON emit + WS hook
├── interceptor.cpp       # Global operator new/delete overloads
├── main_demo.cpp         # 6-scenario demo driver
├── ws_server.hpp         # Zero-dependency WebSocket server (SHA-1, Base64, WinSock2)
├── ws_broadcaster.hpp    # Singleton that wires WsServer → memguard emit pipeline
├── CMakeLists.txt        # Cross-platform CMake build
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx          # Main dashboard layout
    │   │   └── globals.css       # Dark theme + Tailwind
    │   ├── components/
    │   │   ├── HeapCanvas.tsx    # Vanilla Three.js 3D heap scene
    │   │   ├── StatsPanel.tsx    # Live metrics sidebar
    │   │   └── EventLog.tsx      # Scrolling event stream
    │   └── hooks/
    │       └── useMemGuard.ts    # WebSocket → React state hook
    └── package.json
```

---

## 🗺️ Roadmap

- [x] **Phase 1** — C++ core engine (canaries, JSON telemetry, leak detection)
- [x] **Phase 2** — WebSocket bridge + live 3D Next.js dashboard
- [ ] **Phase 3** — Per-file/line tracking via placement-new macro + SQLite history replay
