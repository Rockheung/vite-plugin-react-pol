import { defineConfig, loadEnv } from "vite";
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { responseInterceptor } from "http-proxy-middleware";
import { JSDOM } from "jsdom";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const ignoreProxyPaths = [
    'node_modules',
    '@vite/client',
    '@react-refresh',
    ...fs.readdirSync('.'),
    ...fs.readdirSync('./public')
  ].map((fileName) => `(?!/${fileName})`).join('');
  console.log("🚀 ~ file: vite.config.ts:13 ~ defineConfig ~ ignoreProxyPaths:", ignoreProxyPaths)
  return {
    plugins: [react()],
    server: {
      https: {
        key: fs.readFileSync("./certs/localhost-key.pem"),
        cert: fs.readFileSync("./certs/localhost.pem"),
      },
      proxy: {
        [`^${ignoreProxyPaths}.*`]: {
          target: env.VITE_TARGET_HOST,
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
              responseInterceptor(
                async (responseBuffer, proxyRes, req, res) => {
                  if (!/^text\/html/.test(proxyRes.headers["content-type"])) {
                    return responseBuffer;
                  }

                  const response = responseBuffer.toString("utf8");
                  // const dom = new JSDOM(response);
                  const warnMsg =
                    "==================== vite script injected ====================";

                  return response.replace(
                    "</body>",
                    `<script>console.warn('${warnMsg}')</script>
                <div id="root"></div>
                <script type="module">  
                  import RefreshRuntime from 'https://localhost:5173/@react-refresh'
                  RefreshRuntime.injectIntoGlobalHook(window)
                  window.$RefreshReg$ = () => {}
                  window.$RefreshSig$ = () => (type) => type
                  window.__vite_plugin_react_preamble_installed__ = true
                </script>
                <script type="module" src="https://localhost:5173/@vite/client"></script>
                <script type="module" src="https://localhost:5173/src/main.tsx"></script>
                </body>`
                  ); // manipulate response and return the result
                }
              )
            );
          },
        },
      },
    },
  };
});
