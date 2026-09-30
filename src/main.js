import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/viewer.css';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { host } from './transport.js';
import { makeMessage, CMD_CHANNEL, isAction } from './protocol.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

// ============================================================
// TEMPLATE
// ============================================================
document.querySelector('#app').innerHTML = `
  <h1 class="app-title">presentExs</h1>

  <!-- ============ EMPTY STATE (dropzone) ============ -->
  <div class="viewer-empty" id="viewerEmpty">
    <div class="dropzone" id="dropzone" role="button" tabindex="0"
         aria-label="Unggah file PDF">
      <input type="file" id="pdfInput" class="dropzone-input" accept="application/pdf,.pdf">
      <div class="dropzone-icon">📄</div>
      <div class="dropzone-title">Drop PDF di sini</div>
      <div class="dropzone-hint">atau klik untuk memilih file dari komputer</div>
      <div class="btn-pick">📁 Pilih File</div>
    </div>

    <div class="status-bar" id="status">
      <span class="status-dot"></span>
      <span>Belum ada PDF yang dimuat</span>
    </div>
  </div>

  <!-- ============ LOADED STATE ============ -->
  <div class="viewer-loaded" id="viewerLoaded">
    <div id="controls">
      <button id="btnPrev" class="btn btn-icon" aria-label="Sebelumnya">←</button>
      <span id="pageInfo" class="badge mono">1 / 1</span>
      <button id="btnNext" class="btn btn-icon" aria-label="Berikutnya">→</button>
      <button id="btnPresent" class="btn-present">▶ Mulai Presentasi</button>
      <button id="btnChangePdf" class="btn-change-pdf" title="Ganti PDF">🔄 Ganti</button>
    </div>

    <div id="viewer">
      <canvas id="pdfCanvas"></canvas>
      <div class="blackout-overlay" id="blackoutOverlay" hidden></div>
    </div>

    <div class="status-bar ok" id="statusLoaded">
      <span class="status-dot"></span>
      <span id="statusLoadedText">PDF siap</span>
    </div>
  </div>


`;

// ============================================================
// DOM REFS
// ============================================================
const app          = document.querySelector('#app');
const dropzone     = document.getElementById('dropzone');
const input        = document.getElementById('pdfInput');


const viewer       = document.getElementById('viewer');
const canvas       = document.getElementById('pdfCanvas');
const controls     = document.getElementById('controls');
const btnPrev      = document.getElementById('btnPrev');
const btnNext      = document.getElementById('btnNext');
const pageInfo     = document.getElementById('pageInfo');
const btnPresent   = document.getElementById('btnPresent');
const btnChangePdf = document.getElementById('btnChangePdf');

const statusEl       = document.getElementById('status');
const statusTextEl   = statusEl.querySelector('span:last-child');
const statusLoaded   = document.getElementById('statusLoaded');
const statusLoadedText = document.getElementById('statusLoadedText');

// ============================================================
// STATE
// ============================================================
let currentPdf = null;
let currentPageNum = 1;
let renderTask = null;
let wakeLock = null;

// ============================================================
// UI HELPERS
// ============================================================
function setAppStatus(text, state = '') {
  statusTextEl.textContent = text;
  statusEl.className = 'status-bar' + (state ? ' ' + state : '');
}

function setLoadedStatus(text, state = 'ok') {
  statusLoadedText.textContent = text;
  statusLoaded.className = 'status-bar' + (state ? ' ' + state : '');
}

function showEmptyState() {
  app.classList.remove('has-pdf');
}

function showLoadedState() {
  app.classList.add('has-pdf');
}

