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
const mismatchSessionId = '223e4567-e89b-42d3-a456-426614174000'
const secret = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-')

try {
	mkdirSync(bin)
	writeFileSync(fakeClaude, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const resumeIndex = args.indexOf('--resume')
const sessionIndex = args.indexOf('--session-id')
const effectiveSessionId = resumeIndex >= 0 ? args[resumeIndex + 1] : args[sessionIndex + 1]
fs.writeFileSync(process.env.AMP_DESIGN_CAPTURE_PATH, JSON.stringify({
  args,
  safeMarker: process.env.AMP_SAFE_MARKER,
  hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAmpToken: Boolean(process.env.AMP_TEST_TOKEN),
  hasRandomCredential: Boolean(process.env.RANDOM_CREDENTIAL),
}))
const scenario = process.env.AMP_DESIGN_TEST_SCENARIO
if (scenario === 'timeout') setInterval(() => {}, 1000)
else if (scenario === 'exit') { console.error('expected failure'); process.exit(7) }
else if (scenario === 'invalid') process.stdout.write('not json')
else if (scenario === 'output-limit') process.stdout.write('x'.repeat(5 * 1024 * 1024 + 1))
else {
  const isCode = args.includes('--json-schema')
  const isReview = args.at(-1)?.includes('Mode: review')
  process.stdout.write(JSON.stringify(isCode ? {
    type: 'result',
    result: JSON.stringify(isReview
      ? { summary: 'summary', recommendation: 'apply', confidence: 'high', findings: [], tests: [], risks: [] }
      : { summary: 'summary', answer: 'answer', confidence: 'high', citations: [], risks: [] }),
    session_id: effectiveSessionId,
  } : {
    type: 'result',
    result: 'design result ${secret}',
    session_id: scenario === 'missing-session' ? undefined : scenario === 'mismatch' ? '${mismatchSessionId}' : effectiveSessionId,
  }))
}
`)
	chmodSync(fakeClaude, 0o700)

	process.env.PATH = `${bin}:${process.env.PATH}`
	process.env.AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR = auditDir
	process.env.AMP_AGENT_TOKEN_USAGE_LOG = join(temp, 'usage.jsonl')
	process.env.AMP_DESIGN_CAPTURE_PATH = capturePath
	process.env.AMP_SAFE_MARKER = 'safe-marker'
	process.env.ANTHROPIC_API_KEY = 'must-not-reach-child'
	process.env.AMP_TEST_TOKEN = 'must-not-reach-child'
	process.env.RANDOM_CREDENTIAL = 'must-not-reach-child'

	const { default: plugin } = await import(join(root, 'amp', 'plugins', 'claude-code-subagent.ts'))
	const tools: Array<{ name: string; execute: (input: Record<string, unknown>, context: unknown) => Promise<string> }> = []
	plugin({ registerTool(tool: typeof tools[number]) { tools.push(tool) } } as never)
	const design = tools.find((tool) => tool.name === 'claude_design_subagent')
	const code = tools.find((tool) => tool.name === 'claude_code_subagent')
	assert(design, 'claude_design_subagent must register')
	assert(code, 'claude_code_subagent must remain registered')

	rmSync(capturePath, { force: true })
	const invalidSession = await invoke({ prompt: 'test', sessionId: 'not-a-uuid' }, 'invalid-session')
	assert(!invalidSession.ok, 'invalid session ID must fail')
	assert(!existsSync(capturePath), 'invalid session ID must fail before spawning Claude')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'success'
	const missingReviewDiff = await invokeCode({ mode: 'review', brief: 'test', workingDirectory: root }, 'missing-review-diff')
	assert(!missingReviewDiff.ok && String(missingReviewDiff.error).includes('requires change-set evidence'), 'review must require a change-set source')
	assert(!existsSync(capturePath), 'missing review evidence must fail before spawning Claude')
	const blankReviewDiff = await invokeCode({ mode: 'review', brief: 'test', context: '   ', workingDirectory: root }, 'blank-review-diff')
	assert(!blankReviewDiff.ok && !existsSync(capturePath), 'blank review context must fail before spawning Claude')

	const reviewWithContext = await invokeCode({ mode: 'review', brief: 'test', context: 'diff --git a/a.ts b/a.ts', workingDirectory: root }, 'review-context')
	assert(reviewWithContext.ok, 'review with a supplied textual diff must succeed')
	const contextCapture = readCapture()
	assert(!contextCapture.args.includes('--mcp-config'), 'supplied review context must not load an MCP server')
	assert(contextCapture.args.at(-1)?.includes('Use the supplied textual change set as the review scope'), 'review prompt must prioritize the supplied diff')

	const reviewWithGitDiff = await invokeCode({ mode: 'review', brief: 'test', useGitDiff: true, workingDirectory: root }, 'review-git-diff')
	assert(reviewWithGitDiff.ok, 'review with the built-in Git diff MCP tool must succeed')
	const gitDiffCapture = readCapture()
	assert(argumentValue(gitDiffCapture.args, '--tools') === 'Read,Grep,Glob,ToolSearch', 'Git diff review must expose read-only MCP tool discovery')
	const gitAllowedTools = String(argumentValue(gitDiffCapture.args, '--allowedTools'))
	for (const tool of ['git_diff', 'git_diff_refs', 'git_changed_files', 'git_file_at_ref']) {
		assert(gitAllowedTools.includes(`mcp__amp_git__${tool}`), `${tool} must be explicitly allowlisted`)
	}
	const gitDiffConfig = JSON.parse(String(argumentValue(gitDiffCapture.args, '--mcp-config'))) as { mcpServers?: { amp_git?: { env?: Record<string, string> } } }
	assert(gitDiffConfig.mcpServers?.amp_git?.env?.AMP_GIT_DIFF_REPOSITORY === root, 'Git diff MCP server must be pinned to the review working directory')
	assert(gitDiffCapture.args.at(-1)?.includes('Obtain the exact change set before reading surrounding files'), 'review prompt must obtain an exact Git diff before inspecting files')

	const semConfigPath = join(temp, 'sem-mcp.json')
	writeFileSync(semConfigPath, JSON.stringify({ mcpServers: { sem: { command: 'sem', args: ['mcp'] } } }))
	const combinedGitAndCallerMcp = await invokeCode({
		mode: 'review',
		brief: 'test',
		useGitDiff: true,
		mcpConfigPath: semConfigPath,
		workingDirectory: root,
	}, 'review-combined-mcp')
	assert(!combinedGitAndCallerMcp.ok && String(combinedGitAndCallerMcp.error).includes('cannot be combined'), 'built-in Git diff must reject caller MCP configuration')
	const reviewWithSemDiff = await invokeCode({
		mode: 'review',
		brief: 'test',
		mcpConfigPath: semConfigPath,
		allowedMcpTools: ['mcp__sem__sem_diff'],
		workingDirectory: root,
	}, 'review-sem-diff')
	assert(reviewWithSemDiff.ok, 'review with an explicitly configured semantic diff must succeed')
	assert(argumentValue(readCapture().args, '--tools') === 'Read,Grep,Glob,ToolSearch', 'semantic diff review must expose read-only MCP tool discovery')
	assert(readCapture().args.at(-1)?.includes('Semantic diff is entity-level'), 'semantic diff review prompt must retain the fidelity warning')

	const codeSuccess = await invokeCode({ mode: 'research', brief: 'test', model: 'fable', workingDirectory: root }, 'code-success')
	assert(codeSuccess.ok, 'code subagent success scenario must succeed')
	const codeCapture = readCapture()
	assert(argumentValue(codeCapture.args, '--model') === 'fable', 'code subagent must pass the Fable model alias')
	assert(argumentValue(codeCapture.args, '--setting-sources') === '', 'code subagent must disable filesystem setting sources')
	assert(codeCapture.args.includes('--strict-mcp-config'), 'code subagent must always use strict MCP isolation')
	assert(!codeCapture.args.includes('--mcp-config'), 'code subagent must not load MCP config by default')
	assert(argumentValue(codeCapture.args, '--tools') === 'Read,Grep,Glob', 'code subagent must omit ToolSearch when MCP is disabled')
	assert(codeCapture.args.includes('Bash,Edit,Write,NotebookEdit'), 'code subagent denylist must use current Claude Code tools')
	assert(!codeCapture.args.some((arg) => arg.includes('MultiEdit') || arg.includes('LS')), 'obsolete Claude Code tools must not be passed')

	const success = await invoke({
		prompt: `test ${secret}`,
		model: 'fable',
		sessionId,
		workingDirectory: root,
	}, 'success')
	assert(success.ok, 'success scenario must succeed')
	assert(success.sessionId === sessionId, 'success must return the Claude session ID')
	assert(success.rawTranscriptPath === undefined, 'raw transcript must be disabled by default')
	const capture = readCapture()
	assert(argumentValue(capture.args, '--model') === 'fable', 'design subagent must pass the Fable model alias')
	assert(capture.args.includes('--resume') && capture.args.includes(sessionId), 'valid session ID must be passed with --resume')
	assert(!capture.args.includes('--session-id'), 'resumed sessions must not also pass --session-id')
	assert(argumentValue(capture.args, '--setting-sources') === 'user', 'design must load user settings only')
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
	const freshCapture = readCapture()
	const freshSessionId = argumentValue(freshCapture.args, '--session-id')
	assert(freshSessionId && rawSuccess.sessionId === freshSessionId, 'fresh calls must preassign and return their session ID')
	assert(!freshCapture.args.includes('--resume'), 'fresh sessions must not pass --resume')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'exit'
	const exit = await invoke({ prompt: 'exit test', includeRawTranscript: true, workingDirectory: root }, 'exit')
	assert(!exit.ok && String(exit.error).includes('code 7'), 'nonzero exit must be reported')
	assert(exit.sessionId === argumentValue(readCapture().args, '--session-id'), 'nonzero exit must preserve the preassigned session ID')
	assert(existsSync(String(exit.auditLogPath)) && existsSync(String(exit.rawTranscriptPath)), 'nonzero exit must return audit and raw transcript paths')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'invalid'
	const invalidJson = await invoke({ prompt: 'invalid JSON test', includeRawTranscript: true, workingDirectory: root }, 'invalid-json')
	assert(!invalidJson.ok && String(invalidJson.error).includes('Could not parse'), 'invalid JSON must be reported')
	assert(invalidJson.sessionId === argumentValue(readCapture().args, '--session-id'), 'invalid JSON must preserve the preassigned session ID')
	assert(existsSync(String(invalidJson.auditLogPath)) && existsSync(String(invalidJson.rawTranscriptPath)), 'parse failure must return audit and raw transcript paths')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'missing-session'
	const missingSession = await invoke({ prompt: 'missing session test', workingDirectory: root }, 'missing-session')
	assert(!missingSession.ok && String(missingSession.error).includes('did not include a session ID'), 'a missing returned session ID must fail')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'mismatch'
	const mismatch = await invoke({ prompt: 'mismatch test', sessionId, workingDirectory: root }, 'mismatch')
	assert(!mismatch.ok && String(mismatch.error).includes('unexpected session ID'), 'a mismatched returned session ID must fail')
	assert(mismatch.sessionId === sessionId, 'session mismatch must preserve the expected session ID')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'output-limit'
	const outputLimit = await invoke({ prompt: 'output limit test', workingDirectory: root }, 'output-limit')
	assert(!outputLimit.ok && String(outputLimit.error).includes('5 MiB limit'), 'oversized output must fail explicitly')
	assert(outputLimit.sessionId === argumentValue(readCapture().args, '--session-id'), 'output-limit failure must preserve the preassigned session ID')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'timeout'
	const realSetTimeout = globalThis.setTimeout
	globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
		realSetTimeout(handler, timeout && timeout >= 60_000 ? 25 : timeout, ...args)
	)) as typeof setTimeout
	try {
		const timeout = await invoke({ prompt: 'timeout test', timeoutMinutes: 0.01, includeRawTranscript: true, workingDirectory: root }, 'timeout')
		assert(!timeout.ok && String(timeout.error).includes('timed out'), 'timeout must be reported')
		const timeoutAudit = JSON.parse(readFileSync(String(timeout.auditLogPath), 'utf8')) as { args: string[] }
		assert(timeout.sessionId === argumentValue(timeoutAudit.args, '--session-id'), 'timeout must preserve the preassigned session ID')
		assert(existsSync(String(timeout.auditLogPath)) && existsSync(String(timeout.rawTranscriptPath)), 'timeout must return audit and raw transcript paths')
	} finally {
		globalThis.setTimeout = realSetTimeout
	}

	console.log('Claude Design subagent regression tests passed')

	async function invoke(input: Record<string, unknown>, thread: string): Promise<Record<string, unknown>> {
		return JSON.parse(await design!.execute(input, { thread: { id: `T-${thread}` } })) as Record<string, unknown>
	}

	async function invokeCode(input: Record<string, unknown>, thread: string): Promise<Record<string, unknown>> {
		return JSON.parse(await code!.execute(input, { thread: { id: `T-${thread}` } })) as Record<string, unknown>
	}

	function readCapture(): {
		args: string[]
		safeMarker?: string
		hasAnthropicKey: boolean
		hasAmpToken: boolean
		hasRandomCredential: boolean
	} {
		return JSON.parse(readFileSync(capturePath, 'utf8'))
	}
} finally {
	rmSync(temp, { recursive: true, force: true })
}

function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message)
}

function argumentValue(args: string[], name: string): string | undefined {
	const index = args.indexOf(name)
	return index >= 0 ? args[index + 1] : undefined
}
