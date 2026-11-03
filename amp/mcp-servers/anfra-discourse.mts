/** Run the official Discourse MCP with Chinh's 1Password-backed user key. */
import { spawn, spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';

const args = process.argv.slice(2);
if (args.length === 0) {
  const result = spawnSync('agent-secrets', [
    'run', '--bundle', 'anfra-discourse', '--', 'anfra-discourse-mcp', '--resolved',
  ], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
if (args.length !== 1 || args[0] !== '--resolved') {
  console.error('usage: anfra-discourse-mcp');
  process.exit(2);
}

const environment: NodeJS.ProcessEnv = { ...process.env };
const key = environment.DISCOURSE_USER_API_KEY;
delete environment.DISCOURSE_USER_API_KEY;
if (!key || key.startsWith('op://')) {
  console.error('anfra-discourse-mcp: resolved user API key is required');
  process.exit(1);
}
const binary = spawnSync('npx', [
  '-y', '--package', '@discourse/mcp@0.3.1', '-c', 'command -v discourse-mcp',
], { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
if (binary.status !== 0 || !binary.stdout.trim()) {
  console.error('anfra-discourse-mcp: could not resolve the official MCP binary');
  process.exit(1);
}

// Node's extra stdio streams are sockets, which readFile(profilePath) cannot
// reopen. A shell pipeline supplies a real anonymous pipe on fd 3 while fd 4
// preserves MCP stdin. The profile is never a disk file or a command argument.
const child = spawn('sh', [
  '-c', 'cat <&3 | (exec 3<&0 0<&4 4<&-; exec node "$@" --profile /dev/fd/3)',
  'anfra-discourse-profile', binary.stdout.trim(),
  '--site', 'https://community.anfra.ai', '--allow_writes',
  '--tools_mode', 'discourse_api_only', '--toolsets', 'search,topics,users',
], { env: environment, stdio: ['inherit', 'inherit', 'inherit', 'pipe', 0] });
const profile = child.stdio[3];
if (!(profile instanceof Writable)) {
  child.kill();
  throw new Error('anfra-discourse-mcp: profile pipe is unavailable');
}
profile.on('error', () => {
  console.error('anfra-discourse-mcp: profile pipe closed unexpectedly');
  child.kill();
  process.exitCode = 1;
});
profile.end(JSON.stringify({ auth_pairs: [{
  site: 'https://community.anfra.ai',
  user_api_key: key,
  user_api_client_id: 'chinh-amp-anfra',
}] }));
child.on('error', () => {
  console.error('anfra-discourse-mcp: could not start the official MCP server');
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
