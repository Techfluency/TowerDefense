/**
 * Vite configuration for the tower defense game.
 *
 * Key decisions:
 * - vite-plugin-static-copy copies assets from public/assets/ to dist/assets/
 *   because Phaser loads sprites, tilemaps, and audio at runtime via fetch URLs,
 *   not via ES module imports. Assets must exist as static files in the output.
 * - The dev server runs on port 5173 (Vite default) and is exposed to 0.0.0.0
 *   so Docker containers can forward it.
 */
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'public/assets/*',
          dest: 'assets',
        },
      ],
    }),
  ],

  server: {
    /* Bind to all interfaces so the Docker container can expose the port. */
    host: '0.0.0.0',
    port: 5173,
  },

  build: {
    /* Output to dist/ -- matches Cloudflare Pages configuration. */
    outDir: 'dist',
    sourcemap: true,

    rollupOptions: {
      output: {
        /**
         * Phaser is large (~1.5 MB minified). Splitting it into its own chunk
         * allows the browser to cache it independently from game code, which
         * changes far more frequently during development.
         */
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
