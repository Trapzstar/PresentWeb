// ============================================================
// presentExs — Transport abstraction
// ------------------------------------------------------------
// Membungkus PeerJS di belakang interface sederhana sehingga
// fitur (voice, subtitle, remote) tidak perlu tahu soal WebRTC.
//
// Peran:
//   host(code, handlers)  → viewer/PC: claim peer "presentexs-CODE"
//                           + retry otomatis bila ID diambil orang
//   join(code, handlers)  → HP: connect ke host, auto-reconnect
//                           dengan exponential backoff
//
// Handlers yang dikenali:
//   onOpen(id), onError(err), onMessage(msg, reply),
//   onPeerJoin(id), onPeerLeave(id), onStatus(text)
// ============================================================

import Peer from 'peerjs';
import { ROOM_PREFIX, isMessage } from './protocol.js';

const ICE = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
  debug: 1,
};

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Jadi HOST (sisi PC/viewer).
 * Menangani `ID-taken` dengan kode baru (maks 4 percobaan)
 * dan melaporkan kode final via onStatus/onCodeChange.
 */
export function host(initialCode, handlers = {}) {
  const h = handlers;
  let code = initialCode || randomCode();
  let peer = null;
  let attempts = 0;
  const conns = new Map(); // peerId -> DataConnection

  function broadcast(msgFactory) {
    for (const c of conns.values()) {
      if (c.open) { try { c.send(msgFactory()); } catch {} }
    }
  }

  function start() {
    peer = new Peer(ROOM_PREFIX + code, ICE);

    peer.on('open', (id) => {
      attempts = 0;
      console.log('[transport:host] online as', id);
      h.onCodeChange && h.onCodeChange(code);
      h.onOpen && h.onOpen(id);
    });

    peer.on('connection', (conn) => {
      conns.set(conn.peer, conn);
      h.onPeerJoin && h.onPeerJoin(conn.peer);

      conn.on('open', () => {
        h.onMessage && h.onMessage(
          { v: 1, type: 'sys', from: conn.peer, payload: { event: 'connected' } },
          (msg) => conn.send(msg)
        );
      });

      conn.on('data', (raw) => {
        if (!isMessage(raw)) {
          console.warn('[transport:host] dropped malformed message', raw);
          return;
        }
        h.onMessage && h.onMessage(raw, (msg) => { if (conn.open) conn.send(msg); });
      });

      conn.on('close', () => {
        conns.delete(conn.peer);
        h.onPeerLeave && h.onPeerLeave(conn.peer);
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempts < 4) {
        attempts++;
        code = randomCode();
        console.warn(`[transport:host] ID taken, retry #${attempts} with ${code}`);
        h.onStatus && h.onStatus(`⚠ Kode dipakai, ganti ke ${code}...`);
        try { peer.destroy(); } catch {}
        setTimeout(start, 300);
        return;
      }
      h.onError && h.onError(err);
    });

    peer.on('disconnected', () => {
      h.onStatus && h.onStatus('⚠ Sinyal terputus, reconnecting...');
      try { peer.reconnect(); } catch {}
    });
  }

  start();

  return {
    get code() { return code; },
    send: broadcast,
    destroy() { try { peer && peer.destroy(); } catch {} },
  };
}

/**
 * Jadi CLIENT (sisi HP remote).
 * Auto-reconnect dengan backoff 1s→2s→4s→...→maks 10s selama
 * halaman terbuka, karena koneksi WebRTC bisa putus saat layar
 * HP tidur atau sinyal berpindah.
 */
export function join(code, handlers = {}) {
  const h = handlers;
  let peer = null;
  let conn = null;
  let retries = 0;
  let closed = false;

  function connect() {
    if (closed) return;
    peer = new Peer(ICE);

    peer.on('open', () => {
      conn = peer.connect(ROOM_PREFIX + code, { reliable: true });

      conn.on('open', () => {
        retries = 0;
        h.onOpen && h.onOpen(peer.id);
      });

      conn.on('data', (raw) => {
        if (!isMessage(raw)) return;
        h.onMessage && h.onMessage(raw, (msg) => { if (conn.open) conn.send(msg); });
      });

      conn.on('close', () => {
        h.onPeerLeave && h.onPeerLeave(ROOM_PREFIX + code);
        scheduleReconnect();
      });

      conn.on('error', (e) => h.onError && h.onError(e));
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        h.onStatus && h.onStatus('⚠ PC belum siap, mencoba lagi...');
        scheduleReconnect();
        return;
      }
      h.onError && h.onError(err);
    });
  }

  function scheduleReconnect() {
    if (closed) return;
    retries++;
    const delay = Math.min(1000 * 2 ** (retries - 1), 10000);
    h.onStatus && h.onStatus(`↻ Menyambung ulang dalam ${Math.round(delay / 1000)}s...`);
    setTimeout(() => {
      try { peer && peer.destroy(); } catch {}
      connect();
    }, delay);
  }

  connect();

  return {
    send(msg) {
      if (conn && conn.open) { try { conn.send(msg); return true; } catch {} }
      return false;
    },
    isOpen: () => !!(conn && conn.open),
    destroy() { closed = true; try { peer && peer.destroy(); } catch {} },
  };
}
