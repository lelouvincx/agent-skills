#!/usr/bin/env bun

import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..', '..')
const temp = mkdtempSync(join(tmpdir(), 'claude-design-subagent-test-'))
const bin = join(temp, 'bin')
const capturePath = join(temp, 'capture.json')
const auditDir = join(temp, 'audit')
const fakeClaude = join(bin, 'claude')
const sessionId = '123e4567-e89b-42d3-a456-426614174000'
const secret = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-')

try {
	mkdirSync(bin)
	writeFileSync(fakeClaude, `#!/usr/bin/env node
const fs = require('node:fs')
fs.writeFileSync(process.env.AMP_DESIGN_CAPTURE_PATH, JSON.stringify({
  args: process.argv.slice(2),
  safeMarker: process.env.AMP_SAFE_MARKER,
  hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAmpToken: Boolean(process.env.AMP_TEST_TOKEN),
  hasRandomCredential: Boolean(process.env.RANDOM_CREDENTIAL),
}))
const scenario = process.env.AMP_DESIGN_TEST_SCENARIO
if (scenario === 'timeout') setInterval(() => {}, 1000)
else if (scenario === 'exit') { console.error('expected failure'); process.exit(7) }
else if (scenario === 'invalid') process.stdout.write('not json')
else process.stdout.write(JSON.stringify({
  type: 'result',
  result: 'design result ${secret}',
  session_id: '${sessionId}',
}))
`)
	chmodSync(fakeClaude, 0o700)

	process.env.PATH = `${bin}:${process.env.PATH}`
	process.env.AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR = auditDir
	process.env.AMP_DESIGN_CAPTURE_PATH = capturePath
	process.env.AMP_SAFE_MARKER = 'safe-marker'
	process.env.ANTHROPIC_API_KEY = 'must-not-reach-child'
	process.env.AMP_TEST_TOKEN = 'must-not-reach-child'
	process.env.RANDOM_CREDENTIAL = 'must-not-reach-child'

	const { default: plugin } = await import(join(root, 'amp', 'plugins', 'claude-code-subagent.ts'))
	const tools: Array<{ name: string; execute: (input: Record<string, unknown>, context: unknown) => Promise<string> }> = []
	plugin({ registerTool(tool: typeof tools[number]) { tools.push(tool) } } as never)
	const design = tools.find((tool) => tool.name === 'claude_design_subagent')
	assert(design, 'claude_design_subagent must register')
	assert(tools.some((tool) => tool.name === 'claude_code_subagent'), 'claude_code_subagent must remain registered')

	rmSync(capturePath, { force: true })
	const invalidSession = await invoke({ prompt: 'test', sessionId: 'not-a-uuid' }, 'invalid-session')
	assert(!invalidSession.ok, 'invalid session ID must fail')
	assert(!existsSync(capturePath), 'invalid session ID must fail before spawning Claude')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'success'
	const success = await invoke({
		prompt: `test ${secret}`,
		model: 'sonnet',
		sessionId,
		workingDirectory: root,
	}, 'success')
	assert(success.ok, 'success scenario must succeed')
	assert(success.sessionId === sessionId, 'success must return the Claude session ID')
	assert(success.rawTranscriptPath === undefined, 'raw transcript must be disabled by default')
	const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as {
		args: string[]
		safeMarker?: string
		hasAnthropicKey: boolean
		hasAmpToken: boolean
		hasRandomCredential: boolean
	}
	assert(capture.args.includes('--resume') && capture.args.includes(sessionId), 'valid session ID must be passed with --resume')
	assert(capture.args.includes('Read,Grep,Glob,ToolSearch,DesignSync'), 'design built-in allowlist must be exact')
	assert(capture.args.includes('Read,Grep,Glob,ToolSearch,DesignSync,mcp__claude-design__*'), 'Claude Design MCP tools must be allowlisted')
	assert(capture.args.includes('Bash,Edit,Write,NotebookEdit'), 'local execution and edit tools must be denied')
	assert(!capture.args.includes('--mcp-config') && !capture.args.includes('--strict-mcp-config'), 'arbitrary MCP config must not load')
	assert(capture.args.at(-2) === '--', 'prompt must be separated from variadic flags')
	assert(capture.safeMarker === 'safe-marker', 'safe AMP variables should reach Claude')
	assert(!capture.hasAnthropicKey && !capture.hasAmpToken && !capture.hasRandomCredential, 'secret-looking ambient variables must be stripped')
	const audit = readFileSync(String(success.auditLogPath), 'utf8')
	assert(audit.includes('[REDACTED:API_KEY]') && !audit.includes(secret), 'normal audit must redact API-key-shaped text')

	const rawSuccess = await invoke({ prompt: 'raw test', includeRawTranscript: true, workingDirectory: root }, 'raw-success')
	assert(rawSuccess.ok && existsSync(String(rawSuccess.rawTranscriptPath)), 'opt-in raw transcript must be returned and written')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'exit'
	const exit = await invoke({ prompt: 'exit test', includeRawTranscript: true, workingDirectory: root }, 'exit')
	assert(!exit.ok && String(exit.error).includes('code 7'), 'nonzero exit must be reported')
	assert(existsSync(String(exit.auditLogPath)) && existsSync(String(exit.rawTranscriptPath)), 'nonzero exit must return audit and raw transcript paths')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'invalid'
	const invalidJson = await invoke({ prompt: 'invalid JSON test', includeRawTranscript: true, workingDirectory: root }, 'invalid-json')
	assert(!invalidJson.ok && String(invalidJson.error).includes('Could not parse'), 'invalid JSON must be reported')
	assert(existsSync(String(invalidJson.auditLogPath)) && existsSync(String(invalidJson.rawTranscriptPath)), 'parse failure must return audit and raw transcript paths')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'timeout'
	const realSetTimeout = globalThis.setTimeout
	globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
		realSetTimeout(handler, timeout && timeout >= 60_000 ? 25 : timeout, ...args)
	)) as typeof setTimeout
	try {
		const timeout = await invoke({ prompt: 'timeout test', timeoutMinutes: 0.01, includeRawTranscript: true, workingDirectory: root }, 'timeout')
		assert(!timeout.ok && String(timeout.error).includes('timed out'), 'timeout must be reported')
		assert(existsSync(String(timeout.auditLogPath)) && existsSync(String(timeout.rawTranscriptPath)), 'timeout must return audit and raw transcript paths')
	} finally {
		globalThis.setTimeout = realSetTimeout
	}

	console.log('Claude Design subagent regression tests passed')

	async function invoke(input: Record<string, unknown>, thread: string): Promise<Record<string, unknown>> {
		return JSON.parse(await design!.execute(input, { thread: { id: `T-${thread}` } })) as Record<string, unknown>
	}
} finally {
	rmSync(temp, { recursive: true, force: true })
}

function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message)
}
