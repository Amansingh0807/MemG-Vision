# 🛡️ MemGuard Vision: The Cyberpunk C++ Memory Profiler

> **A real-time, low-overhead C++ memory tracker with a live 3D web dashboard.**

MemGuard Vision globally intercepts every `new` and `delete` call in a C++ program. It injects canary sentinels around every heap allocation, detects buffer overflows and memory leaks in-process, and streams all events as JSON through a WebSocket to a Next.js dashboard where you can watch your heap breathe in real-time 3D.

---

## 📸 Project Screenshot

![MemG Vision Screenshot](https://raw.githubusercontent.com/Amansingh0807/MemG-Vision/master/Screenshot%202026-03-08%20132251.png)

---

## 💡 Why This Was Built

Memory management in C++ is notoriously difficult. Segfaults, buffer overflows, and memory leaks often happen silently, crashing applications hours after the problematic code was executed. Traditional tools like Valgrind or ASAN are incredibly powerful but often come with heavy performance penalties and produce dense, text-based logs that are hard to visualize.

**MemGuard Vision was built to solve this by making memory tangible.** 

By transforming invisible byte allocations into a live, interactive 3D grid, developers can:
- **Instantly visualize** memory leaks as they happen instead of waiting for a program crash.
- **Understand application behavior** by watching memory usage patterns during different operations.
- **Demystify C++ memory semantics** for beginners by providing immediate visual feedback on `new`/`delete` operations.

## 🎯 Primary Use Cases

1. **Game Engine Development:** Monitor memory fragmentation, asset loading, and temporary allocations in real-time without pausing the game loop.
2. **Debugging Memory Leaks:** Identify runaway allocations that aren't being freed by tracking their exact source file and line number.
3. **Buffer Overflow Triage:** Instantly catch and locate off-by-one errors using hardware-level canary boundaries that trigger alerts the moment they are breached.
4. **Educational Demos:** Teach C++ students the importance of manual memory management by physically showing them the consequences of a missed `delete`.

---

## ✨ Core Features

| Feature | Description |
|---|---|
| **Global Interception** | Overrides `operator new` / `operator delete` across the entire program. No source changes needed for basic tracking. |
| **Source-Level Tracking** | Use the `MG_NEW` macro to track the exact `__FILE__` and `__LINE__` of every allocation! |
| **Buffer Overflow Detection** | `0xDEADBEEFDEADBEEF` canary values border every allocation; a corrupted tail canary triggers an instant `breach` event. |
| **Memory Leak Detection** | Every un-freed block is reported with its size, age, and source location at program exit. |
| **Zero-dependency WebSocket** | Inline SHA-1 + Base64, raw WinSock2 — no Boost, no vcpkg, no massive dependencies. |
| **Persistent Event History** | Dumps all memory events to `memguard_history.jsonl` and provides a History UI to review past sessions. |
| **Cyberpunk 3D Dashboard** | Next.js + Three.js + Tailwind UI featuring Orbitron/VT323 typography, CRT glows, and live 3D heap visualization. |

---

## 🏗️ Under the Hood: Memory Layout

Each allocation carries **24 bytes of overhead** on a 64-bit build:

```text
 ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
 │  Payload Size 8B │  HEAD CANARY  8B │  User Payload NB │  TAIL CANARY  8B │
 └──────────────────┴──────────────────┴──────────────────┴──────────────────┘
                                         ↑ pointer returned to caller
 CANARY_VALUE = 0xDEADBEEFDEADBEEF
```

---

## 🚀 Running Locally (Step-by-Step Guide)

You can run MemGuard in your own local environment in under 5 minutes.

### Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| **MinGW GCC** (Windows) | g++ 5+ | C++ compiler. Must be on `PATH` (e.g., `C:\MinGW\bin\`). |
| **Node.js** | 18+ | Required to run the Next.js React dashboard. |
| **npm** | 9+ | Package manager (comes with Node.js). |

---

### Step 1 — Build the C++ Backend

1. Clone this repository to your local machine.
2. Open a **PowerShell** or **Command Prompt** terminal.
3. Navigate to the project folder and compile the demo application using `g++`:

```powershell
cd "C:\Users\<YOU>\Desktop\MemG Vision"

# Note the & operator is required in PowerShell for paths with spaces
& "C:\MinGW\bin\g++.exe" -std=c++11 -Wall -o memguard_demo_ws.exe interceptor.cpp main_demo.cpp -lws2_32
```

*(No terminal output means compilation was perfectly successful. You will now see `memguard_demo_ws.exe` in the folder).*

---

### Step 2 — Install & Start the Dashboard

Open a **second terminal window** (leave the first one open!):

```powershell
cd "C:\Users\<YOU>\Desktop\MemG Vision\frontend"

# Install all React/Next.js dependencies (only needed the first time)
npm install

# Start the dashboard development server
npm run dev
```

The web dashboard is now running locally. **Open your browser and navigate to:** [http://localhost:3000](http://localhost:3000)

---

### Step 3 — Run the Memory Tests

With the web dashboard open on your screen, go back to your **first terminal** and run the executable:

```powershell
.\memguard_demo_ws.exe
```

The terminal will pause and wait:
> _"Waiting for dashboard to connect. Open http://localhost:3000 then press ENTER in this window to start the memory tests..."_

Hit **Enter** in the terminal and watch your browser! The C++ application will now execute 6 distinct memory scenarios (Normal Allocs, Array Allocs, Buffer Overflows, STL vectors, Multithreading, and Memory Leaks) and stream the data directly to the UI.

---

### Understanding the 3D Dashboard

| Visual | Meaning |
|---|---|
| 🟢 **Green cube** | Memory safely allocated (`alloc`). |
| 💨 **Cube fading** | Memory successfully freed (`free`). |
| 🔴 **Red pulsing cube** | Fatal Buffer Overflow detected (`breach`). |
| 🟡 **Amber pulsing cube**| Memory Leak detected! Block was never freed (`leak`). |

*Hint: Click and drag the grid to orbit the camera, and use your mouse wheel to zoom in/out.*

---

## 📂 Project Structure

```text
MemG Vision/
├── memguard.hpp          # Core memory tracker, canary validation, and telemetry JSON emit
├── interceptor.cpp       # Global operator new/delete overrides and thread-local guards
├── main_demo.cpp         # 6-part test suite driving the allocations
├── memguard_history.jsonl# Persisted log of all memory events (generated at runtime)
├── ws_server.hpp         # Zero-dependency WinSock2 WebSocket Server
├── ws_broadcaster.hpp    # Thread-safe WS broadcast manager
└── frontend/             # Next.js 15 Cyberpunk Web Dashboard
    ├── src/app/          
    │   ├── page.tsx      # Main 3D live dashboard UI
    │   ├── globals.css   # Cyberpunk aesthetic, Orbitron/VT323 fonts, CRT glows
    │   └── history/      # Timeline UI parsing the JSONL file
    ├── src/components/   
    │   ├── HeapCanvas.tsx # Three.js rendering engine for memory blocks
    │   ├── StatsPanel.tsx # System RAM and allocation metrics
    │   └── EventLog.tsx   # Real-time WebSocket scrolling terminal log
    └── src/hooks/
        └── useMemGuard.ts # Unified Websocket connection and state manager
```
---

## 🤝 How to Contribute

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. **Fork the Project**
2. **Create your Feature Branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your Changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the Branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

### Areas for Contribution
- Support for GCC/Clang on Linux and macOS (currently Windows/MinGW focused).
- Expanding the frontend dashboard with more granular metrics (e.g., fragmentation charts).
- Performance optimizations for high-throughput multi-threaded applications.

