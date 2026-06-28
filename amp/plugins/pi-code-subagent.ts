// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// pi-code-subagent — invokes Pi Coding Agent as a manual, read-only advisor
// from Amp. Pi must not edit files; it returns structured JSON with advice,
// review findings, or a proposed unified diff. Amp remains responsible for
// applying/adapting changes and verification.

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { PluginAPI } from '@ampcode/plugin'

type Mode = 'patch' | 'review' | 'research'
type Confidence = 'low' | 'medium' | 'high'
type Thinking = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

interface ToolInput {
	mode: Mode
	brief: string
	context?: string
	provider: string
	model: string
	thinking: Thinking
	timeoutMinutes: number
	workingDirectory: string
	includeRawTranscript: boolean
}

interface PiRunResult {
	exitCode: number | null
	stdout: string
	stderr: string
	timedOut: boolean
}

interface TokenUsage {
	inputTokens: number
	outputTokens: number
	cacheCreationInputTokens: number
	cacheReadInputTokens: number
	totalTokens: number
}

const DEFAULT_TIMEOUT_MINUTES = 10
const MAX_TIMEOUT_MINUTES = 30
const DEFAULT_PROVIDER = 'deepseek'
const DEFAULT_MODEL = 'deepseek-v4-pro'
const DEFAULT_THINKING: Thinking = 'high'
const AUDIT_DIR = process.env.AMP_PI_CODE_SUBAGENT_AUDIT_DIR ?? join(homedir(), '.config', 'amp', 'logs', 'pi-code-subagent')
const TOKEN_USAGE_LOG_PATH = process.env.AMP_AGENT_TOKEN_USAGE_LOG ?? join(homedir(), '.config', 'amp', 'logs', 'agent-token-usage.jsonl')
const SUBAGENT_ENV_FILE = process.env.AMP_PI_CODE_SUBAGENT_ENV_FILE

