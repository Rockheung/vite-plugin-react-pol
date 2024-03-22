import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactPageOnLive from "vite-plugin-react-pol";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    reactPageOnLive({
      livePageOrigin: 'https://www.google.com',
      forceMount: true,
      appContainerId: 'root'
    }),
  ],
  build: {
    lib: {
      entry: "src/main.tsx",
    }
  }
});
