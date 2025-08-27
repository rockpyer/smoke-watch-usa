
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: ['es2020', 'chrome80', 'firefox78', 'safari14', 'edge80'],
    minify: 'esbuild',
    cssMinify: true,
  },
  esbuild: {
    target: 'es2020',
    supported: {
      'top-level-await': true,
    },
  },
}));
