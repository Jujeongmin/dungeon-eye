import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Verse8 serves the game from a sub-path; root-absolute URLs 404 there.
  base: "./",
  // Two React copies (SDK peer dep) cause "Invalid hook call"; pin one.
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: ["@agent8/gameserver", "react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: {
      ignored: ["**/.git/**", "**/node_modules/**", "**/public/assets/**", "**/art-src/**", "**/dist/**"],
    },
  },
  build: { outDir: "dist", reportCompressedSize: false, chunkSizeWarningLimit: 5000 },
});