const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls']
const MAX_PROMPT_BYTES = 500_000
const SAFE_ENV_KEYS = ['HOME', 'PATH', 'SHELL', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']
const SAFE_ENV_PREFIXES = ['AMP_', 'HERDR_']
const SECRET_ENV_NAME_RE = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|BEARER)/i

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'pi_code_subagent',
		description: [
			'Use Pi Coding Agent (pi.dev) as a manual, read-only advisor.',
			'Call this tool ONLY when the user explicitly mentions Pi, pi.dev, or Pi Coding Agent.',
			'Pi must not edit files: its toolkit is limited to read-only operations (read, grep, find, ls — equivalent to Claude Read, Grep, Glob, LS). Extensions, skills, prompt templates, themes, context files, and session persistence are disabled; output is structured JSON only.',
			'Default model is DeepSeek V4 Pro via --provider deepseek --model deepseek-v4-pro.',
			'Use mode=review for reviewing a diff/implementation, mode=patch for a small-to-medium patch proposal, and mode=research for read-only investigation.',
			'Pass a pre-processed summary in brief/context; avoid dumping the raw Amp thread.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					enum: ['patch', 'review', 'research'],
					description: 'patch = proposed unified diff, review = findings on existing work, research = read-only answer with citations.',
				},
				brief: {
					type: 'string',
					description: 'Curated task brief for Pi. Include objective, relevant constraints, and desired output.',
				},
				context: {
					type: 'string',
					description: 'Optional pre-processed context: file excerpts, git diff, external context summaries, or prior decisions.',
				},
				provider: {
					type: 'string',
					description: `Pi provider name. Defaults to ${DEFAULT_PROVIDER}.`,
				},
				model: {
					type: 'string',
					description: `Pi model ID. Defaults to ${DEFAULT_MODEL}.`,
				},
				thinking: {
					type: 'string',
					enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
					description: 'Pi thinking level. Defaults to high.',
				},
				timeoutMinutes: {
					type: 'number',
					description: 'Timeout in minutes. Defaults to 10; capped at 30.',
				},
				workingDirectory: {
					type: 'string',
					description: 'Directory where Pi should run. Defaults to the plugin process cwd; usually pass the current workspace root.',
				},
				includeRawTranscript: {
					type: 'boolean',
					description: 'If true, store raw Pi stdout/stderr in addition to the redacted audit log. May contain sensitive context.',
				},
			},
			required: ['mode', 'brief'],
		},
		async execute(rawInput, ctx) {
			const input = normalizeInput(rawInput)
			if ('error' in input) return failureJson(input.error)

			const threadID = ctx.thread.id
			const prompt = buildPrompt(input)
			const promptBytes = Buffer.byteLength(prompt, 'utf8')
			if (promptBytes > MAX_PROMPT_BYTES) {
				return failureJson(`Pi subagent prompt is too large: ${promptBytes} bytes exceeds ${MAX_PROMPT_BYTES} bytes. Pass a smaller curated brief/context.`)
			}
			const command = buildPiCommand(input)
			if ('error' in command) return failureJson(command.error)
			const envFileError = validateOptionalOpEnvFile(SUBAGENT_ENV_FILE)
			if (envFileError) return failureJson(envFileError)

			const timeoutMs = input.timeoutMinutes * 60_000
			const startedAt = new Date()
			const result = await runPi(command.args, prompt, command.cwd, timeoutMs)
			const finishedAt = new Date()

			const parsed = parsePiResult(result.stdout, input.mode)
			const validationError = parsed.ok ? validateModePayload(parsed.payload, input.mode) : parsed.error
			const usage = extractPiUsage(result.stdout)

			const audit = writeAuditLog({
				threadID,
				input,
				cwd: command.cwd,
				args: command.args,
				prompt,
				result,
				payload: parsed.ok ? parsed.payload : null,
				validationError,
				usage,
				startedAt,
				finishedAt,
			})
			const usageLog = writeTokenUsageLog({
				threadID,
				input,
				cwd: command.cwd,
				result,
				validationError,
				usage,
				auditPath: audit.auditPath,
				startedAt,
				finishedAt,
			})

			if (result.timedOut) {
				return JSON.stringify({
					ok: false,
					error: `Pi timed out after ${input.timeoutMinutes} minute(s).`,
					auditLogPath: audit.auditPath,
					usageLogPath: usageLog.path,
					usageLogError: usageLog.error,
					rawTranscriptPath: audit.rawPath,
				}, null, 2)
			}

			if (result.exitCode !== 0) {
				return JSON.stringify({
					ok: false,
					error: `Pi exited with code ${result.exitCode}.`,
					stderr: truncate(result.stderr, 4_000),
					auditLogPath: audit.auditPath,
					usageLogPath: usageLog.path,
					usageLogError: usageLog.error,
					rawTranscriptPath: audit.rawPath,
				}, null, 2)
			}

			if (!parsed.ok || validationError) {
				return JSON.stringify({
					ok: false,
					error: validationError ?? 'Pi returned invalid JSON.',
					stdout: truncate(result.stdout, 4_000),
					stderr: truncate(result.stderr, 4_000),
					auditLogPath: audit.auditPath,
					usageLogPath: usageLog.path,
					usageLogError: usageLog.error,
					rawTranscriptPath: audit.rawPath,
				}, null, 2)
			}

			return JSON.stringify({
				ok: true,
				mode: input.mode,
				provider: input.provider,
				model: input.model,
				thinking: input.thinking,
				result: parsed.payload,
				auditLogPath: audit.auditPath,
				usageLogPath: usageLog.path,
				usageLogError: usageLog.error,
				rawTranscriptPath: audit.rawPath,
				warning: input.includeRawTranscript
					? 'Raw Pi output was stored because includeRawTranscript=true. It may contain sensitive context.'
					: undefined,
			}, null, 2)
		},
	})
}