// ============================================================
// PDF LOADING
// ============================================================
async function loadPdfFile(file) {
  if (!file) return;

  // Validasi tipe
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    setAppStatus('❌ Hanya file PDF yang didukung', 'err');
    dropzone.classList.add('invalid');
    setTimeout(() => dropzone.classList.remove('invalid'), 500);
    return;
  }

  // Validasi ukuran (opsional, 200MB max)
  const MAX_SIZE = 200 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    setAppStatus('❌ File terlalu besar (max 200 MB)', 'err');
    dropzone.classList.add('invalid');
    setTimeout(() => dropzone.classList.remove('invalid'), 500);
    return;
  }

  setAppStatus(`⏳ Memuat ${file.name}...`);
  dropzone.style.pointerEvents = 'none';
  dropzone.style.opacity = '0.6';

  try {
    // Destroy PDF lama
    if (currentPdf) {
      try { await currentPdf.destroy(); } catch {}
      currentPdf = null;
    }

    const arrayBuffer = await file.arrayBuffer();
    currentPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log('[presentExs] PDF loaded. Halaman:', currentPdf.numPages);

    // Update UI
    showLoadedState();
    setLoadedStatus(`✓ ${file.name} — ${currentPdf.numPages} halaman`);
    await renderPage(1);
  } catch (err) {
    console.error('[presentExs] Error:', err);
    setAppStatus(`❌ Gagal memuat: ${err.message}`, 'err');
    showEmptyState();
  } finally {
    dropzone.style.pointerEvents = '';
    dropzone.style.opacity = '';
    // Reset input value biar bisa pilih file yang sama lagi
    input.value = '';
  }
}

// ============================================================
// RENDER HALAMAN
// ============================================================
async function renderPage(num) {
  if (!currentPdf) return;
  if (num < 1 || num > currentPdf.numPages) return;

  if (renderTask) {
    try { renderTask.cancel(); } catch {}
    renderTask = null;
  }

  currentPageNum = num;
  pageInfo.textContent = `${num} / ${currentPdf.numPages}`;

  const page = await currentPdf.getPage(num);
  const naturalViewport = page.getViewport({ scale: 1.0 });

  const containerWidth = viewer.clientWidth || window.innerWidth - 40;
  const isFullscreen = !!document.fullscreenElement;
  const containerHeight = isFullscreen
    ? window.innerHeight - 20
    : window.innerHeight - 260;

  const fitScale = Math.min(
    containerWidth / naturalViewport.width,
    containerHeight / naturalViewport.height
  );

  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: fitScale * dpr });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width  = (viewport.width  / dpr) + 'px';
  canvas.style.height = (viewport.height / dpr) + 'px';

  const context = canvas.getContext('2d');
  renderTask = page.render({ canvasContext: context, viewport });

  try {
    await renderTask.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') return;
    throw err;
  } finally {
    renderTask = null;
  }

  btnPrev.disabled = num <= 1;
  btnNext.disabled = num >= currentPdf.numPages;

  // Sinkronkan HP (dipanggil via hoisting dari blok remote di bawah)
  if (typeof publishState === 'function') publishState();
}

// ============================================================
// DROPZONE — CLICK / KEYBOARD
// ============================================================
dropzone.addEventListener('click', () => input.click());

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    input.click();
  }
});

input.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadPdfFile(file);
});

// ============================================================
// DRAG & DROP — Dropzone only (no window overlay)
// ============================================================
//
// Hanya dropzone yang punya visual feedback.
// Window-level cuma untuk preventDefault supaya browser
// tidak membuka PDF saat user drop di luar dropzone.
// ============================================================

function isFileDrag(e) {
  if (!e.dataTransfer) return false;
  const types = Array.from(e.dataTransfer.types || []);
  return types.includes('Files');
}

// ---------- Dropzone handlers ----------
let dropzoneHideTimer = null;

function pingDropzone() {
  dropzone.classList.add('drag-over');
  clearTimeout(dropzoneHideTimer);
  dropzoneHideTimer = setTimeout(() => {
    dropzone.classList.remove('drag-over');
  }, 250);
}

function releaseDropzone() {
  clearTimeout(dropzoneHideTimer);
  dropzone.classList.remove('drag-over');
}

