// ============================================================
// presentExs — Voice Command (sisi HP / remote presenter)
// ------------------------------------------------------------
// Web Speech API (SpeechRecognition) jalan di HP: mic dekat
// mulut, dan transkrip dikirim ke PC lewat PeerJS yang sudah ada.
//
// Desain anti false-trigger (kebijakan "direct mode"):
//   - Grammar sempit (intents.js): hanya imperatif eksplisit
//   - Cooldown 1.5 dtk antar perintah yang dieksekusi
//   - Interim transcript → live subtitle (tipe 'voice'),
//     final transcript → eksekusi perintah (tipe 'cmd')
//   - Auto-restart saat recognition berhenti sendiri (silence)
//
// Fallback UI: kalau browser tidak mendukung SpeechRecognition,
// muncul tombol "🎤 Simulasi" untuk mengetik perintah — berguna
// untuk demo & pengujian tanpa mic.
// ============================================================

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createVoice({ onTranscript, onCommand, onError, onState }) {
  if (!SR) {
    onState && onState('unsupported');
    return {
      supported: false,
      start() { onError && onError(new Error('Browser tidak mendukung voice command')); },
      stop() {},
      toggle() { onError && onError(new Error('Browser tidak mendukung voice command')); },
      get active() { return false; },
    };
  }

  const rec = new SR();
  rec.lang = 'id-ID';        // prioritas Indonesia; EN sering ikut terbaca
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let wantActive = false;    // niat user ON/OFF (bedakan dgn crash auto-restart)
  let cooldownUntil = 0;
  let lastFinalText = '';
  let restartTimer = null;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const txt = r[0].transcript;
      if (r.isFinal) {
        const now = Date.now();
        // cegah hasil dobel (final event berulang utk kalimat sama)
        if (txt.trim() === lastFinalText.trim()) continue;
        lastFinalText = txt;
        onTranscript && onTranscript(txt, true);
        if (now < cooldownUntil) continue; // abaikan perintah saat cooldown
        const intent = onCommand ? onCommand(txt) : null;
        if (intent) cooldownUntil = now + 1500;
      } else {
        interim += txt;
      }
    }
    if (interim) onTranscript && onTranscript(interim, false);
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      wantActive = false;
      onState && onState('denied');
      onError && onError(new Error('Akses mic ditolak browser'));
      return;
    }
    // 'no-speech' / 'aborted' / 'network' → biarkan auto-restart menangani
    onError && onError(new Error(e.error));
  };

  rec.onend = () => {
    // Chrome mematikan recognition setelah jeda; restart bila masih aktif
    if (wantActive) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { if (wantActive) safeStart(); }, 350);
    } else {
      onState && onState('off');
    }
  };

  function safeStart() {
    try { rec.start(); onState && onState('on'); }
    catch { /* InvalidStateError: sudah jalan — abaikan */ }
  }

  return {
    supported: true,
    start() { wantActive = true; safeStart(); },
    stop() { wantActive = false; clearTimeout(restartTimer); try { rec.stop(); } catch {} },
    toggle() { wantActive ? this.stop() : this.start(); },
    get active() { return wantActive; },
  };
}
