#!/usr/bin/env node
// Claude Code hook -> AI Agent Office. Forwards the hook payload from stdin
// to the local office server. Never blocks Claude and never prints anything
// (stdout of some hooks is added to Claude's context).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.env.OFFICE_URL || 'http://127.0.0.1:3334/event';
let token = '';
try {
  token = readFileSync(join(homedir(), '.ai-agent-office', 'token'), 'utf8').trim();
} catch {
  process.exit(0); // office server has never run on this machine
}

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(800),
    });
  } catch {
    /* office not running — ignore */
  }
  process.exit(0);
});
