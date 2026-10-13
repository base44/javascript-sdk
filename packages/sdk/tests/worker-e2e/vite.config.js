import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The tanstack-template's config (apper templates/tanstack-template/vite.config.js), without the
// Base44 dev plugin, which only matters in the editor (it also provides the template's `@/` alias).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false }),
    tanstackStart({ srcDirectory: "src" }),
    react(),
  ],
  environments: {
    ssr: {
      build: {
        sourcemap: "hidden",
        rollupOptions: { output: { sourcemapExcludeSources: true } },
      },
    },
  },
});
