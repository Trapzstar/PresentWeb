# presentExs

Viewer presentasi berbasis web: kontrol dari 2 device (PC presenter + HP remote),
ringan (vanilla JS + Vite MPA, tanpa framework).

## Menjalankan

```bash
npm install
npm run dev      # https://localhost:5173 (self-signed SSL — dibutuhkan untuk fullscreen/wake-lock/mic)
```

## Alur Pakai

1. **PC** — buka `/` (Viewer), drop/unggah PDF. Viewer otomatis menjadi *host* PeerJS `presentexs-<KODE>`.
2. **PC** — buka `/receiver.html` di tab lain untuk menampilkan kode room + QR (sinkron otomatis dengan Viewer via BroadcastChannel).
3. **HP** — scan QR → `/mobile.html?room=<KODE>` → remote terhubung langsung ke Viewer (WebRTC peer-to-peer).
4. Tekan **▶ Mulai Presentasi** di PC (fullscreen butuh user gesture di perangkat itu sendiri), lalu navigasi dari HP: tombol ←/→, swipe, atau perintah remote lain.

## Arsitektur (`src/`)

| File | Peran |
|---|---|
| `protocol.js` | Envelope pesan v1: `{v,type,from,payload}`; tipe: `hello`, `cmd`, `state`, `code`, `request-code` |
| `transport.js` | Abstraksi PeerJS: `host()` (retry ID-taben, multi-koneksi) & `join()` (auto-reconnect backoff) |
| `main.js` | Viewer: render PDF (pdfjs), fullscreen+wake-lock, **host remote**, publish state dua-arah |
| `receiver.js` | Halaman info sesi: QR + kode sinkron viewer, relay cadangan bila HP connect sebelum viewer siap |
| `mobile.js` | Remote HP: kirim `cmd`, render `state` (progress bar, halaman aktif), swipe, vibrate |

```
HP (mobile.html) ──WebRTC──▶ Viewer (index.html = host "presentexs-KODE")
                                   ▲ BroadcastChannel (kode/state/cmd)
                             Receiver (receiver.html = display QR + relay fallback)
```

**State dua arah:** setiap perubahan halaman/fullscreen/blackout di PC dikirim balik ke HP
(`{page,total,fullscreen,blackout}`), sehingga remote selalu mencerminkan layar sebenarnya.

## Aksi Remote yang Didukung
`next` · `prev` · `goto(page)` · `present` · `exit` · `blackout` (layar hitam saat diskusi)

## Roadmap
- [ ] Voice command (Web Speech API `id-ID` di HP → kirim transkrip sebagai `cmd`; fallback Porcupine)
- [ ] Live subtitle (reuse pipeline) voice yang sama + overlay `aria-live` di viewer
- [ ] Progressive/range PDF loading untuk file sangat besar
- [ ] Deploy HTTPS produksi (Cloudflare Tunnel / Let's Encrypt)
