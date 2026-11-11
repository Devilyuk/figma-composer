import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => mode === 'plugin' ? {
  build: {
    emptyOutDir: false,
    lib: { entry: 'src/plugin.ts', name: 'IllustrationComposer', formats: ['iife'], fileName: () => 'code.js' },
  },
} : { plugins: [vue(), viteSingleFile()] });
