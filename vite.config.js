import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';

// Keep the visible product release aligned with package metadata at build and dev startup.
const packageMetadata = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.BACKEND_PORT || '3001';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageMetadata.version),
    },
    server: {
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('jspdf')) return 'vendor-jspdf';
            if (id.includes('html2canvas')) return 'vendor-html2canvas';
            if (id.includes('dompurify')) return 'vendor-dompurify';
            if (id.includes('jsbarcode')) return 'vendor-barcode';
            if (id.includes('tesseract.js')) return 'vendor-ocr';
            if (id.includes('@zxing')) return 'vendor-scanner';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          },
        },
      },
    },
  };
});
