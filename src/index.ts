import { Plugin } from "vite";
import fs from "node:fs/promises";
import { responseInterceptor } from "http-proxy-middleware";
import { JSDOM } from "jsdom";
import http from "node:http";

interface ReactPageOnLiveOptions {
  // Target page to inject React app
  livePageOrigin: string;
  // Target element id to inject React app
  appContainerId?: string;
  // Path to main app source
  appContainerIds?: string[];
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
  // Override header
  headersOverridden?: Record<string, string>;
}

const DEFAULT_ROOT_ID = "root";

async function reactPageOnLive(
  userOptions: ReactPageOnLiveOptions
): Promise<Plugin> {
  const ignoreProxyPaths = [
    "node_modules", // node_modules/vite/dist/client/env.mjs
    "@vite", // HMR stuff
    "@react-refresh",
    "@fs",
    "src",
    "main.js",
    ...(await fs.readdir("./public")),
  ]
    .map((fileName) => `(?!/${fileName})`)
    .join("");
  const rewriteReferer = (
    proxyReq: http.ClientRequest,
    req: http.IncomingMessage
  ) => {
    if (typeof req.headers.referer === "undefined") return;
    const { protocol, host } = new URL(req.headers.referer);
    const { protocol: protocolTarget, host: hostTarget } = new URL(
      userOptions.livePageOrigin
    );
    proxyReq.setHeader(
      "referer",
      req.headers.referer
        .replace(protocol, protocolTarget)
        .replace(host, hostTarget)
    );
  };

  const overrideHeaders = (proxyReq: http.ClientRequest) => {
    if (typeof userOptions.headersOverridden !== "undefined") {
      for (const [key, value] of Object.entries(
        userOptions.headersOverridden
      )) {
        proxyReq.setHeader(key, value);
      }
    }
  };

  // INFO: Accept header for document request per browser
  // Chrome:  text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
  // Firefox: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
  // Safari:  text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
  // Edge:    text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
  const isDocumentRequest = (
    proxyRes: http.IncomingMessage,
    req: http.IncomingMessage
  ) =>
    !/text\/html/i.test(proxyRes.headers["content-type"] ?? "") ||
    !/text\/html/i.test(req.headers.accept ?? "");

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
                proxy.on("proxyReq", rewriteReferer);
                proxy.on("proxyReq", overrideHeaders);
                proxy.on(
                  "proxyRes",
                  responseInterceptor(async (responseBuffer, proxyRes, req) => {
                    if (isDocumentRequest(proxyRes, req)) {
                      return responseBuffer;
                    }

                    if (
                      typeof userOptions.ignorePathRegex !== "undefined" &&
                      typeof req.url === "string" &&
                      new RegExp(userOptions.ignorePathRegex).test(req.url)
                    ) {
                      return responseBuffer;
                    }

                    const scheme = server?.https ? "https" : "http";

                    const {
                      window: { document },
                    } = new JSDOM(responseBuffer, {
                      url: options.target as string,
                      referrer: options.target as string,
                      contentType: "text/html; charset=utf-8" as any,
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

                    [
                      userOptions.appContainerId,
                      ...(userOptions.appContainerIds ?? []),
                    ].forEach((appId) => {
                      const appRootNode = document.getElementById(
                        appId || DEFAULT_ROOT_ID
                      );

                      if (
                        (typeof appId === "undefined" ||
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
                        appId || DEFAULT_ROOT_ID;
                        targetNode.parentElement!.insertBefore(
                          appRoot,
                          targetNode.nextSibling
                        );
                      }
                    });

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
  <script type="module" src="${scheme}://${devServerHost}:${devServerPort}/main.js"></script>
</body>`
                      )
                    );
                  })
                );
              },
            },
          },
        },
      };
    },
  };
}

export default reactPageOnLive;
