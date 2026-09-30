// ============================================================
// presentExs — Receiver (halaman info & relay cadangan)
// ------------------------------------------------------------
// Perubahan arsitektur v2:
//   * Viewer (index.html) adalah HOST PeerJS "presentexs-KODE".
//   * Receiver TIDAK lagi mengklaim peer ID. Perannya:
//       1. Menampilkan kode room + QR sinkron dengan viewer
//          (via BroadcastChannel, dua arah).
//       2. Relay cadangan: bila HP terlanjur connect ke sini
//          saat viewer belum dibuka, pesan diteruskan via BC
//          dan/atau di-buffer lalu dikirim saat viewer siap.
// ============================================================

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/receiver.css';
import QRCode from 'qrcode';
import Peer from 'peerjs';
import { makeMessage, CMD_CHANNEL } from './protocol.js';

const bc = new BroadcastChannel(CMD_CHANNEL);

const roomCodeEl = document.getElementById('roomCode');
const qrCanvas   = document.getElementById('qrCanvas');
const statusEl   = document.getElementById('status');
const logEl      = document.getElementById('log');

let code = null;
let viewerOnline = false;
const pendingCmds = []; // buffer perintah HP saat viewer belum buka tab

// ---- Kode awal: dari ?room= atau acak (sebagai placeholder) ----
const urlRoom = new URLSearchParams(location.search).get('room');
setCode(/^\d{6}$/.test(urlRoom || '') ? urlRoom : String(Math.floor(100000 + Math.random() * 900000)));

function setCode(c) {
  code = c;
  roomCodeEl.textContent = c;
  const mobileUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}mobile.html?room=${c}`;
  QRCode.toCanvas(qrCanvas, mobileUrl, { width: 240 }, (err) => {
    if (err) { statusEl.textContent = '❌ Gagal generate QR'; return; }
    refreshStatus();
  });
}

function refreshStatus() {
  statusEl.textContent = viewerOnline
    ? `✓ Viewer aktif — Room ${code}. Scan QR dengan HP.`
    : `Room ${code} — buka tab Viewer (index.html) agar perintah dieksekusi.`;
}

// ---- Sinkronisasi kode dengan tab viewer ----
bc.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.from === 'receiver') return;

  if (msg.type === 'code' && msg.payload?.code) {
    viewerOnline = true;
    if (msg.payload.code !== code) setCode(msg.payload.code);
    flushPending();
    refreshStatus();
    log('Viewer online, kode disinkronkan');
  } else if (msg.type === 'state') {
    log('State viewer: halaman ' + (msg.payload.page || '-') + '/' + (msg.payload.total || '-'));
  }
};

// tanyakan kode ke viewer bila ada yang sudah terbuka
bc.postMessage(makeMessage('request-code', 'receiver'));
setTimeout(() => { if (!viewerOnline) refreshStatus(); }, 800);

// ---- Relay cadangan: terima koneksi HP bila viewer belum host ----
// (Hanya aktif bila tidak ada viewer di browser ini; begitu viewer
//  online, HP sebaiknya scan ulang QR untuk connect langsung.)
const peer = new Peer('presentexs-relay-' + Math.floor(Math.random() * 1e6), {
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  debug: 1,
});

peer.on('connection', (conn) => {
  conn.on('data', (raw) => {
    if (!raw || raw.v !== 1) return;
    log('Diterima dari HP: ' + JSON.stringify(raw.payload));
    if (raw.type === 'cmd') {
      bc.postMessage(makeMessage('cmd', 'receiver', raw.payload));
      if (!viewerOnline) pendingCmds.push(raw.payload);
    }
  });
  conn.on('close', () => log('HP terputus (mode relay)'));
});

peer.on('error', (err) => console.warn('[Receiver] relay peer error:', err.type));

function flushPending() {
  while (pendingCmds.length) {
    bc.postMessage(makeMessage('cmd', 'receiver', pendingCmds.shift()));
  }
}

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}
