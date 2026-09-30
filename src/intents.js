// ============================================================
// presentExs — Grammar perintah suara (bilingual, id-ID prioritas)
// ------------------------------------------------------------
// Dipakai oleh voice-command.js di HP untuk memetakan hasil
// SpeechRecognition → aksi remote. Grammar sengaja sempit:
// makin sedikit kemungkinan, makin tinggi akurasi & minim
// false-trigger saat presenter bicara normal.
//
// Aturan frasa:
//   - array  = kata-kata dalam frasa, harus muncul semua (unordered)
//   - '^'    = frasa harus DIAWALI dengan kata tsb (untuk "kembali"
//              agar tidak mencocokkan "...kembali ke slide 3")
//   - angka  = digit saja; kata bilangan Indonesia (dua, tiga...)
//              dinormalisasi ke digit sebelum matching
// ============================================================

// Urutan penting: frasa multi-kata dieksekusi sebelum kata tunggal
// (mis. "dua belas" → 12 harus terjadi sebelum "dua" → 2).
const NUM_PHRASES = [
  ['dua belas', 12], ['tiga belas', 13], ['empat belas', 14], ['lima belas', 15],
  ['enam belas', 16], ['tujuh belas', 17], ['delapan belas', 18], ['sembilan belas', 19],
  ['satu', 1], ['dua', 2], ['tiga', 3], ['empat', 4], ['lima', 5],
  ['enam', 6], ['tujuh', 7], ['delapan', 8], ['sembilan', 9], ['sepuluh', 10],
  ['seuluh', 10],   // hasil speech id-ID sering memotong "sepuluh"
  ['belas', null],  // setelah pola X belas di atas, sisanya dibuang
];

/** Normalisasi transkrip: lowercase, buang tanda baca, ejaan→digit. */
export function normalizeTranscript(text) {
  let t = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // tanda baca → spasi (unicode-safe)
    .replace(/\s+/g, ' ')
    .trim();

  // Ejaan huruf per huruf (run 3+ token 1-huruf beruntun, mis.
  // "b e s o k" atau "l i d e b e r i k u t n y a") → digabung, lalu
  // dirangkul tetangga kanan agar "...slide b e r i k u t n y a" utuh.
  t = t.replace(/(?:\b[a-z] ){2,}\b[a-z]\b( \w+)?/g,
    (m, next) => m.replace(/ /g, '') + (next || ''));

  // Frasa/kata bilangan → digit
  for (const [phrase, num] of NUM_PHRASES) {
    t = t.replace(new RegExp('\\b' + phrase + '\\b', 'g'), num === null ? ' ' : String(num));
  }
  return t.replace(/\s+/g, ' ').trim();
}

const NUM = '@num'; // token khusus: "satu angka"

function isWord(w) { return typeof w === 'string'; }
function testToken(token, word) {
  if (token === NUM) return /^[0-9]+$/.test(word);
  return token === word;
}

/** Cocokkan frasa (array kata/NUM) terhadap teks ternormalisasi. */
function phraseMatch(phrase, words) {
  let from = 0;
  for (let i = 0; i < phrase.length; i++) {
    let p = phrase[i];
    let anchorStart = false;
    if (isWord(p) && p.startsWith('^')) { anchorStart = true; p = p.slice(1); }
    let idx = -1;
    for (let j = anchorStart ? 0 : from; j < words.length; j++) {
      if (testToken(p, words[j])) { idx = j; break; }
    }
    if (idx === -1) return false;
    if (anchorStart && idx !== 0) return false;
    from = idx;
  }
  return true;
}

/**
 * Intent list. Urutan = prioritas:
 * "mulai presentasi" lebih spesifik daripada "presentasi", dst.
 */
export const INTENTS = [
  { action: 'goto', phrases: [
    ['slide', NUM],
    ['ke', NUM],
    ['halaman', NUM],
    ['page', NUM],
    ['go', 'to', NUM],
    ['jump', NUM],
  ]},
  { action: 'next', phrases: [
    ['slideberikutnya'], // hasil penggabungan ejaan huruf-per-huruf
    ['slide', 'berikutnya'], ['slide', 'berikut'], ['slide', 'depan'],
    ['slide', 'lanjut'], ['lanjut'], ['terus'],
    ['next', 'slide'], ['next'], ['forward'],
    ['maju'], ['lanjur'], // toleransi salah dengar "lanjut"
  ]},
  { action: 'prev', phrases: [
    ['slide', 'sebelumnya'], ['slide', 'sebelum'], ['slide', 'belakang'],
    ['^kembali'], ['previous', 'slide'], ['previous'], ['back'],
    ['mundur'],
  ]},
  { action: 'blackout', phrases: [
    ['layar', 'hitam'], ['hitam'], ['blank'],
    ['black', 'screen'], ['blackout'],
    ['mati', 'layar'], ['gelap'],
  ]},
  { action: 'present', phrases: [
    ['mulai', 'presentasi'], ['^presentasi'], ['start', 'presentation'],
    ['^tampil'], ['ayo', '^mulai'],
  ]},
  { action: 'exit', phrases: [
    ['^keluar'], ['^akhiri'], ['^selesai'], ['^stop'],
    ['^exit'], ['^quit'], ['end', 'presentation'],
    ['layar', 'normal'],
  ]},
];

/**
 * Cari intent dalam transkrip.
 * @returns {{action:string, page?:number}|null}
 */
export function matchIntent(transcript) {
  const norm = normalizeTranscript(transcript);
  if (!norm) return null;
  const words = norm.split(' ');

  for (const intent of INTENTS) {
    for (const phrase of intent.phrases) {
      if (phraseMatch(phrase, words)) {
        if (intent.action === 'goto') {
          const n = parseInt(norm.match(/\d+/)?.[0], 10);
          if (!n || n <= 0) continue; // angka tak terbaca → coba intent lain
          return { action: 'goto', page: n };
        }
        return { action: intent.action };
      }
    }
  }
  return null;
}
