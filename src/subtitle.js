// ============================================================
// presentExs — Subtitle / Live Caption (sisi PC / viewer)
// ------------------------------------------------------------
// Menerima transkrip suara dari HP (pesan 'voice') dan
// menampilkannya sebagai overlay di bawah slide:
//   - interim  → italic/redup, update cepat (live feel)
//   - final    → tegas, auto-fade setelah beberapa detik
//   - feedback perintah → toast "✅ Slide berikutnya"
// Region memakai aria-live="polite" (screen-reader friendly).
// ============================================================

const LABELS = {
  next:     'Slide berikutnya',
  prev:     'Slide sebelumnya',
  goto:     (p) => `Ke slide ${p}`,
  blackout: 'Layar hitam',
  present:  'Mulai presentasi',
  exit:     'Keluar / layar normal',
};

export function createSubtitle(root = document.body) {
  const wrap = document.createElement('div');
  wrap.className = 'subtitle-wrap';
  wrap.innerHTML = `
    <div class="subtitle-caption" role="status" aria-live="polite"></div>
    <div class="subtitle-feedback" aria-hidden="true"></div>
  `;
  root.appendChild(wrap);

  const captionEl  = wrap.querySelector('.subtitle-caption');
  const feedbackEl = wrap.querySelector('.subtitle-feedback');
  let fadeTimer = null;
  let fbTimer = null;

  return {
    /** Transkrip dari HP. isFinal=false → interim (italic). */
    show(text, isFinal = false) {
      if (!text) return;
      captionEl.textContent = text;
      captionEl.classList.toggle('interim', !isFinal);
      captionEl.hidden = false;
      clearTimeout(fadeTimer);
      if (isFinal) fadeTimer = setTimeout(() => { captionEl.hidden = true; }, 6000);
    },

    hide() {
      captionEl.hidden = true;
      clearTimeout(fadeTimer);
    },

    /** Konfirmasi visual perintah yang dieksekusi ("✅ ..."). */
    feedback(action, payload = {}) {
      let label = LABELS[action];
      if (typeof label === 'function') label = label(payload.page);
      if (!label) return;
      feedbackEl.textContent = `✓ ${label}`;
      feedbackEl.hidden = false;
      // restart animasi
      feedbackEl.classList.remove('pop');
      void feedbackEl.offsetWidth;
      feedbackEl.classList.add('pop');
      clearTimeout(fbTimer);
      fbTimer = setTimeout(() => { feedbackEl.hidden = true; }, 2500);
    },
  };
}
