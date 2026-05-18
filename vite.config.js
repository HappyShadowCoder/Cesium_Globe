import { defineConfig } from 'vite';
import { svelte }       from '@sveltejs/vite-plugin-svelte';
import cesium           from 'vite-plugin-cesium'; // copies Cesium assets, no token needed

export default defineConfig({
  plugins: [svelte(), cesium()],
  build: { target: 'esnext' },
});