function normalizeInput(raw: Record<string, unknown>): ToolInput | { error: string } {
	const mode = raw.mode
	const brief = raw.brief
	if (mode !== 'patch' && mode !== 'review' && mode !== 'research') {
		return { error: 'mode must be one of: patch, review, research.' }
	}
	if (typeof brief !== 'string' || brief.trim().length === 0) {
		return { error: 'brief is required and must be a non-empty string.' }
	}

	const provider = typeof raw.provider === 'string' && raw.provider.trim() ? raw.provider.trim() : DEFAULT_PROVIDER
	const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_MODEL
	const thinking = normalizeThinking(raw.thinking)
	const timeoutMinutes = clampTimeout(raw.timeoutMinutes)
	const workingDirectory = typeof raw.workingDirectory === 'string' && raw.workingDirectory.trim()
		? expandHome(raw.workingDirectory.trim())
		: process.cwd()

	if (!existsSync(workingDirectory)) return { error: `workingDirectory does not exist: ${workingDirectory}` }

	return {
		mode,
		brief: brief.trim(),
		context: typeof raw.context === 'string' ? raw.context : undefined,
		provider,
		model,
		thinking,
		timeoutMinutes,
		workingDirectory,
		includeRawTranscript: raw.includeRawTranscript === true || process.env.AMP_PI_CODE_SUBAGENT_DEBUG === '1',
	}
}

function buildPiCommand(input: ToolInput): { args: string[]; cwd: string } | { error: string } {
	const cwd = resolve(input.workingDirectory)
	if (!existsSync(cwd)) return { error: `workingDirectory does not exist: ${cwd}` }

	return {
		cwd,
		args: [
			'--provider', input.provider,
			'--model', input.model,
			'--thinking', input.thinking,
			'--tools', READ_ONLY_TOOLS.join(','),
			'--no-extensions',
			'--no-skills',
			'--no-prompt-templates',
			'--no-themes',
			'--no-context-files',
			'--no-session',
			'--print',
			'Read the subagent instructions from stdin. Return only the required JSON object.',
		],
	}
}

function buildPrompt(input: ToolInput): string {
	const schemaDescription = JSON.stringify(schemaForMode(input.mode), null, 2)
	return [
		'You are Pi Coding Agent running as a read-only subagent for Amp.',
		'You must not modify files. Do not attempt to use bash, edit, write, or any other mutating capability.',
		'Amp is the executor. Your job is to provide structured advice only.',
		`Mode: ${input.mode}`,
		'',
		'Output requirements:',
		'- Return JSON only, matching the schema below. Do not wrap it in Markdown fences.',
		'- If proposing code, put a unified diff in the patch field. Do not edit files directly.',
		'- If reviewing, include concise findings with evidence and suggested fixes.',
		'- If researching, include citations/links when available.',
		'- Be explicit about risks and tests Amp should run.',
		'',
		'JSON schema:',
		schemaDescription,
		'',
		'Task brief from Amp:',
		input.brief,
		'',
		input.context ? `Pre-processed context from Amp:\n${input.context}` : 'Pre-processed context from Amp: (none provided)',
	].join('\n')
}

function schemaForMode(mode: Mode): Record<string, unknown> {
	const recommendation = { type: 'string', enum: ['apply', 'do_not_apply', 'needs_amp_judgment'] }
	const confidence = { type: 'string', enum: ['low', 'medium', 'high'] }
	if (mode === 'patch') {
		return {
			type: 'object',
			additionalProperties: false,
			properties: {
				summary: { type: 'string' },
				recommendation,
				confidence,
				patch: { type: 'string' },
				tests: { type: 'array', items: { type: 'string' } },
				risks: { type: 'array', items: { type: 'string' } },
			},
			required: ['summary', 'recommendation', 'confidence', 'patch', 'tests', 'risks'],
		}
	}
	if (mode === 'review') {
		return {
			type: 'object',
			additionalProperties: false,
			properties: {
				summary: { type: 'string' },
				recommendation,
				confidence,
				findings: {
					type: 'array',
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							severity: { type: 'string', enum: ['low', 'medium', 'high'] },
							evidence: { type: 'string' },
							issue: { type: 'string' },
							suggested_fix: { type: 'string' },
						},
						required: ['severity', 'evidence', 'issue', 'suggested_fix'],
					},
				},
				tests: { type: 'array', items: { type: 'string' } },
				risks: { type: 'array', items: { type: 'string' } },
			},
			required: ['summary', 'recommendation', 'confidence', 'findings', 'tests', 'risks'],
		}
	}
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			summary: { type: 'string' },
			answer: { type: 'string' },
			confidence,
			citations: { type: 'array', items: { type: 'string' } },
			risks: { type: 'array', items: { type: 'string' } },
		},
		required: ['summary', 'answer', 'confidence', 'citations', 'risks'],
	}
}

