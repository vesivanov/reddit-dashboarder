const { URL } = require('url');

function normalizeHeaders(headers = {}) {
  const out = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    out[key.toLowerCase()] = value;
  });
  return out;
}

function parseQuery(url) {
  const parsed = new URL(url, 'http://localhost');
  const query = {};
  parsed.searchParams.forEach((value, key) => {
    if (query[key] === undefined) {
      query[key] = value;
    } else if (Array.isArray(query[key])) {
      query[key].push(value);
    } else {
      query[key] = [query[key], value];
    }
  });
  return { query, pathname: parsed.pathname + parsed.search };
}

function createMockRequest({ method = 'GET', url = '/', headers = {}, body, query, params, cookies = '', secure = false } = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  if (cookies && !normalizedHeaders.cookie) {
    normalizedHeaders.cookie = cookies;
  }
  if (!normalizedHeaders.host) {
    normalizedHeaders.host = 'localhost:3000';
  }

  const { query: parsedQuery, pathname } = parseQuery(url);

  const req = {
    method,
    url: pathname,
    originalUrl: pathname,
    headers: normalizedHeaders,
    body,
    query: query || parsedQuery,
    params: params || {},
    connection: { encrypted: secure },
    socket: { encrypted: secure },
    secure,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
    header(name) {
      return this.get(name);
    },
  };

  return req;
}

function createMockResponse() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    finished: false,
    locals: {},
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      res.finished = true;
      return res;
    },
    send(payload) {
      res.body = payload;
      res.finished = true;
      return res;
    },
    redirect(location) {
      if (res.statusCode < 300 || res.statusCode >= 400) {
        res.statusCode = 302;
      }
      headers.location = location;
      res.finished = true;
      return res;
    },
    end(payload) {
      if (payload !== undefined) {
        res.body = payload;
      }
      res.finished = true;
      return res;
    },
  };
  res.set = res.setHeader;
  res.get = res.getHeader;
  return { res, headers };
}

async function runHandler(handler, options = {}) {
  const req = createMockRequest(options);
  const { res, headers } = createMockResponse();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body,
    headers,
    raw: res,
    request: req,
  };
}

module.exports = { runHandler, createMockRequest, createMockResponse };
