import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/receiver.css';
import QRCode from 'qrcode';
import Peer from 'peerjs';

const ROOM_PREFIX = 'presentexs-';

const roomCodeEl = document.getElementById('roomCode');
const qrCanvas = document.getElementById('qrCanvas');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

// ---- Generate room code 6 digit ----
const code = String(Math.floor(100000 + Math.random() * 900000));
roomCodeEl.textContent = code;
console.log('[Receiver] Room code:', code);

// ---- Generate QR ----
// URL yang akan dibuka HP
const mobileUrl = `${location.origin}/mobile.html?room=${code}`;
console.log('[Receiver] Mobile URL:', mobileUrl);

QRCode.toCanvas(qrCanvas, mobileUrl, { width: 240 }, (err) => {
  if (err) {
    console.error('[Receiver] QR error:', err);
    statusEl.textContent = '❌ Gagal generate QR';
    return;
  }
  statusEl.textContent = 'Menunggu HP scan QR...';
});

// ---- Init PeerJS ----
const peerId = ROOM_PREFIX + code;
console.log('[Receiver] Peer ID:', peerId);

const peer = new Peer(peerId, {
  debug: 2,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
});

peer.on('open', (id) => {
  console.log('[Receiver] ✓ PeerJS online:', id);
  statusEl.textContent = `✓ Siap. Menunggu HP scan...`;
});

peer.on('error', (err) => {
  console.error('[Receiver] PeerJS error:', err);
  statusEl.textContent = `❌ ${err.type}: ${err.message}`;
});

peer.on('connection', (conn) => {
  console.log('[Receiver] HP connected:', conn.peer);
  statusEl.textContent = `✓ HP terhubung: ${conn.peer}`;

  conn.on('open', () => {
    console.log('[Receiver] Connection open');
    log('HP siap kirim perintah');
  });

  conn.on('data', (data) => {
  console.log('[Receiver] Received:', data);
  log('Diterima: ' + JSON.stringify(data));

  // Teruskan ke tab viewer via BroadcastChannel
  if (data.action) {
    const bc = new BroadcastChannel('presentexs-cmd');
    bc.postMessage({ action: data.action });
    bc.close();
    console.log('[Receiver] → forwarded to viewer:', data.action);
  }
});

  conn.on('close', () => {
    console.log('[Receiver] HP disconnected');
    statusEl.textContent = 'Menunggu HP scan...';
    log('HP terputus');
  });
});

// ---- Simple log helper ----
function log(msg) {
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  logEl.textContent = line + '\n' + logEl.textContent;
}