function runPi(args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<PiRunResult> {
	return new Promise((resolveRun) => {
		const command = withOptionalOpRun('pi', args, SUBAGENT_ENV_FILE)
		const child = spawn(command.bin, command.args, {
			cwd,
			env: sanitizedSubagentEnv(),
			stdio: ['pipe', 'pipe', 'pipe'],
		})

		let stdout = ''
		let stderr = ''
		let timedOut = false

		const timer = setTimeout(() => {
			timedOut = true
			child.kill('SIGTERM')
			setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
		}, timeoutMs)
		child.stdout.setEncoding('utf8')
		child.stderr.setEncoding('utf8')
		child.stdout.on('data', (chunk) => { stdout += chunk })
		child.stderr.on('data', (chunk) => { stderr += chunk })
		child.on('error', (error) => {
			clearTimeout(timer)
			resolveRun({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut })
		})
		child.on('close', (code) => {
			clearTimeout(timer)
			resolveRun({ exitCode: code, stdout, stderr, timedOut })
		})

		child.stdin.end(prompt)
	})
}

function parsePiResult(stdout: string, mode: Mode): { ok: true; payload: unknown } | { ok: false; error: string } {
	const cleaned = stripMarkdownFence(stdout.trim())
	const direct = parseJson(cleaned)
	if (direct.ok) return { ok: true, payload: direct.value }

	const extracted = extractFirstJsonObject(cleaned)
	if (extracted) {
		const parsed = parseJson(extracted)
		if (parsed.ok) return { ok: true, payload: parsed.value }
	}

	return { ok: false, error: `Could not parse Pi result as ${mode} JSON: ${direct.error}` }
}

function stripMarkdownFence(text: string): string {
	const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
	return match ? match[1].trim() : text
}

function extractFirstJsonObject(text: string): string | null {
	const start = text.indexOf('{')
	if (start === -1) return null

	let depth = 0
	let inString = false
	let escaped = false
	for (let i = start; i < text.length; i++) {
		const char = text[i]
		if (inString) {
			if (escaped) {
				escaped = false
			} else if (char === '\\') {
				escaped = true
			} else if (char === '"') {
				inString = false
			}
			continue
		}
		if (char === '"') {
			inString = true
			continue
		}
		if (char === '{') depth++
		if (char === '}') {
			depth--
			if (depth === 0) return text.slice(start, i + 1)
		}
	}
	return null
}

function validateModePayload(payload: unknown, mode: Mode): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Pi payload must be a JSON object.'
	const obj = payload as Record<string, unknown>
	for (const key of ['summary', 'confidence']) {
		if (typeof obj[key] !== 'string') return `Pi payload is missing string field: ${key}`
	}
	if (!isConfidence(obj.confidence)) return 'confidence must be low, medium, or high.'

	if (mode === 'research') {
		if (typeof obj.answer !== 'string') return 'research payload is missing string field: answer'
		if (!Array.isArray(obj.citations)) return 'research payload is missing array field: citations'
		if (!Array.isArray(obj.risks)) return 'research payload is missing array field: risks'
		return null
	}

	if (!['apply', 'do_not_apply', 'needs_amp_judgment'].includes(String(obj.recommendation))) {
		return 'recommendation must be apply, do_not_apply, or needs_amp_judgment.'
	}
	if (!Array.isArray(obj.tests)) return `${mode} payload is missing array field: tests`
	if (!Array.isArray(obj.risks)) return `${mode} payload is missing array field: risks`
	if (mode === 'patch' && typeof obj.patch !== 'string') return 'patch payload is missing string field: patch'
	if (mode === 'review' && !Array.isArray(obj.findings)) return 'review payload is missing array field: findings'
	return null
}

function extractPiUsage(stdout: string): TokenUsage | null {
	const parsed = parseJson(stdout.trim())
	if (!parsed.ok) return null

	let last: TokenUsage | null = null
	visitObjects(parsed.value, (obj) => {
		const usage = normalizeTokenUsage(obj.usage) ?? normalizeTokenUsage(obj.tokenUsage)
		if (usage) last = usage
	})
	return last
}

