const START = Date.now();

const SECRET_KEYS = new Set([
  'token', 'accessToken', 'authorization', 'cookie', 'password', 'secret',
  'scenes', 'audio', 'overlay', 'fields', 'ink', 'inputProps', 'body',
  'filename_original', 'clientName',
]);

const looksAbsolute = (value) =>
  typeof value === 'string' && (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value));

const redact = (key, value) => {
  if (SECRET_KEYS.has(key)) return '[redacted]';
  if (looksAbsolute(value)) return `…/${value.split(/[\\/]/).pop()}`;
  if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
};

const line = (level, event, fields = {}) => {
  const parts = [`t=${new Date().toISOString()}`, `level=${level}`, `evt=${event}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const safe = redact(key, value);
    parts.push(`${key}=${typeof safe === 'string' && /[\s"]/.test(safe) ? JSON.stringify(safe) : safe}`);
  }
  return parts.join(' ');
};

export const log = (event, fields) => {
  console.log(line('info', event, fields));
};

export const warn = (event, fields) => {
  console.warn(line('warn', event, fields));
};

export const error = (event, fields) => {
  console.error(line('error', event, fields));
};

export const uptimeSeconds = () => Math.round((Date.now() - START) / 1000);
