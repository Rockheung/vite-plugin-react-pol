import { Plugin } from "vite";
import fs from "node:fs/promises";
import { responseInterceptor } from "http-proxy-middleware";
import { JSDOM } from "jsdom";
import http from "node:http";
import Debug from "debug";

const debug = Debug("vite-plugin-react-page-on-live");

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
  // debug mode
  debug?: boolean;
}

const DEFAULT_ROOT_ID = "root";

async function reactPageOnLive(
  userOptions: ReactPageOnLiveOptions
): Promise<Plugin> {
  if (userOptions.debug === true) {
    Debug.enable("vite-plugin-react-page-on-live");
  }
  debug("Debug enabled");

  const { protocol: protocolTarget, host: hostTarget } = new URL(
    userOptions.livePageOrigin
  );

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
    // ignore request without referer
    if (typeof req.headers.referer !== "string") return;
    const refererUrl = new URL(req.headers.referer);
    refererUrl.protocol = protocolTarget;
    refererUrl.host = hostTarget;
    debug(`Rewrite referer: ${req.headers.referer} -> ${refererUrl.href}`);
    proxyReq.setHeader("referer", refererUrl.href);
  };

  const overrideHeaders = (proxyReq: http.ClientRequest) => {
    if (typeof userOptions.headersOverridden !== "undefined") {
      for (const [key, value] of Object.entries(
        userOptions.headersOverridden
      )) {
        debug(`Override header: ${key} -> ${value}`);
        proxyReq.setHeader(key, value);
      }
    }
  };

  const isHostAddressIp = (host: string) => {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host);
  };

  // INFO: Accept header for document request per browser
  // Chrome:  text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
  // Firefox: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
  // Safari:  text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
  // Edge:    text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
  const isDocumentRequest = (
    proxyRes: http.IncomingMessage,
    req: http.IncomingMessage
  ) => {
    debug(`Check document request: ${req.url}`);
    return (
      /text\/html/i.test(proxyRes.headers["content-type"] ?? "") &&
      /text\/html/i.test(req.headers.accept ?? "")
    );
  };

  const rewriteCookieDomain = (
    proxyRes: http.IncomingMessage,
    req: http.IncomingMessage,
    res: http.ServerResponse<http.IncomingMessage>
  ) => {
    if (
      typeof req.headers.origin !== "string" ||
      typeof proxyRes.headers["set-cookie"] === "undefined"
    ) {
      return;
    }
    const { host } = new URL(req.headers.origin);
    debug(
      `Rewrite cookie domain: ${hostTarget} -> ${
        isHostAddressIp(host) ? "[Deleted]" : host
      }`
    );
    // if not https, remove secure flag, rewrite domain for cookie based session
    res.setHeader(
      "set-cookie",
      (proxyRes.headers["set-cookie"] ?? []).map((cookie) =>
        cookie
          .replace(
            / Domain=[^;]*;/gi,
            isHostAddressIp(host) ? "" : ` Domain=${host};`
          )
          .replace(/ Secure[^;]*;/gi, "")
          .replace(/ SameSite=None;/gi, "")
      )
    );

    debug(`Cookie rewrited: ${res.getHeader("set-cookie")}`);
  };

  // TODO: If userOptions.livePageOrigin's scheme is https, use server option with https.
  return {
    name: "live-page-on-live",
    config: async ({ build, server }) => {
      const entrySrc =
        typeof build?.lib === "object" && typeof build?.lib?.entry === "string"
          ? build?.lib?.entry
          : userOptions.mainAppSrc ?? "src/main.tsx";
      if (
        typeof build?.lib !== "object" ||
        typeof build?.lib?.entry !== "string"
      ) {
        console.warn(
          "You should set `entry` option when you use `build.lib` option."
        );
      }

      return {
        server: {
          proxy: {
            [`^${ignoreProxyPaths}.*`]: {
              target: userOptions.livePageOrigin,
              changeOrigin: true,
              // Not work properly
              // secure: false,
              // cookieDomainRewrite: "",
              selfHandleResponse: true,
              configure: (proxy, options) => {
                proxy.on("proxyReq", rewriteReferer);
                proxy.on("proxyReq", overrideHeaders);
                proxy.on(
                  "proxyRes",
                  responseInterceptor(
                    async (responseBuffer, proxyRes, req, res) => {
                      res.setHeader("x-pol-intercepted", "true");
                      debug(`\nIntercepted: ${req.url}`);
                      rewriteCookieDomain(proxyRes, req, res);

                      // ignore non-document request
                      if (!isDocumentRequest(proxyRes, req)) {
                        return responseBuffer;
                      }

                      if (
                        typeof userOptions.ignorePathRegex !== "undefined" &&
                        typeof req.url === "string" &&
                        new RegExp(userOptions.ignorePathRegex).test(req.url)
                      ) {
                        return responseBuffer;
                      }

                      const {
                        window: { document },
                      } = new JSDOM(responseBuffer, {
                        url: options.target as string,
                        referrer: options.target as string,
                        contentType: "text/html; charset=utf-8" as any,
                      });

                      const gcNodes =
                        typeof userOptions.removeTargetSelectors === "string"
                          ? document.querySelectorAll(
                              userOptions.removeTargetSelectors
                            )
                          : [];

                      for (const node of gcNodes) {
                        if (node) {
                          node.remove();
                        }
                      }

                      [
                        userOptions.appContainerId,
                        ...(userOptions.appContainerIds ?? []),
                      ].forEach((appId) => {
                        const appRootNode = document.getElementById(
                          appId ?? DEFAULT_ROOT_ID
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
                            userOptions.mountNextTo ?? "body > *:first-child"
                          );
                          if (targetNode === null) {
                            console.log(
                              "This request does not seem to be html request."
                            );
                            return responseBuffer;
                          }
                          const appRoot = document.createElement("div");
                          appRoot.id = appId ?? DEFAULT_ROOT_ID;
                          targetNode.parentElement!.insertBefore(
                            appRoot,
                            targetNode.nextSibling
                          );
                        }
                      });

                      const warnMsg =
                        "==================== vite script injected ====================";

                      return (
                        "<!DOCTYPE html>\n" +
                        document.documentElement.outerHTML.replace(
                          "</body>",
                          `<script>console.warn('${warnMsg}')</script>
  <script type="module">
    import RefreshRuntime from '/@react-refresh'
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
  </script>
  <script type="module" src="/@vite/client"></script>${
    entrySrc ? `<script type="module" src="/${entrySrc}"></script>` : ""
  }</body>`
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
}

export default reactPageOnLive;
