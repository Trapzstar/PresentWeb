import { defineConfig } from 'vite';
// 1. Import plugin SSL di bagian atas
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // 2. Masukkan ke dalam array plugins
  plugins: [
    basicSsl()
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        receiver: 'receiver.html',
        mobile: 'mobile.html', 
      },
    },
  },
  // 3. Tambahkan konfigurasi server (Opsional, memastikan port tetap 5173)
  server: {
    port: 5173
  }
});
