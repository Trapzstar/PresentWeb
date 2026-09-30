// ============================================================
// presentExs — Remote HP (client PeerJS)
// ------------------------------------------------------------
// v2: connect LANGSUNG ke viewer (host "presentexs-KODE"),
// pakai transport.join() dengan auto-reconnect backoff,
// protocol envelope v1, dan menampilkan STATE dua arah
// (halaman aktif / total / status fullscreen) dari PC.
// ============================================================

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/mobile.css';
import { join } from './transport.js';
import { makeMessage } from './protocol.js';
import { createVoice } from './voice-command.js';
import { matchIntent } from './intents.js';

const roomLabel  = document.getElementById('roomLabel');
const statusEl   = document.getElementById('status');
const controls   = document.getElementById('controls');
const btnPrev    = document.getElementById('btnPrev');
const btnNext    = document.getElementById('btnNext');
const btnPresent = document.getElementById('btnPresent');
const btnExit    = document.getElementById('btnExit');
const logEl      = document.getElementById('log');
const progressEl = document.getElementById('progress');
const slideInfoEl = document.getElementById('slideInfo');
const swipeHintEl  = document.getElementById('swipeHint');
const btnMic       = document.getElementById('btnMic');
const captionEl    = document.getElementById('caption');

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

let lastTapped = 0; // anti double-tap < 300ms

// ---- Koneksi (auto-reconnect ditangani transport.join) ----
const client = join(room, {
  onOpen: () => {
    statusEl.textContent = '✓ Terhubung ke PC';
    statusEl.className = 'status ok';
    controls.style.display = 'flex';
    if (progressEl) progressEl.hidden = false;
    log('Terhubung — mengirim hello');
    client.send(makeMessage('hello', 'phone', { ua: navigator.userAgent.slice(0, 60) }));
  },
  onMessage: (msg) => {
    if (msg.type === 'state') renderState(msg.payload);
    else if (msg.type === 'sys' && msg.payload?.event === 'connected') log('PC menyambut 👋');
  },
  onPeerLeave: () => {
    statusEl.textContent = '⚠ Terputus dari PC';
    statusEl.className = 'status err';
  },
  onStatus: (t) => { statusEl.textContent = t; statusEl.className = 'status'; },
  onError: (err) => {
    console.error('[Mobile] error:', err);
    log('Error: ' + (err.message || err.type));
  },
});

// ---- Render state dari PC ----
function renderState(st) {
  if (!st) return;
  if (st.total > 0) {
    if (slideInfoEl) slideInfoEl.textContent = `${st.page} / ${st.total}`;
    if (progressEl) {
      progressEl.hidden = false;
      progressEl.querySelector('.bar').style.width = ((st.page / st.total) * 100) + '%';
    }
  } else if (slideInfoEl) {
    slideInfoEl.textContent = 'PDF belum dimuat di PC';
  }
  btnPresent.disabled = !!st.fullscreen;
  btnExit.disabled = !st.fullscreen && !st.blackout;
  if (st.blackout) log('Layar PC di-blackout');
}

// ---- Kirim perintah ----
function send(action, extra = {}) {
  const now = Date.now();
  if (now - lastTapped < 250) return; // debounce tap ganda
  lastTapped = now;

  if (!client.isOpen()) {
    log('⚠ Belum terhubung — perintah dilewatkan');
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    return;
  }
  client.send(makeMessage('cmd', 'phone', { action, ...extra }));
  log('→ ' + action);
  if (navigator.vibrate) navigator.vibrate(15);
}

btnPrev.addEventListener('click', () => send('prev'));
btnNext.addEventListener('click', () => send('next'));
btnPresent.addEventListener('click', () => send('present'));
btnExit.addEventListener('click', () => send('exit'));

// ============================================================
// VOICE COMMAND + LIVE CAPTION (dari HP ke PC)
// ------------------------------------------------------------
// interim  → kirim sebagai 'voice' (subtitle live di layar PC)
// final    → matchIntent() → 'cmd' bila dikenali (+ vibrate),
//            tetap dikirim sbg 'voice' final biar subtitle utuh.
// ============================================================
let captionTimer = null;

function showCaption(text, isFinal) {
  if (!captionEl) return;
  captionEl.textContent = text;
  captionEl.classList.toggle('final', !!isFinal);
  captionEl.hidden = false;
  clearTimeout(captionTimer);
  if (isFinal) captionTimer = setTimeout(() => { captionEl.hidden = true; }, 4000);
}

let lastSentFinal = '';   // dedup: jangan kirim kalimat final yg sama 2x

function sendVoice(text, extra = {}) {
  if (!client.isOpen()) return;
  if (extra.final) {
    if (text.trim() === lastSentFinal.trim()) return;
    lastSentFinal = text;
  }
  client.send(makeMessage('voice', 'phone', { text, ...extra }));
}

const voice = createVoice({
  onTranscript: (text, isFinal) => {
    showCaption(text, isFinal);
    sendVoice(text, { final: isFinal });
  },
  onCommand: (text) => {
    const intent = matchIntent(text);
    if (!intent) return null;
    // kirim intent menempel di pesan 'voice' final → PC tampilkan
    // toast "✓ Slide berikutnya" SEKALI saja (cmd biasa tanpa toast)
    sendVoice(text, { final: true, intent });
    send(intent.action, intent.page ? { page: intent.page } : {});
    log(`🎤 "${text.trim()}" → ${intent.action}${intent.page ? ' p.' + intent.page : ''}`);
    if (navigator.vibrate) navigator.vibrate([30, 30, 30]); // sukses dikenali
    return intent;
  },
  onError: (err) => log('Mic: ' + err.message),
  onState: (s) => {
    btnMic.classList.toggle('recording', s === 'on');
    btnMic.setAttribute('aria-pressed', s === 'on' ? 'true' : 'false');
    btnMic.querySelector('.mic-label').textContent =
      s === 'on' ? 'Mendengarkan…' : s === 'denied' ? 'Mic ditolak' : s === 'unsupported' ? 'Tidak didukung' : 'Perintah suara';
  },
});

if (!voice.supported && btnMic) {
  btnMic.classList.add('fallback');
  btnMic.querySelector('.mic-label').textContent = 'Simulasi suara';
}

btnMic.addEventListener('click', () => {
  if (voice.supported) {
    voice.toggle();
    return;
  }
  // Fallback tanpa mic: ketik perintah (untuk demo / browser non-Chrome)
  const text = prompt('Ketik perintah (mis. "slide berikutnya", "ke slide 5", "layar hitam"):');
  if (!text) return;
  showCaption(text, true);
  const intent = matchIntent(text);
  sendVoice(text, intent ? { final: true, intent } : { final: true });
  if (intent) {
    send(intent.action, intent.page ? { page: intent.page } : {});
    log(`⌨️ "${text}" → ${intent.action}`);
  } else {
    log(`⌨️ "${text}" → (tidak dikenali)`);
  }
});

// ---- Swipe kiri/kanan untuk ganti slide ----
let touchX = null;
document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) {
    send(dx < 0 ? 'next' : 'prev');
    if (swipeHintEl) swipeHintEl.hidden = true;
  }
}, { passive: true });

// ---- Log helper ----
function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}
