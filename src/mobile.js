import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/mobile.css';
import Peer from 'peerjs';

const ROOM_PREFIX = 'presentexs-';

const roomLabel = document.getElementById('roomLabel');
const statusEl = document.getElementById('status');
const controls = document.getElementById('controls');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnPresent = document.getElementById('btnPresent');
const btnExit = document.getElementById('btnExit');
const logEl = document.getElementById('log');

// ---- Baca room code dari URL ----
const params = new URLSearchParams(location.search);
const room = params.get('room');

if (!room || !/^\d{6}$/.test(room)) {
  statusEl.textContent = '❌ Kode room tidak valid. Buka dari QR atau tambahkan ?room=XXXXXX';
  statusEl.classList.add('err');
  throw new Error('Invalid room');
}

roomLabel.textContent = room;
console.log('[Mobile] Room:', room);

// ---- Init PeerJS ----
const peer = new Peer({
  debug: 2,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
});

let conn = null;

peer.on('open', (id) => {
  console.log('[Mobile] ✓ PeerJS online. My ID:', id);
  statusEl.textContent = 'Menghubungkan ke PC...';

  conn = peer.connect(ROOM_PREFIX + room, { reliable: true });

  conn.on('open', () => {
    console.log('[Mobile] ✓ Connected to PC');
    statusEl.textContent = '✓ Terhubung';
    statusEl.classList.add('ok');
    controls.style.display = 'flex';
    log('Terhubung ke PC');
  });

  conn.on('data', (data) => {
    console.log('[Mobile] Received:', data);
    if (data.type === 'hello') {
      log('PC siap menerima perintah');
    }
  });

  conn.on('close', () => {
    console.log('[Mobile] Connection closed');
    statusEl.textContent = '⚠ Koneksi terputus';
    statusEl.classList.remove('ok');
    statusEl.classList.add('err');
    controls.style.display = 'none';
  });

  conn.on('error', (err) => {
    console.error('[Mobile] Connection error:', err);
    log('Error: ' + err.message);
  });
});

peer.on('error', (err) => {
  console.error('[Mobile] PeerJS error:', err);
  if (err.type === 'peer-unavailable') {
    statusEl.textContent = '❌ PC tidak ditemukan. Cek kode room.';
  } else {
    statusEl.textContent = `❌ ${err.type}: ${err.message}`;
  }
  statusEl.classList.add('err');
});

// ---- Kirim perintah ----
function send(action) {
  if (!conn || !conn.open) {
    log('⚠ Belum terhubung');
    return;
  }
  conn.send({ action });
  console.log('[Mobile] Sent:', action);
  log('→ ' + action);
  if (navigator.vibrate) navigator.vibrate(20);
}

// ---- Event handlers ----
btnPrev.addEventListener('click', () => send('prev'));
btnNext.addEventListener('click', () => send('next'));
btnPresent.addEventListener('click', () => send('present'));
btnExit.addEventListener('click', () => send('exit'));

// ---- Log helper ----
function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}