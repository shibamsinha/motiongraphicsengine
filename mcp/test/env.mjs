import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.MGE_HOME) {
  process.env.MGE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mge-mcp-test-'));
}

export const TEST_HOME = process.env.MGE_HOME;
