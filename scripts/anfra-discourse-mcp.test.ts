import { expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('launcher resolves its bundle and keeps authentication in an anonymous pipe', () => {
  const root = mkdtempSync(join(tmpdir(), 'anfra-discourse-'));
  const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim();
  const programs = {
    'agent-secrets': `
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.deepEqual(process.argv.slice(2, 6), ['run', '--bundle', 'anfra-discourse', '--']);
const child = spawnSync(process.argv[6], process.argv.slice(7), {
  env: { ...process.env, DISCOURSE_USER_API_KEY: 'fixture-user-key' }, stdio: 'inherit',
});
process.exit(child.status ?? 1);
`,
    npx: `
import assert from 'node:assert/strict';
assert(process.argv.includes('@discourse/mcp@0.3.1'));
assert(!('DISCOURSE_USER_API_KEY' in process.env));
console.log('/fixture/discourse-mcp.js');
`,
    node: `
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv;
if (args[2].endsWith('anfra-discourse.mts')) {
  const child = spawnSync(${JSON.stringify(node)}, args.slice(2), { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
assert.equal(args[2], '/fixture/discourse-mcp.js');
assert(!args.join(' ').includes('fixture-user-key'));
assert(!('DISCOURSE_USER_API_KEY' in process.env));
assert(args.includes('--allow_writes'));
assert.equal(args[args.indexOf('--site') + 1], 'https://community.anfra.ai');
assert.equal(args[args.indexOf('--tools_mode') + 1], 'discourse_api_only');
const path = args[args.indexOf('--profile') + 1];
assert(statSync(path).isFIFO());
assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).auth_pairs, [{
  site: 'https://community.anfra.ai', user_api_key: 'fixture-user-key',
  user_api_client_id: 'chinh-amp-anfra',
}]);
let input = '';
for await (const chunk of process.stdin) input += chunk.toString();
assert.equal(input, 'MCP stdin preserved');
console.log('safe launch verified');
`,
  };
  try {
    for (const [name, body] of Object.entries(programs)) {
      writeFileSync(join(root, name), `#!${node}\n${body}`, { mode: 0o700 });
    }
    const result = spawnSync(resolve('bin/anfra-discourse-mcp'), [], {
      env: {
        PATH: `${root}:${resolve('bin')}:${process.env.PATH}`,
        AMP_CONFIG_DIR: resolve('amp'),
      },
      input: 'MCP stdin preserved', encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('safe launch verified\n');
    expect(readdirSync(root).sort()).toEqual(Object.keys(programs).sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
