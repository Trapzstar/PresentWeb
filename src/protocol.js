// ============================================================
// presentExs — Message Protocol v1
// ------------------------------------------------------------
// Semua pesan antar-device memakai envelope seragam:
//   { v: 1, type: 'hello'|'cmd'|'state', from, payload }
//
// Arah lalu lintas (topologi baru):
//   HP  --cmd-->   Viewer (peer langsung "presentexs-XXXXXX")
//   HP  --hello->  Viewer (perkenalan diri saat koneksi terbuka)
//   Viewer --state-> HP (sinkronisasi dua arah: halaman, total, dsb)
//   Receiver hanya sebagai relay cadangan bila viewer offline.
// ============================================================

export const PROTOCOL_VERSION = 1;
export const ROOM_PREFIX = 'presentexs-';
export const CMD_CHANNEL = 'presentexs-cmd'; // BroadcastChannel sesama tab

/** Buat envelope pesan. */
export function makeMessage(type, from, payload = {}) {
  return { v: PROTOCOL_VERSION, type, from, payload };
}

/** Validasi bentuk envelope. Pesan tak dikenal dibuang, bukan crash. */
export function isMessage(msg) {
  return !!msg && typeof msg === 'object' && msg.v === PROTOCOL_VERSION && typeof msg.type === 'string';
}

/** Daftar aksi remote yang dikenal viewer. */
export const ACTIONS = new Set(['next', 'prev', 'goto', 'blackout', 'present', 'exit']);

/** Payload minimal per aksi (validasi ringan di sisi penerima). */
export function isAction(a) {
  return typeof a === 'string' && ACTIONS.has(a);
}
