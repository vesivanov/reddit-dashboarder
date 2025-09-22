var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-wQgKdZ/strip-cf-connecting-ip-header.js
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

// worker.js
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
__name(sleep, "sleep");
async function fetchJSON(url, { tries = 3, baseDelay = 400 } = {}) {
  let attempt = 0, lastErr;
  while (attempt < tries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1e4);
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      if (res.status === 429) {
        throw new Error(`Rate limited by Reddit: ${text.slice(0, 120)}`);
      }
      if (!res.ok)
        throw new Error(`Upstream ${res.status}: ${text.slice(0, 120)}`);
      if (text.includes("Too Many Requests") || text.includes("<!doctype html>")) {
        throw new Error("Reddit is rate limiting requests. Please wait a few minutes and try again. Consider using Reddit OAuth for higher limits.");
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON body");
      }
    } catch (e) {
      lastErr = e;
      attempt++;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 250;
      await sleep(delay);
    }
  }
  throw lastErr || new Error("fetchJSON failed");
}
__name(fetchJSON, "fetchJSON");
async function runWithConcurrency(tasks, limit = 3) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = await tasks[i]();
      } catch (e) {
        results[i] = { error: e.message };
      }
    }
  }
  __name(worker, "worker");
  const pool = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(pool);
  return results;
}
__name(runWithConcurrency, "runWithConcurrency");
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
    const maxPages = clampInt(url.searchParams.get("max_pages"), 1, 10, 5);
    if (!subs.length) {
      return respond({ error: "Missing subs param" }, 400);
    }
    const sortedSubs = [...subs].sort();
    const cutoff = Math.floor(Date.now() / 1e3) - days * 86400;
    const tasks = subs.map((sub) => async () => {
      try {
        const about = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`);
        const meta = about?.data ? {
          subscribers: about.data.subscribers || null,
          active_user_count: about.data.active_user_count || about.data.accounts_active || null,
          title: about.data.title || null,
          icon_img: about.data.icon_img || null,
          description: about.data.public_description || about.data.description || ""
        } : null;
        if (mode === "top") {
          const top = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limit}&raw_json=1`);
          return { subreddit: sub, meta, posts: normalize(top), partial: false };
        }
        let after = "";
        let page = 0;
        const collected = [];
        while (page < maxPages) {
          const ep = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limit}${after ? `&after=${after}` : ""}&raw_json=1`;
          const json = await fetchJSON(ep);
          const posts = normalize(json);
          if (!posts.length)
            break;
          for (const p of posts)
            if ((p.created_utc || 0) >= cutoff)
              collected.push(p);
          after = json?.data?.after || "";
          page += 1;
          const oldest = posts[posts.length - 1];
          if (!after || !oldest || oldest.created_utc < cutoff)
            break;
          await sleep(250 + Math.random() * 250);
        }
        const capped = page >= maxPages;
        let partial = false;
        if (capped && collected.length) {
          const oldest = collected[collected.length - 1];
          if ((oldest.created_utc || 0) >= cutoff)
            partial = true;
        }
        return { subreddit: sub, meta, posts: collected, partial };
      } catch (e) {
        return { subreddit: sub, error: e.message, posts: [], partial: false };
      }
    });
    const perSubResults = await runWithConcurrency(tasks, 3);
    const results = perSubResults;
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
    return withCORS(response);
  }
};
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
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers });
}
__name(withCORS, "withCORS");
function respond(obj, status = 200) {
  return withCORS(new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}
__name(respond, "respond");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
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

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
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

// .wrangler/tmp/bundle-wQgKdZ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
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

// .wrangler/tmp/bundle-wQgKdZ/middleware-loader.entry.ts
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
