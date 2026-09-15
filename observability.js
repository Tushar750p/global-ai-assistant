import crypto from 'node:crypto';

function safeRequestPath(req) {
  return typeof req.path === 'string' ? req.path.slice(0, 200) : '/';
}

export function requestLogger(req, res, next) {
  const requestId = crypto.randomUUID();
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: safeRequestPath(req),
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    };
    const output = JSON.stringify(entry);
    if (res.statusCode >= 500) console.error(output);
    else console.log(output);
  });

  next();
}
