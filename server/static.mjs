import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.weba': 'audio/webm',
  '.flac': 'audio/flac',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}));

export const contentType = (file) =>
  TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';

export const resolveWithin = (root, requestPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  if (decoded.includes('%')) return null;

  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) return null;
  if (parts.some((part) => part.includes('\\'))) return null;

  const base = path.resolve(root);
  const target = path.resolve(base, parts.join(path.sep));
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
};

export const sendFile = async (
  req,
  res,
  file,
  { download = false, cacheControl, downloadName } = {},
) => {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const name = path.basename(file);
  const headers = {
    'Content-Type': contentType(file),
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': cacheControl ?? 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (download) {
    const offered = downloadName || name;
    headers['Content-Disposition'] =
      `attachment; filename="${offered.replace(/[^\w.\-]/g, '_')}"; ` +
      `filename*=UTF-8''${encodeURIComponent(offered)}`;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return true;
  }

  res.writeHead(200, headers);
  await new Promise((resolve) => {
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      res.destroy();
      resolve();
    });
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return true;
};

export const serveDist = async (req, res, pathname, distDir) => {
  if (!fs.existsSync(distDir)) return false;

  const wanted = pathname === '/' ? '/index.html' : pathname;
  const file = resolveWithin(distDir, wanted);
  if (!file) return false;

  if (fs.existsSync(file) && (await fsp.stat(file)).isFile()) {
    const immutable = /^\/(assets|fonts)\//.test(pathname);
    return sendFile(req, res, file, {
      cacheControl: immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
  }

  if (path.extname(pathname) !== '') return false;

  const index = path.join(distDir, 'index.html');
  if (!fs.existsSync(index)) return false;
  return sendFile(req, res, index, { cacheControl: 'no-cache' });
};
