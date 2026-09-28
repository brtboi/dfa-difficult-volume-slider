import { defineConfig } from 'vite';

export default defineConfig({
  // 'mpa' disables the SPA index.html fallback, so a missing asset returns a
  // real 404. BootScene and VolumeController rely on that to detect absent
  // files and substitute placeholders.
  appType: 'mpa',
  server: { open: true },
  build: { target: 'es2022' },
});
