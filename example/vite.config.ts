import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactPageOnLive from "vite-plugin-react-pol";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    reactPageOnLive({
      livePageOrigin: 'https://imtest.me',
      ignorePathRegex: ".*\\.cm\\??",
      removeTargetSelectors: 'body'
    }),
  ],
});