dropzone.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  pingDropzone();
});

dropzone.addEventListener('dragover', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  pingDropzone();
});

dropzone.addEventListener('dragleave', (e) => {
  if (!isFileDrag(e)) return;
  // Cek apakah benar-benar keluar dropzone
  if (!dropzone.contains(e.relatedTarget)) {
    releaseDropzone();
  }
});

dropzone.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  releaseDropzone();

  const file = e.dataTransfer.files?.[0];
  if (file) loadPdfFile(file);
});

// ============================================================
// Window-level: cegah browser buka PDF saat drop di luar dropzone
// PENTING: JANGAN tampilkan UI apapun di sini.
// dropEffect = 'none' akan menyembunyikan native drop indicator.
// ============================================================

window.addEventListener('dragover', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();

  // Kalau di dalam dropzone → biarkan (dropzone handler yang atur)
  // Kalau di luar → set 'none' biar native indicator hilang
  if (!dropzone.contains(e.target)) {
    e.dataTransfer.dropEffect = 'none';
  }
});

window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();  // cegah navigate ke file

  // Safety: kalau ada stray class, bersihkan
  releaseDropzone();
});

// Safety net: cleanup saat drag selesai / dibatalkan
window.addEventListener('dragend', releaseDropzone);
window.addEventListener('blur', releaseDropzone);

// ============================================================
// KONTROL VIEWER
// ============================================================
btnPrev.addEventListener('click', () => renderPage(currentPageNum - 1));
btnNext.addEventListener('click', () => renderPage(currentPageNum + 1));

btnChangePdf.addEventListener('click', () => {
  if (currentPdf) {
    try { currentPdf.destroy(); } catch {}
    currentPdf = null;
  }
  showEmptyState();
  setAppStatus('Pilih PDF untuk memulai');
  input.click();
});

// ============================================================
// PRESENTASI (fullscreen + wake lock)
// ============================================================
async function startPresentation() {
  if (!currentPdf) {
    setLoadedStatus('⚠ Pilih PDF dulu', 'err');
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
  } catch (err) {
    console.warn('[presentExs] Fullscreen rejected:', err);
    setLoadedStatus('⚠ Browser menolak fullscreen', 'err');
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {}
}

btnPresent.addEventListener('click', startPresentation);

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
  // Kalau tidak ada PDF, biarkan dropzone handle Enter/Space
  if (!currentPdf) return;
  if (document.activeElement === dropzone) return;

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      startPresentation();
    }
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    renderPage(currentPageNum + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    renderPage(currentPageNum - 1);
  }
});

// ============================================================
// FULLSCREEN STATE
// ============================================================
function updatePresentButton() {
  const isFs = !!document.fullscreenElement;
  btnPresent.textContent = isFs ? '⛶ Exit Fullscreen' : '▶ Mulai Presentasi';
}

