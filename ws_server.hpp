/*
 * ws_server.hpp  –  Minimal WebSocket server, zero external dependencies.
 *
 * Uses raw WinSock2 on Windows (POSIX sockets on Linux/macOS).
 * Implements the full WebSocket handshake including an inline SHA-1
 * and Base64 encoder so the only system requirement is ws2_32.lib.
 *
 * Design:
 *   - One accept() loop thread.
 *   - One recv() thread per connected client (to detect disconnects).
 *   - A fixed array of up to WS_MAX_CLIENTS live sockets.
 *   - broadcast(text) sends a framed UTF-8 text message to every socket.
 *
 * Thread safety:
 *   clients_cs_ guards the clients_[] array. malloc/free are used
 *   instead of std::vector to avoid triggering our operator new overrides.
 */
#pragma once

/* -- Socket headers (winsock2 must precede windows.h) ------------------- */
#if defined(_WIN32) || defined(__WIN32__) || defined(__MINGW32__)
#ifndef _WINSOCKAPI_ /* stop windows.h from pulling in winsock.h  */
#define _WINSOCKAPI_
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#define WS_PLATFORM_WINDOWS 1
typedef CRITICAL_SECTION ws_mutex_t;
#define ws_mutex_init(m) InitializeCriticalSection(m)
#define ws_mutex_destroy(m) DeleteCriticalSection(m)
#define ws_mutex_lock(m) EnterCriticalSection(m)
#define ws_mutex_unlock(m) LeaveCriticalSection(m)
typedef HANDLE ws_thread_t;
#define WS_THREAD_FN DWORD WINAPI
#define WS_INVALID_SOCKET INVALID_SOCKET
#else
#include <netinet/in.h>
#include <pthread.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int SOCKET;
typedef pthread_mutex_t ws_mutex_t;
#define ws_mutex_init(m) pthread_mutex_init(m, NULL)
#define ws_mutex_destroy(m) pthread_mutex_destroy(m)
#define ws_mutex_lock(m) pthread_mutex_lock(m)
#define ws_mutex_unlock(m) pthread_mutex_unlock(m)
typedef pthread_t ws_thread_t;
#define WS_THREAD_FN void *
#define closesocket close
#define WS_INVALID_SOCKET (-1)
#endif

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>


/* =========================================================================
   SHA-1  (RFC 3174)  –  public domain reference implementation
   Input cap: 240 bytes (enough for the 60-byte WS key+magic concat).
   ========================================================================= */

static void ws_sha1(const uint8_t *data, size_t len, uint8_t out[20]) {
  /* Initial hash values */
  uint32_t h0 = 0x67452301u, h1 = 0xEFCDAB89u, h2 = 0x98BADCFEu;
  uint32_t h3 = 0x10325476u, h4 = 0xC3D2E1F0u;

  /* Pad the message into a stack buffer (max 128 bytes for our inputs) */
  uint8_t msg[256];
  size_t padded = ((len + 1 + 8 + 63) / 64) * 64;
  memset(msg, 0, padded);
  memcpy(msg, data, len);
  msg[len] = 0x80;

  /* 64-bit big-endian bit-length field at the very end */
  uint64_t bit_len = (uint64_t)len * 8;
  for (int i = 0; i < 8; i++)
    msg[padded - 8 + i] = (uint8_t)(bit_len >> (56 - i * 8));

  /* Process 64-byte blocks */
  for (size_t blk = 0; blk < padded; blk += 64) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++) {
      w[i] = ((uint32_t)msg[blk + i * 4] << 24) |
             ((uint32_t)msg[blk + i * 4 + 1] << 16) |
             ((uint32_t)msg[blk + i * 4 + 2] << 8) |
             ((uint32_t)msg[blk + i * 4 + 3]);
    }
    for (int i = 16; i < 80; i++) {
      uint32_t v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (v << 1) | (v >> 31);
    }

    uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
    for (int i = 0; i < 80; i++) {
      uint32_t f, k;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999u;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1u;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDCu;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6u;
      }
      uint32_t temp = ((a << 5) | (a >> 27)) + f + e + k + w[i];
      e = d;
      d = c;
      c = (b << 30) | (b >> 2);
      b = a;
      a = temp;
    }
    h0 += a;
    h1 += b;
    h2 += c;
    h3 += d;
    h4 += e;
  }

  uint32_t hs[5] = {h0, h1, h2, h3, h4};
  for (int i = 0; i < 5; i++) {
    out[i * 4 + 0] = (uint8_t)(hs[i] >> 24);
    out[i * 4 + 1] = (uint8_t)(hs[i] >> 16);
    out[i * 4 + 2] = (uint8_t)(hs[i] >> 8);
    out[i * 4 + 3] = (uint8_t)(hs[i]);
  }
}