function visitObjects(value: unknown, visitor: (obj: Record<string, unknown>) => void) {
	if (!value || typeof value !== 'object') return
	if (Array.isArray(value)) {
		for (const item of value) visitObjects(item, visitor)
		return
	}

	const obj = value as Record<string, unknown>
	visitor(obj)
	for (const nested of Object.values(obj)) visitObjects(nested, visitor)
}

function normalizeTokenUsage(value: unknown): TokenUsage | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const obj = value as Record<string, unknown>
	const inputTokens = tokenCount(obj.input_tokens ?? obj.inputTokens ?? obj.prompt_tokens ?? obj.promptTokens)
	const outputTokens = tokenCount(obj.output_tokens ?? obj.outputTokens ?? obj.completion_tokens ?? obj.completionTokens)
	const cacheCreationInputTokens = tokenCount(obj.cache_creation_input_tokens ?? obj.cacheCreationInputTokens)
	const cacheReadInputTokens = tokenCount(obj.cache_read_input_tokens ?? obj.cacheReadInputTokens)
	const totalTokens = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens

	if (totalTokens === 0 && tokenCount(obj.total_tokens ?? obj.totalTokens) === 0) return null

	return {
		inputTokens,
		outputTokens,
		cacheCreationInputTokens,
		cacheReadInputTokens,
		totalTokens: totalTokens || tokenCount(obj.total_tokens ?? obj.totalTokens),
	}
}

