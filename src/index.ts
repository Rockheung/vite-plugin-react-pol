import { Plugin } from "vite";
import fs from "node:fs/promises";
import { responseInterceptor } from "http-proxy-middleware";
import { JSDOM } from "jsdom";

interface ReactPageOnLiveOptions {
  // Target page to inject React app
  livePageOrigin: string;
  // Target element id to inject React app
  appContainerId?: string;
  // Path to main app source
  mainAppSrc?: string;
  // Path to mount React app
  mountNextTo?: string;
  // Regex to ignore request path
  ignorePathRegex?: string;
  // Vite dev server host
  viteDevServerHost?: string;
  // Vite dev server port
  viteDevServerPort?: number;
  // Force mount React app even if appContainerId is not found
  forceMount?: boolean;
  // CSS selector to ignore
  removeTargetSelectors?: string;
}

const DEFAULT_ROOT_ID = "root";
const DEFAULT_MAIN_APP_SRC = "src/main.tsx";


async function reactPageOnLive(userOptions: ReactPageOnLiveOptions): Promise<Plugin> {
  const ignoreProxyPaths = [
    "node_modules", // node_modules/vite/dist/client/env.mjs
    "@vite/client", // HMR stuff
    "@react-refresh",
    "src",
    ...(await fs.readdir("./public")),
  ]
    .map((fileName) => `(?!/${fileName})`)
    .join("");

    // TODO: If userOptions.livePageOrigin's scheme is https, use server option with https.
  return {
    name: "live-page-on-live",
    config: async ({ build, server }) => {
      return {
        server: {
          proxy: {
            [`^${ignoreProxyPaths}.*`]: {
              target: userOptions.livePageOrigin,
              changeOrigin: true,
              cookieDomainRewrite: {
                "*": "",
              },
              selfHandleResponse: true,
              configure: (proxy, options) => {
                proxy.on("proxyReq", (proxyReq, req) => {
                  if (typeof req.headers.referer === 'undefined') return;
                  const refererPathname = new URL(req.headers.referer || options.target as string).pathname;
                  proxyReq.setHeader("referer", options.target + refererPathname);
                });
                proxy.on(
                  "proxyRes",
                  responseInterceptor(
                    async (responseBuffer, proxyRes, req) => {
                      if (
                        typeof proxyRes.headers['content-type'] !==
                          'undefined' &&
                        !/^text\/html/.test(proxyRes.headers['content-type'])
                      ) {
                        return responseBuffer
                      }

                      if (
                        typeof userOptions.ignorePathRegex !== 'undefined' &&
                        typeof req.url === 'string' &&
                        new RegExp(userOptions.ignorePathRegex).test(req.url)
                      ) {
                        return responseBuffer
                      }

                      const scheme = server?.https ? "https" : "http";

                      const {
                        window: { document },
                      } = new JSDOM(responseBuffer, {
                        url: options.target as string,
                        referrer: options.target as string,
                        contentType: "text/html; charset=utf-8" as any
                      });

                      const targetNodes =
                        typeof userOptions.removeTargetSelectors === "string"
                          ? document.querySelectorAll(
                              userOptions.removeTargetSelectors
                            )
                          : [];

                      for (const dom of targetNodes) {
                        if (dom) {
                          dom.remove();
                        }
                      }

                      const appRootNode = document.getElementById(
                        userOptions.appContainerId || DEFAULT_ROOT_ID
                      );

                      if (
                        (typeof userOptions.appContainerId === "undefined" ||
                          appRootNode === null) &&
                        userOptions.forceMount === true
                      ) {
                        console.warn(
                          "You should set `appContainerId` option to inject React app or default is " +
                            DEFAULT_ROOT_ID
                        );
                        console.warn(
                          "If this message shows multiple times, server's response might be malformed."
                        );
                        console.warn(
                          "This plugin does not support html ajax response."
                        );
                        console.warn(
                          "You may need to manually ignore next ajax path with ignorePathRegex option."
                        );
                        console.warn("- " + req.url);

                        const targetNode = document.querySelector(
                          userOptions.mountNextTo || "body > *:first-child"
                        );
                        if (targetNode === null) {
                          console.log(
                            "This request does not seem to be html request."
                          );
                          return responseBuffer;
                        }
                        const appRoot = document.createElement("div");
                        appRoot.id =
                          userOptions.appContainerId || DEFAULT_ROOT_ID;
                        targetNode.parentElement!.insertBefore(
                          appRoot,
                          targetNode.nextSibling
                        );
                      }
                      
                      const warnMsg =
                        "==================== vite script injected ====================";
                      const devServerHost =
                        userOptions.viteDevServerHost ||
                        // based on vite server option
                        server?.host === true
                          ? "0.0.0.0"
                          : server?.host || "localhost";
                      const devServerPort =
                        userOptions.viteDevServerPort || server?.port || 5173;

                      return (
                        "<!DOCTYPE html>\n" +
                        document.documentElement.outerHTML.replace(
                          "</body>",
                          `<script>console.warn('${warnMsg}')</script>
  <script type="module">  
    import RefreshRuntime from '${scheme}://${devServerHost}:${devServerPort}/@react-refresh'
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
  </script>
  <script type="module" src="${scheme}://${devServerHost}:${devServerPort}/@vite/client"></script>
  <script type="module">
    const container = document.getElementById('${
      userOptions.appContainerId || DEFAULT_ROOT_ID
    }');
    if (container instanceof HTMLElement) {
      import("/${
        build?.rollupOptions?.input || userOptions.mainAppSrc || DEFAULT_MAIN_APP_SRC
      }").catch(console.error);
    } else {
      console.error('Container element not found: ', '${
        userOptions.appContainerId || DEFAULT_ROOT_ID
      }');
    }
  </script>
</body>`
                        )
                      );
                    }
                  )
                );
              },
            },
          },
        },
      };
    },
  };
};

export default reactPageOnLive;