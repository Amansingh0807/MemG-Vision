/*
 * ws_broadcaster.hpp
 *
 * Thin singleton wrapper that:
 *   1. Owns the single WsServer instance.
 *   2. Provides the mg_ws_broadcast_handler() callback that emit_json fires.
 *   3. Exposes mg_start_ws_server(port) for main() to call.
 *
 * Include this BEFORE memguard.hpp (or let main_demo.cpp include it first)
 * so that winsock2.h is pulled in before windows.h.
 */
#pragma once

#include "memguard.hpp"  /* for g_mg_broadcast_fn typedef */
#include "ws_server.hpp" /* brings in winsock2.h + windows.h in correct order */

/* The single live server instance (NULL until mg_start_ws_server is called) */
static WsServer *g_ws_server = NULL;

/* Callback registered in g_mg_broadcast_fn – called by emit_json */
static void mg_ws_broadcast_handler(const char *json_text) {
  if (g_ws_server)
    g_ws_server->broadcast(json_text);
}

/*
 * mg_start_ws_server(port)
 * -------------------------
 * Call this once at the start of main() before running any allocations you
 * want to stream.  Creates the server, starts the accept thread, and hooks
 * the broadcast callback into the MemoryTracker event pipeline.
 *
 * The WsServer object lives in static storage for the lifetime of the process.
 */
inline void mg_start_ws_server(int port) {
  static WsServer server(port);
  g_ws_server = &server;
  server.start();
  g_mg_broadcast_fn = mg_ws_broadcast_handler;

  if (!g_mg_log_file) {
    g_mg_log_file = fopen("memguard_history.jsonl", "a");
  }
}
