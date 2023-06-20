import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import reactPageOnLive from 'vite-plugin-react-pol'

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [
      react(),
      reactPageOnLive({
        livePageOrigin: env.VITE_TARGET_ORIGIN,
        appContainerId: env.VITE_APP_CONTAINER_ID,
        ignorePathRegex: env.VITE_PROXY_IGNORE_PATHS,
        mountNextTo: env.VITE_APP_INJECT_SELECTOR,
      }),
    ],
    server:{
      https: {
        key: await fs.readFile("./certs/localhost-key.pem"),
        cert: await fs.readFile("./certs/localhost.pem"),
      }
    },
    build: {
      manifest: true,
      rollupOptions: {
        input: "src/main.tsx",
      },
    },
  };
});