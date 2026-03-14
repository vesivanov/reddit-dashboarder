async function invokeHandler(handler, req) {
  const headers = {};
  let body;
  let statusCode = 200;

  const resMock = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    end(payload) {
      body = payload;
      return this;
    },
  };

  await handler(req, resMock);
  return { statusCode, headers, body };
}

function buildPassthroughReq(req, {
  method = 'GET',
  url,
  body,
} = {}) {
  const passthroughReq = Object.create(req || null);
  passthroughReq.method = method;
  passthroughReq.headers = req?.headers || {};
  passthroughReq.connection = req?.connection;
  passthroughReq.socket = req?.socket;
  passthroughReq.url = url || req?.url || '/';
  passthroughReq.originalUrl = passthroughReq.url;
  if (body !== undefined) {
    passthroughReq.body = body;
  }
  return passthroughReq;
}

module.exports = {
  invokeHandler,
  buildPassthroughReq,
};