/* =========================================================================
   Base64 encoder (RFC 4648, no line breaks)
   ========================================================================= */

static void ws_base64_encode(const uint8_t *in, size_t len, char *out) {
  static const char T[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t i = 0, j = 0;
  for (; i + 2 < len; i += 3) {
    out[j++] = T[(in[i] >> 2) & 0x3F];
    out[j++] = T[((in[i] & 3) << 4) | (in[i + 1] >> 4)];
    out[j++] = T[((in[i + 1] & 0xF) << 2) | (in[i + 2] >> 6)];
    out[j++] = T[in[i + 2] & 0x3F];
  }
  if (i < len) {
    out[j++] = T[(in[i] >> 2) & 0x3F];
    if (i + 1 < len) {
      out[j++] = T[((in[i] & 3) << 4) | (in[i + 1] >> 4)];
      out[j++] = T[(in[i + 1] & 0xF) << 2];
    } else {
      out[j++] = T[(in[i] & 3) << 4];
      out[j++] = '=';
    }
    out[j++] = '=';
  }
  out[j] = '\0';
}

/* =========================================================================
   WebSocket frame builder  (server → client, no masking)
   ========================================================================= */

/* Returns total bytes written to frame_buf.
   frame_buf must be at least text_len + 10 bytes large. */
static size_t ws_build_text_frame(const char *text, size_t text_len,
                                  uint8_t *frame_buf) {
  size_t header = 0;
  frame_buf[0] = 0x81; /* FIN=1, opcode=0x1 (text) */
  if (text_len <= 125) {
    frame_buf[1] = (uint8_t)text_len;
    header = 2;
  } else if (text_len <= 65535) {
    frame_buf[1] = 126;
    frame_buf[2] = (uint8_t)(text_len >> 8);
    frame_buf[3] = (uint8_t)(text_len & 0xFF);
    header = 4;
  } else {
    frame_buf[1] = 127;
    for (int i = 0; i < 8; i++)
      frame_buf[2 + i] = (uint8_t)(text_len >> (56 - i * 8));
    header = 10;
  }
  memcpy(frame_buf + header, text, text_len);
  return header + text_len;
}

/* =========================================================================
   HTTP header extraction helper
   ========================================================================= */

/* Finds "Header-Name: VALUE\r\n" and copies VALUE into out.
   Returns 1 on success, 0 if not found. */
static int ws_get_header(const char *req, const char *name, char *out,
                         int cap) {
  const char *p = strstr(req, name);
  if (!p)
    return 0;
  p += strlen(name);
  while (*p == ' ')
    p++;
  int i = 0;
  while (*p && *p != '\r' && *p != '\n' && i < cap - 1)
    out[i++] = *p++;
  out[i] = '\0';
  return i > 0;
}

/* =========================================================================
   WsServer
   ========================================================================= */

#define WS_MAX_CLIENTS 16
#define WS_MAGIC_STR "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

struct WsClientCtx; /* forward */

struct WsServer {

  int port_;
  SOCKET listen_sock_;
  SOCKET clients_[WS_MAX_CLIENTS];
  int num_clients_;
  ws_mutex_t clients_cs_;
  ws_thread_t accept_thread_;
  bool running_;

  WsServer(int port)
      : port_(port), listen_sock_((SOCKET)WS_INVALID_SOCKET), num_clients_(0),
        running_(false) {
    for (int i = 0; i < WS_MAX_CLIENTS; i++)
      clients_[i] = (SOCKET)WS_INVALID_SOCKET;
    ws_mutex_init(&clients_cs_);
  }

  ~WsServer() {
    stop();
    ws_mutex_destroy(&clients_cs_);
  }

  /* Start the accept loop on a background thread */
  void start() {
#ifdef WS_PLATFORM_WINDOWS
    WSADATA wd;
    WSAStartup(MAKEWORD(2, 2), &wd);
    listen_sock_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    int yes = 1;
    setsockopt(listen_sock_, SOL_SOCKET, SO_REUSEADDR, (char *)&yes,
               sizeof(yes));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((u_short)port_);
    bind(listen_sock_, (struct sockaddr *)&addr, sizeof(addr));
    listen(listen_sock_, 8);
    running_ = true;
    accept_thread_ = CreateThread(NULL, 0, _accept_loop, this, 0, NULL);
#endif
    printf("[WS] Listening on ws://localhost:%d — open the dashboard!\n",
           port_);
    fflush(stdout);
  }

  /* Cleanly shut down */
  void stop() {
    running_ = false;
    if (listen_sock_ != (SOCKET)WS_INVALID_SOCKET) {
      closesocket(listen_sock_);
      listen_sock_ = (SOCKET)WS_INVALID_SOCKET;
    }
#ifdef WS_PLATFORM_WINDOWS
    if (accept_thread_) {
      WaitForSingleObject(accept_thread_, 2000);
      CloseHandle(accept_thread_);
      accept_thread_ = NULL;
    }
    WSACleanup();
#endif
  }

  /* Broadcast a UTF-8 text message to every connected client */
  void broadcast(const char *text) {
    size_t tlen = strlen(text);
    size_t fbuf_size = tlen + 16;
    uint8_t *frame = (uint8_t *)malloc(fbuf_size);
    if (!frame)
      return;
    size_t flen = ws_build_text_frame(text, tlen, frame);

    ws_mutex_lock(&clients_cs_);
    for (int i = 0; i < WS_MAX_CLIENTS; i++) {
      if (clients_[i] == (SOCKET)WS_INVALID_SOCKET)
        continue;
      int sent = send(clients_[i], (char *)frame, (int)flen, 0);
      if (sent == -1) { /* socket error = client gone */
        closesocket(clients_[i]);
        clients_[i] = (SOCKET)WS_INVALID_SOCKET;
        num_clients_--;
      }
    }
    ws_mutex_unlock(&clients_cs_);
    free(frame);
  }

  /* ------------------------------------------------------------------ */
  /* Internal threading helpers                                          */
  /* ------------------------------------------------------------------ */

  struct ClientCtx {
    WsServer *srv;
    SOCKET sock;
  };

  static WS_THREAD_FN _accept_loop(void *arg) {
    WsServer *self = (WsServer *)arg;
    while (self->running_) {
      SOCKET c = accept(self->listen_sock_, NULL, NULL);
      if (c == (SOCKET)WS_INVALID_SOCKET)
        break;
      ClientCtx *ctx = (ClientCtx *)malloc(sizeof(ClientCtx));
      ctx->srv = self;
      ctx->sock = c;
#ifdef WS_PLATFORM_WINDOWS
      CreateThread(NULL, 0, _client_thread, ctx, 0, NULL);
#endif
    }
    return 0;
  }

  static WS_THREAD_FN _client_thread(void *arg) {
    ClientCtx *ctx = (ClientCtx *)arg;
    WsServer *self = ctx->srv;
    SOCKET sock = ctx->sock;
    free(ctx);

    /* -- HTTP upgrade handshake -- */
    char req[2048];
    int n = recv(sock, req, sizeof(req) - 1, 0);
    if (n <= 0) {
      closesocket(sock);
      return 0;
    }
    req[n] = '\0';

    char ws_key[128] = "";
    if (!ws_get_header(req, "Sec-WebSocket-Key:", ws_key, sizeof(ws_key))) {
      closesocket(sock);
      return 0;
    }

    /* Compute Sec-WebSocket-Accept = base64(sha1(key + MAGIC)) */
    char combined[200];
    snprintf(combined, sizeof(combined), "%s%s", ws_key, WS_MAGIC_STR);
    uint8_t digest[20];
    ws_sha1((uint8_t *)combined, strlen(combined), digest);
    char accept_key[64];
    ws_base64_encode(digest, 20, accept_key);

    char resp[512];
    snprintf(resp, sizeof(resp),
             "HTTP/1.1 101 Switching Protocols\r\n"
             "Upgrade: websocket\r\n"
             "Connection: Upgrade\r\n"
             "Sec-WebSocket-Accept: %s\r\n"
             "\r\n",
             accept_key);
    send(sock, resp, (int)strlen(resp), 0);

    /* Register */
    ws_mutex_lock(&self->clients_cs_);
    for (int i = 0; i < WS_MAX_CLIENTS; i++) {
      if (self->clients_[i] == (SOCKET)WS_INVALID_SOCKET) {
        self->clients_[i] = sock;
        self->num_clients_++;
        break;
      }
    }
    ws_mutex_unlock(&self->clients_cs_);
    printf("[WS] Client connected  (active=%d)\n", self->num_clients_);
    fflush(stdout);

    /* Keep-alive recv loop – detect disconnect */
    char tmp[64];
    while (self->running_ && recv(sock, tmp, sizeof(tmp), 0) > 0) {
    }

    /* Unregister */
    ws_mutex_lock(&self->clients_cs_);
    for (int i = 0; i < WS_MAX_CLIENTS; i++) {
      if (self->clients_[i] == sock) {
        closesocket(sock);
        self->clients_[i] = (SOCKET)WS_INVALID_SOCKET;
        self->num_clients_--;
        break;
      }
    }
    ws_mutex_unlock(&self->clients_cs_);
    printf("[WS] Client disconnected (active=%d)\n", self->num_clients_);
    fflush(stdout);
    return 0;
  }
};
