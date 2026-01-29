require('./deprecation-filter');

function buildAbsoluteUrl(req) {
  const headers = req.headers || {};
  const proto = headers['x-forwarded-proto'] || (req.connection?.encrypted ? 'https' : 'http') || 'http';
  const host = headers.host || 'localhost';
  const base = `${proto}://${host}`;
  try {
    return new URL(req.url || '/', base);
  } catch (err) {
    return new URL('/', base);
  }
}

function snapshotQueryParams(url) {
  const query = {};
  url.searchParams.forEach((value, key) => {
    if (query[key] === undefined) {
      query[key] = value;
    } else if (Array.isArray(query[key])) {
      query[key].push(value);
    } else {
      query[key] = [query[key], value];
    }
  });
  return query;
}

function parseRequest(req) {
  const url = buildAbsoluteUrl(req);
  const query = snapshotQueryParams(url);
  return { url, query };
}

function getQueryValue(query, name, fallback) {
  const value = query[name];
  if (Array.isArray(value)) {
    return value.length ? value[0] : fallback;
  }
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

module.exports = {
  parseRequest,
  getQueryValue,
};