function tokenCount(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function writeAuditLog(details: {
	threadID: string
	input: ToolInput
	cwd: string
	args: string[]
	prompt: string
	result: PiRunResult
	payload: unknown
	validationError: string | null
	usage: TokenUsage | null
	startedAt: Date
	finishedAt: Date
}): { auditPath: string; rawPath?: string } {
	mkdirSync(AUDIT_DIR, { recursive: true })
	const stamp = details.startedAt.toISOString().replace(/[:.]/g, '-')
	const base = `${stamp}-${details.input.mode}-${details.threadID}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
	const auditPath = join(AUDIT_DIR, `${base}.json`)
	const rawPath = details.input.includeRawTranscript ? join(AUDIT_DIR, `${base}.raw.json`) : undefined

	const audit = {
		threadID: details.threadID,
		mode: details.input.mode,
		provider: details.input.provider,
		model: details.input.model,
		thinking: details.input.thinking,
		cwd: details.cwd,
		timeoutMinutes: details.input.timeoutMinutes,
		startedAt: details.startedAt.toISOString(),
		finishedAt: details.finishedAt.toISOString(),
		durationMs: details.finishedAt.getTime() - details.startedAt.getTime(),
		exitCode: details.result.exitCode,
		timedOut: details.result.timedOut,
		args: details.args,
		brief: redact(details.input.brief),
		context: redact(truncate(details.input.context ?? '', 20_000)),
		prompt: redact(truncate(details.prompt, 30_000)),
		stdout: redact(truncate(details.result.stdout, 30_000)),
		stderr: redact(truncate(details.result.stderr, 10_000)),
		payload: redactObject(details.payload),
		validationError: details.validationError,
		usage: details.usage,
	}

	writePrivateFile(auditPath, JSON.stringify(audit, null, 2))
	if (rawPath) {
		writePrivateFile(rawPath, JSON.stringify({
			warning: 'Raw Pi output may contain sensitive context.',
			stdout: details.result.stdout,
			stderr: details.result.stderr,
		}, null, 2))
	}
	return { auditPath, rawPath }
}

function writeTokenUsageLog(details: {
	threadID: string
	input: ToolInput
	cwd: string
	result: PiRunResult
	validationError: string | null
	usage: TokenUsage | null
	auditPath: string
	startedAt: Date
	finishedAt: Date
}): { path: string; error?: string } {
	const event = {
		timestamp: details.startedAt.toISOString(),
		source: 'pi-code-subagent',
		agent: 'pi_code',
		threadID: details.threadID,
		mode: details.input.mode,
		provider: details.input.provider,
		model: details.input.model,
		thinking: details.input.thinking,
		durationMs: details.finishedAt.getTime() - details.startedAt.getTime(),
		exitCode: details.result.exitCode,
		timedOut: details.result.timedOut,
		validationError: details.validationError,
		usage: details.usage,
		metadata: {
			workingDirectory: details.cwd,
			auditLogPath: details.auditPath,
		},
	}

	try {
		mkdirSync(dirname(TOKEN_USAGE_LOG_PATH), { recursive: true })
		appendFileSync(TOKEN_USAGE_LOG_PATH, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
		return { path: TOKEN_USAGE_LOG_PATH }
	} catch (error) {
		return {
			path: TOKEN_USAGE_LOG_PATH,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

function redactObject(value: unknown): unknown {
	if (typeof value === 'string') return redact(value)
	if (Array.isArray(value)) return value.map(redactObject)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redactObject(val)]))
	}
	return value
}

function redact(text: string): string {
	return text
		.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:PRIVATE_KEY]')
		.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
		.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:API_KEY]')
		.replace(/\b(xox[pbar]-[A-Za-z0-9-]{20,})\b/g, '[REDACTED:SLACK_TOKEN]')
		.replace(/\blin_api_[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:LINEAR_API_KEY]')
		.replace(/\b(?:ntn|secret)_[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:NOTION_TOKEN]')
		.replace(/\b(DEEPSEEK_API_KEY|LINEAR_API_KEY|LINEAR_TOKEN|NOTION_ACCESS_TOKEN|NOTION_API_TOKEN)(\s*[:=]\s*)[^\s"']+/gi, '$1$2[REDACTED]')
		.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED:EMAIL]')
		.replace(/(api[_-]?key|token|secret|password|authorization|bearer)(\s*[:=]\s*)[^\s"']+/gi, '$1$2[REDACTED]')
}

function sanitizedSubagentEnv(extra?: Record<string, string | undefined>): Record<string, string> {
	const env: Record<string, string> = {}
	for (const key of SAFE_ENV_KEYS) {
		const value = process.env[key]
		if (typeof value === 'string') env[key] = value
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value !== 'string') continue
		if (!SAFE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
		if (SECRET_ENV_NAME_RE.test(key)) continue
		env[key] = value
	}
	for (const [key, value] of Object.entries(extra ?? {})) {
		if (typeof value === 'string') env[key] = value
	}
	env.NO_COLOR = '1'
	return env
}

function withOptionalOpRun(bin: string, args: string[], envFile?: string): { bin: string; args: string[] } {
	if (!envFile?.trim()) return { bin, args }
	return {
		bin: process.env.OP_BIN || 'op',
		args: ['run', `--env-file=${expandHome(envFile.trim())}`, '--', bin, ...args],
	}
}

function validateOptionalOpEnvFile(envFile?: string): string | null {
	if (!envFile?.trim()) return null
	const path = expandHome(envFile.trim())
	if (!existsSync(path)) return `Subagent env file not found: ${path}`
	const text = readFileSync(path, 'utf8')
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) return `Invalid line in subagent env file ${path}; use KEY=op://<vault>/<item>/<field>`
		const value = unquoteEnvValue(match[2].trim())
		if (value && !value.startsWith('op://')) return `${match[1]} in ${path} is plaintext; store a 1Password op:// reference instead`
	}
	return null
}

function unquoteEnvValue(value: string): string {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
	return value
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
	try {
		return { ok: true, value: JSON.parse(text.trim()) }
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
}

function isConfidence(value: unknown): value is Confidence {
	return value === 'low' || value === 'medium' || value === 'high'
}

function normalizeThinking(value: unknown): Thinking {
	if (value === 'off' || value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
		return value
	}
	return DEFAULT_THINKING
}

function clampTimeout(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MINUTES
	return Math.min(Math.ceil(value), MAX_TIMEOUT_MINUTES)
}

function expandHome(path: string): string {
	if (path === '~') return homedir()
	if (path.startsWith('~/')) return join(homedir(), path.slice(2))
	return isAbsolute(path) ? path : resolve(path)
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`
}

function writePrivateFile(path: string, data: string) {
	writeFileSync(path, data, { encoding: 'utf8', mode: 0o600 })
}

function failureJson(error: string): string {
	return JSON.stringify({ ok: false, error }, null, 2)
}
