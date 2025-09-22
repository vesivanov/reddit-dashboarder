var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-YKw2cO/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// worker/worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return withCORS(new Response(null, { status: 204 }));
    }
    const url = new URL(request.url);
    if (url.pathname !== "/api") {
      return withCORS(new Response("Not Found", { status: 404 }));
    }
    const subs = (url.searchParams.get("subs") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const mode = (url.searchParams.get("mode") || "new").toLowerCase();
    const time = url.searchParams.get("time") || "day";
    const days = clampInt(url.searchParams.get("days"), 1, 7, 1);
    const limit = clampInt(url.searchParams.get("limit"), 25, 100, 100);
    const maxPages = clampInt(url.searchParams.get("max_pages"), 1, 50, 30);
    if (!subs.length) {
      return respond({ error: "Missing subs param" }, 400);
    }
    const sortedSubs = [...subs].sort();
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set("subs", sortedSubs.join(","));
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return withCORS(cached);
    }
    const cutoff = Math.floor(Date.now() / 1e3) - days * 86400;
    const results = [];
    for (const sub of subs) {
      let meta = null;
      try {
        meta = await fetchSubMeta(sub);
      } catch (metaError) {
        meta = null;
      }
      try {
        if (mode === "top") {
          const endpoint = `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limit}`;
          const json = await (await fetch(endpoint, headers())).json();
          results.push({ subreddit: sub, meta, posts: normalize(json), partial: false });
          continue;
        }
        let after = "";
        let page = 0;
        const collected = [];
        while (page < maxPages) {
          const endpoint = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limit}${after ? `&after=${after}` : ""}`;
          const response2 = await fetch(endpoint, headers());
          if (!response2.ok)
            throw new Error(`Upstream ${response2.status}`);
          const json = await response2.json();
          const posts = normalize(json);
          if (!posts.length)
            break;
          for (const post of posts) {
            if ((post.created_utc || 0) >= cutoff) {
              collected.push(post);
            }
          }
          after = json?.data?.after || null;
          page += 1;
          const oldest = posts[posts.length - 1];
          if (!after || !oldest || oldest.created_utc < cutoff)
            break;
        }
        const capped = page >= maxPages;
        let partial = false;
        if (capped && collected.length) {
          const oldest = collected[collected.length - 1];
          if ((oldest.created_utc || 0) >= cutoff)
            partial = true;
        }
        results.push({ subreddit: sub, meta, posts: collected, partial });
      } catch (error) {
        results.push({ subreddit: sub, meta, error: error.message, posts: [], partial: false });
      }
    }
    const body = JSON.stringify({
      mode,
      time,
      days,
      limit,
      max_pages: maxPages,
      results,
      fetched_at: Date.now()
    });
    const response = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=600"
      }
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withCORS(response);
  }
};
function headers() {
  return { headers: { "User-Agent": "HighlightsDashboard/4.0 (by u/yourusername)" } };
}
__name(headers, "headers");
async function fetchSubMeta(sub) {
  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`;
  const response = await fetch(endpoint, headers());
  if (!response.ok)
    throw new Error(`Meta ${response.status}`);
  const json = await response.json();
  const data = json?.data || {};
  const active = data.active_user_count ?? data.accounts_active ?? null;
  return {
    subscribers: data.subscribers ?? null,
    active_user_count: active,
    description: data.public_description ?? data.description ?? "",
    title: data.title ?? null
  };
}
__name(fetchSubMeta, "fetchSubMeta");
function normalize(data) {
  const children = data?.data?.children || [];
  return children.map((child) => {
    const post = child.data || {};
    return {
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      selftext: post.selftext || "",
      selftext_html: post.selftext_html || "",
      author: post.author,
      url: `https://www.reddit.com${post.permalink}`,
      domain: post.domain,
      score: post.score,
      num_comments: post.num_comments,
      created_utc: post.created_utc,
      thumbnail: validThumb(post.thumbnail) ? post.thumbnail : null
    };
  });
}
__name(normalize, "normalize");
function validThumb(thumbnail) {
  if (!thumbnail)
    return false;
  return !["self", "default", "nsfw", "image", "spoiler"].includes(thumbnail);
}
__name(validThumb, "validThumb");
function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value || "", 10);
  if (Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, parsed));
  }
  return fallback;
}
__name(clampInt, "clampInt");
function withCORS(resp) {
  const headers2 = new Headers(resp.headers);
  headers2.set("Access-Control-Allow-Origin", "*");
  headers2.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers2.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers: headers2 });
}
__name(withCORS, "withCORS");
function respond(obj, status = 200) {
  return withCORS(new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}
__name(respond, "respond");

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YKw2cO/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YKw2cO/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