document.addEventListener('fullscreenchange', () => {
  updatePresentButton();
  if (!document.fullscreenElement && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  if (currentPdf) renderPage(currentPageNum);
});

// ============================================================
// REMOTE — viewer adalah HOST PeerJS langsung
// ------------------------------------------------------------
// Topologi baru: HP → connect LANGSUNG ke peer "presentexs-KODE"
// yang diklaim oleh tab ini. Tidak ada lagi hop BroadcastChannel
// yang rapuh. Receiver hanya menampilkan info room (via BC) dan
// berfungsi sebagai relay cadangan bila viewer belum dibuka.
//
// State dua arah: setiap perubahan halaman/presentasi di PC
// di-broadcast balik ke semua HP yang terhubung.
// ============================================================

let transport = null;
let blackout = false;
const bc = new BroadcastChannel(CMD_CHANNEL); // sinkron dgn tab receiver

function remoteState() {
  return {
    page: currentPdf ? currentPageNum : 0,
    total: currentPdf ? currentPdf.numPages : 0,
    fullscreen: !!document.fullscreenElement,
    blackout,
  };
}

/** Panggil setiap kali state presenter berubah → kirim ke HP + tab lain. */
function publishState() {
  const st = remoteState();
  if (transport) transport.send(() => makeMessage('state', 'viewer', st));
  bc.postMessage({ v: 1, type: 'state', from: 'viewer', payload: st });
}

/** Eksekusi aksi remote (dipakai jalur PeerJS maupun relay receiver). */
function applyRemoteAction(action, payload = {}) {
  console.log('[Viewer] Remote action:', action, payload);

  switch (action) {
    case 'blackout':
      blackout = !blackout;
      document.getElementById('blackoutOverlay').hidden = !blackout;
      setLoadedStatus(blackout ? '⬛ Layar hitam (blacked out)' : '✓ Layar normal');
      break;
  }

  if (!currentPdf && action !== 'exit' && action !== 'blackout') {
    setLoadedStatus('⚠ Belum ada PDF di PC', 'err');
    publishState();
    return;
  }

  switch (action) {
    case 'next':    renderPage(currentPageNum + 1); break;
    case 'prev':    renderPage(currentPageNum - 1); break;
    case 'goto':    renderPage(Number(payload.page) || 1); break;
    case 'present':
      if (!document.fullscreenElement) {
        setLoadedStatus('⚠ HP minta presentasi — klik "▶ Mulai" di PC (butuh gesture user)', 'err');
      }
      break;
    case 'exit':
      blackout = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      break;
  }
  publishState();
}

function startHost(code) {
  if (transport) transport.destroy();
  transport = host(code, {
    onCodeChange: (c) => {
      // kabari tab receiver supaya QR & kode selalu sinkron
      bc.postMessage({ v: 1, type: 'code', from: 'viewer', payload: { code: c } });
    },
    onOpen: () => {
      setLoadedStatus(`✓ Remote aktif — siap menerima HP`);
      publishState();
    },
    onPeerJoin: (id) => {
      console.log('[Viewer] HP connected:', id);
      setLoadedStatus(`✓ HP terhubung (${id.slice(-4)})`);
      publishState();
    },
    onPeerLeave: () => setLoadedStatus('⚠ HP terputus, menunggu sambungan ulang...'),
    onMessage: (msg, reply) => {
      if (msg.type === 'cmd' && isAction(msg.payload.action)) {
        applyRemoteAction(msg.payload.action, msg.payload);
      } else if (msg.type === 'hello') {
        // HP memperkenalkan diri → balas dengan state terkini
        reply(makeMessage('state', 'viewer', remoteState()));
      }
    },
    onError: (err) => console.error('[Viewer] transport error:', err),
    onStatus: (t) => console.log('[Viewer] transport:', t),
  });
}

// Dukungan relay: pesan yang diteruskan tab receiver (kasus viewer
// dibuka setelah HP connect ke receiver) tetap dieksekusi di sini.
bc.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.from === 'viewer') return;
  if (msg.type === 'cmd' && isAction(msg.payload?.action)) {
    applyRemoteAction(msg.payload.action, msg.payload);
  } else if (msg.type === 'request-code') {
    // receiver baru dibuka → kirimi kode aktif kita
    bc.postMessage({ v: 1, type: 'code', from: 'viewer', payload: { code: transport ? transport.code : null } });
  }
};

// Kode awal dari ?room=XXXXXX (agar bisa "recovery": buka viewer.html?room=...
// untuk menyambung kembali sesi yang kodenya diketahui HP), selain itu acak.
const initialCode = new URLSearchParams(location.search).get('room');
startHost(/^\d{6}$/.test(initialCode || '') ? initialCode : undefined);

// Publish state saat navigasi lokal (keyboard/tombol) terjadi juga.
document.addEventListener('fullscreenchange', publishState);

// ============================================================
// INIT
// ============================================================
showEmptyState();
updatePresentButton();