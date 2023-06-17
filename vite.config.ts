import { defineConfig } from "vite";
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { responseInterceptor } from "http-proxy-middleware";

const TARGET_HOST = "https://bluemoon100.imtest.me";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync("./certs/localhost-key.pem"),
      cert: fs.readFileSync("./certs/localhost.pem"),
    },
    proxy: {
      "^.*$": {
        target: TARGET_HOST,
        changeOrigin: true,
        cookieDomainRewrite: {
          "*": "",
        },
        selfHandleResponse: true,
        configure: (proxy, options) => {
          proxy.on("proxyReq", (proxyReq, req, res) => {
            proxyReq.setHeader("referer", options.target + "/");
          });
          proxy.on(
            "proxyRes",
            responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
              const response = responseBuffer.toString("utf8");
              return response.replace("Blue Moon", "Goodbye");
            })
          );
        },
      },
    },
  },
});
