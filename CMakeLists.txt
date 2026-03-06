# =============================================================================
#  MemGuard Vision – Phase 1 Build System
#  CMakeLists.txt
# =============================================================================
#
#  Requirements
#  ------------
#    CMake >= 3.17
#    A C++17-capable compiler:
#      • Windows : MSVC 2019+ or MinGW-w64 g++ 9+
#      • Linux   : g++ 9+ or clang++ 9+
#      • macOS   : Xcode 11+ (clang++)
#
#  Quick Build (out-of-source)
#  ---------------------------
#    mkdir build && cd build
#    cmake ..
#    cmake --build . --config Release
#    ./memguard_demo          (or .\memguard_demo.exe on Windows)
#
# =============================================================================

cmake_minimum_required(VERSION 3.17)

project(MemGuardVision
        VERSION     1.0.0
        DESCRIPTION "Real-Time Memory Security & Leak Visualizer - Phase 1 C++ Core"
        LANGUAGES   CXX)

# ── C++ standard ──────────────────────────────────────────────────────────────
# Require C++17; fall back is NOT acceptable because we use structured bindings,
# std::unordered_map::extract, and other C++17 features throughout.
set(CMAKE_CXX_STANDARD          17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS        OFF)   # use -std=c++17, not -std=gnu++17

# ── Default build type ─────────────────────────────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "RelWithDebInfo" CACHE STRING
        "Build type: Debug | Release | RelWithDebInfo | MinSizeRel" FORCE)
endif()

# ── Source files ───────────────────────────────────────────────────────────────
set(MEMGUARD_SOURCES
    interceptor.cpp     # global operator new/delete replacements + canary logic
    main_demo.cpp       # demo / test driver
)

# memguard.hpp is header-only; add it so IDEs show it in the project tree
set(MEMGUARD_HEADERS
    memguard.hpp
    ws_server.hpp
    ws_broadcaster.hpp
)

# ── Executable target ──────────────────────────────────────────────────────────
add_executable(memguard_demo
    ${MEMGUARD_SOURCES}
    ${MEMGUARD_HEADERS}
)

# Keep the header file visible to the compiler without path shenanigans
target_include_directories(memguard_demo PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Link Winsock2 on Windows for the WebSocket server
if(WIN32)
    target_link_libraries(memguard_demo PRIVATE ws2_32)
endif()


# ── Compiler warnings & hardening flags ───────────────────────────────────────

if(MSVC)
    target_compile_options(memguard_demo PRIVATE
        /W4           # High warning level
        /WX           # Warnings as errors
        /permissive-  # Strict standard conformance
        /sdl          # Additional SDL checks
        /analyze-     # Disable static analysis (we have our own runtime checks!)
    )

    # Enable address-space layout randomisation in the linker
    target_link_options(memguard_demo PRIVATE /DYNAMICBASE)

else()
    # GCC / Clang / MinGW
    target_compile_options(memguard_demo PRIVATE
        -Wall
        -Wextra
        -Wpedantic
        -Wshadow
        -Wformat=2
        -Wnon-virtual-dtor
        -Wno-unused-function     # some helper statics are conditional
    )

    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_compile_options(memguard_demo PRIVATE
            -fsanitize=address   # ASAN – secondary safety net
            -fno-omit-frame-pointer
        )
        target_link_options(memguard_demo PRIVATE -fsanitize=address)
    endif()
endif()

# ── Threading ──────────────────────────────────────────────────────────────────
# std::thread on Linux requires -lpthread; CMake's Threads module handles it.
find_package(Threads REQUIRED)
target_link_libraries(memguard_demo PRIVATE Threads::Threads)

# ── IDE source grouping ────────────────────────────────────────────────────────
source_group("Source Files" FILES ${MEMGUARD_SOURCES})
source_group("Header Files" FILES ${MEMGUARD_HEADERS})

# ── Install rule (optional) ────────────────────────────────────────────────────
install(TARGETS memguard_demo DESTINATION bin)

# ── Status messages ────────────────────────────────────────────────────────────
message(STATUS "")
message(STATUS "══════════════════════════════════════════════════")
message(STATUS " MemGuard Vision Phase 1")
message(STATUS "  Build type   : ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ standard : C++${CMAKE_CXX_STANDARD}")
message(STATUS "  Compiler     : ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "══════════════════════════════════════════════════")
message(STATUS "")
