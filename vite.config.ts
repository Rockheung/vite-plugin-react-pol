import { defineConfig, loadEnv } from "vite";
import fs from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { responseInterceptor } from "http-proxy-middleware";
import { JSDOM } from "jsdom";



// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const ignoreProxyPaths = [
    'node_modules', // node_modules/vite/dist/client/env.mjs
    '@vite/client', // HMR stuff
    '@react-refresh', 
    'src',
    ...await fs.readdir('./public')
  ].map((fileName) => `(?!/${fileName})`).join('');
  return {
    plugins: [react()],
    server: {
      https: {
        key: await fs.readFile("./certs/localhost-key.pem"),
        cert: await fs.readFile("./certs/localhost.pem"),
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

                  if (new RegExp(env.VITE_PROXY_IGNORE_PATHS).test(req.url)) {
                    return responseBuffer;
                  }

                  const {window, window: {document}} = new JSDOM(responseBuffer, {
                    url: options.target as string,
                    referrer: options.target as string,
                  });

                  const rootNode = document.getElementById(env.VITE_CONTAINER_ID || 'root');

                  if (typeof env.VITE_CONTAINER_ID === "undefined" || rootNode === null) {
                    console.warn('You should set VITE_APP_INJECT_SELECTOR to inject vite script in .env');
                    console.warn('If this message shows multiple times, server\'s response might be malformed.');
                    console.warn('This plugin does not support html ajax response.')
                    console.warn('You have to manually ignore ajax path next with VITE_PROXY_IGNORE_PATHS env variable.')
                    console.warn('- ' + req.url);


                    const targetNode = document.querySelector(env.VITE_APP_INJECT_SELECTOR || 'body > *:first-child')
                    if (targetNode === null) {
                      console.log("This request does not seem to be html request.");
                      return responseBuffer;
                    }
                    const appRoot = document.createElement('div');
                    appRoot.id = env.VITE_CONTAINER_ID || 'root';
                    targetNode.parentElement.insertBefore(appRoot, targetNode.nextSibling);
                  }

                  const warnMsg =
                    "==================== vite script injected ====================";

                  return '<!DOCTYPE html>\n' + document.documentElement.outerHTML.replace(
                    "</body>",
                    `<script>console.warn('${warnMsg}')</script>
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
                  );
                }
              )
            );
          },
        },
      },
    },
    build: {
      manifest: true,
      rollupOptions: {
        input: 'src/main.tsc'
      }
    }
  };
});
