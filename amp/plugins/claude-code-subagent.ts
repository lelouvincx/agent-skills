// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// claude-code-subagent — invokes Claude Code CLI as a manual, read-only
// advisor from Amp. Claude Code must not edit files; it returns structured
// JSON with advice, review findings, or a proposed unified diff. Amp remains
// responsible for applying/adapting changes and verification.

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { PluginAPI } from '@ampcode/plugin'

type Mode = 'patch' | 'review' | 'research'
type Model = 'opus' | 'sonnet'
type GithubProfile = string

interface ToolInput {
	mode: Mode
	brief: string
	context?: string
	githubProfile?: GithubProfile
	model: Model
	timeoutMinutes: number
	workingDirectory: string
	safeRoots: string[]
	mcpConfigPath?: string
	allowedMcpTools: string[]
	includeRawTranscript: boolean
}

interface DesignToolInput {
	prompt: string
	sessionId?: string
	model: Model
	timeoutMinutes: number
	workingDirectory: string
	includeRawTranscript: boolean
}

interface ClaudeRunResult {
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
const DEFAULT_MODEL: Model = 'opus'
const DEFAULT_MCP_CONFIG_PATH = join(homedir(), '.config', 'amp', 'claude-code-readonly-mcp.json')
const DEFAULT_GITHUB_PROFILE_CONFIG_PATH = join(homedir(), '.config', 'amp', 'github-profiles.json')
const AUDIT_DIR = process.env.AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR ?? join(homedir(), '.config', 'amp', 'logs', 'claude-code-subagent')
const TOKEN_USAGE_LOG_PATH = process.env.AMP_AGENT_TOKEN_USAGE_LOG ?? join(homedir(), '.config', 'amp', 'logs', 'agent-token-usage.jsonl')
const SUBAGENT_ENV_FILE = process.env.AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE

const BUILTIN_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'LS']
const BUILTIN_DENIED_TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const DESIGN_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'ToolSearch', 'DesignSync']
const DESIGN_DENIED_TOOLS = ['Bash', 'Edit', 'Write', 'NotebookEdit']
const DESIGN_MCP_TOOLS = 'mcp__claude-design__*'
const SAFE_ENV_KEYS = ['HOME', 'PATH', 'SHELL', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']
const SAFE_ENV_PREFIXES = ['AMP_', 'HERDR_']
const SECRET_ENV_NAME_RE = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|BEARER)/i
const DEFAULT_ALLOWED_MCP_TOOLS = [
	'mcp__amp_context__slack_auth_list',
	'mcp__amp_context__slack_search_messages',
	'mcp__amp_context__slack_search_channels',
	'mcp__amp_context__slack_list_conversations',
	'mcp__amp_context__slack_read_conversation',
	'mcp__amp_context__notion_auth_status',
	'mcp__amp_context__notion_search',
	'mcp__amp_context__notion_page_view',
	'mcp__amp_context__notion_db_query',
	'mcp__amp_context__linear_auth_whoami',
	'mcp__amp_context__linear_issue_view',
	'mcp__amp_context__linear_issue_list',
	'mcp__amp_context__linear_comment_list',
	'mcp__amp_context__linear_project_list',
	'mcp__amp_context__linear_team_list',
	'mcp__amp_context__linear_graphql_query',
	'mcp__amp_context__github_auth_status',
	'mcp__amp_context__github_repo_view',
	'mcp__amp_context__github_repo_list',
	'mcp__amp_context__github_file_get',
	'mcp__amp_context__github_issue_view',
	'mcp__amp_context__github_issue_list',
	'mcp__amp_context__github_pr_view',
	'mcp__amp_context__github_pr_list',
	'mcp__amp_context__github_pr_diff',
	'mcp__amp_context__github_search_code',
	'mcp__amp_context__github_search_issues',
	'mcp__amp_context__github_search_prs',
	'mcp__amp_context__github_api_get',
	'mcp__amp_context__github_graphql_query',
]

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'claude_code_subagent',
		description: [
			'Use Claude Code CLI as a manual, read-only second-opinion subagent.',
			'Call this tool ONLY when the user explicitly mentions "Claude" or "Claude Code".',
			'Claude Code must not edit files: this tool allows only the shared local read-only subagent toolkit (Read/Grep/Glob/LS), denies Bash/Edit/Write/MultiEdit/NotebookEdit, and asks Claude for structured JSON only.',
			'No MCP bridge is loaded by default so the default toolkit matches Pi Coding Agent. Pass mcpConfigPath/allowedMcpTools only for explicit read-only external context.',
			'For GitHub profile routing, pass githubProfile explicitly as work, personal, or bot; do not pass natural-language profile phrases to this tool.',
			'Use mode=review for reviewing a diff/implementation, mode=patch for a small-to-medium patch proposal, and mode=research for read-only investigation.',
			'Pass a pre-processed Amp summary in brief/context; do not dump the full raw Amp thread by default.',
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
					description: 'Curated task brief for Claude Code. Include objective, relevant constraints, and desired output.',
				},
				context: {
					type: 'string',
					description: 'Optional pre-processed context: file excerpts, git diff, external context summaries, or prior decisions.',
				},
				githubProfile: {
					type: 'string',
					enum: ['work', 'personal', 'bot'],
					description: 'Optional explicit GitHub profile alias from ~/.config/amp/github-profiles.json. Omit to use the default profile.',
				},
				model: {
					type: 'string',
					enum: ['opus', 'sonnet'],
					description: 'Claude Code model alias. Defaults to opus; use sonnet only when the user asks for speed/lightweight behavior.',
				},
				timeoutMinutes: {
					type: 'number',
					description: 'Timeout in minutes. Defaults to 10; capped at 30.',
				},
				workingDirectory: {
					type: 'string',
					description: 'Directory where Claude Code should run. Defaults to the plugin process cwd; usually pass the current workspace root.',
				},
				safeRoots: {
					type: 'array',
					items: { type: 'string' },
					description: 'Additional approved read roots outside the working directory. Each is passed as --add-dir.',
				},
				mcpConfigPath: {
					type: 'string',
					description: `Optional read-only MCP config path. Not loaded by default; pass ${DEFAULT_MCP_CONFIG_PATH} explicitly when you want external read-only context. Claude Code is run with --strict-mcp-config when this is set.`,
				},
				allowedMcpTools: {
					type: 'array',
					items: { type: 'string' },
					description: 'Optional explicit read-only MCP tool names to pre-approve, e.g. mcp__slack__search_messages. Do not pass write-capable tools.',
				},
				includeRawTranscript: {
					type: 'boolean',
					description: 'If true, store raw Claude CLI stdout/stderr in addition to the redacted audit log. May contain sensitive context.',
				},
			},
			required: ['mode', 'brief'],
		},
		async execute(rawInput, ctx) {
			const input = normalizeInput(rawInput)
			if ('error' in input) return failureJson(input.error)

			const threadID = ctx.thread.id
			const prompt = buildPrompt(input)
			const schema = schemaForMode(input.mode)
			const command = buildClaudeCommand(input, schema)
			if ('error' in command) return failureJson(command.error)
			const envFileError = validateOptionalOpEnvFile(SUBAGENT_ENV_FILE)
			if (envFileError) return failureJson(envFileError)

			const timeoutMs = input.timeoutMinutes * 60_000
			const startedAt = new Date()
			const result = await runClaude(command.args, prompt, command.cwd, timeoutMs, input.githubProfile)
			const finishedAt = new Date()

			const parsed = parseClaudeResult(result.stdout, input.mode)
			const validationError = parsed.ok ? validateModePayload(parsed.payload, input.mode) : parsed.error
			const usage = extractClaudeUsage(result.stdout)

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
					error: `Claude Code timed out after ${input.timeoutMinutes} minute(s).`,
					auditLogPath: audit.auditPath,
					usageLogPath: usageLog.path,
					usageLogError: usageLog.error,
					rawTranscriptPath: audit.rawPath,
				}, null, 2)
			}

			if (result.exitCode !== 0) {
				return JSON.stringify({
					ok: false,
					error: `Claude Code exited with code ${result.exitCode}.`,
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
					error: validationError ?? 'Claude Code returned invalid JSON.',
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
				model: input.model,
				result: parsed.payload,
				auditLogPath: audit.auditPath,
				usageLogPath: usageLog.path,
				usageLogError: usageLog.error,
				rawTranscriptPath: audit.rawPath,
				warning: input.includeRawTranscript
					? 'Raw Claude CLI output was stored because includeRawTranscript=true. It may contain sensitive context.'
					: undefined,
			}, null, 2)
		},
	})

	amp.registerTool({
		name: 'claude_design_subagent',
		description: [
			'Use Claude Code as a narrow authenticated proxy for Claude Design.',
			'Call this tool ONLY when the user explicitly asks to use Claude Design.',
			'It may create or modify cloud-hosted Claude Design projects, but it cannot run Bash or edit local files.',
			'Pass the returned sessionId to continue the same design conversation after the user reviews the canvas.',
			'Requires Claude Code 2.1.181+, Claude subscription login, and prior /design consent.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					description: 'Design task or feedback for Claude Code to execute through Claude Design.',
				},
				sessionId: {
					type: 'string',
					description: 'Optional Claude Code session ID returned by an earlier call. Use it to continue iterative work on the same design.',
				},
				model: {
					type: 'string',
					enum: ['opus', 'sonnet'],
					description: 'Claude Code orchestration model. Defaults to opus; use sonnet for faster or lighter turns.',
				},
				timeoutMinutes: {
					type: 'number',
					description: 'Timeout in minutes. Defaults to 10; capped at 30.',
				},
				workingDirectory: {
					type: 'string',
					description: 'Repository whose local design-system files Claude may read. Defaults to the plugin process cwd.',
				},
				includeRawTranscript: {
					type: 'boolean',
					description: 'If true, store raw Claude CLI stdout/stderr in addition to the redacted audit log.',
				},
			},
			required: ['prompt'],
		},
		async execute(rawInput, ctx) {
			const input = normalizeDesignInput(rawInput)
			if ('error' in input) return failureJson(input.error)

			const args = buildDesignCommand(input)
			const startedAt = new Date()
			const result = await runClaude(args, buildDesignPrompt(input), resolve(input.workingDirectory), input.timeoutMinutes * 60_000, undefined, false)
			const finishedAt = new Date()
			const parsed = parseJson(result.stdout)
			const output = parsed.ok ? extractResultCandidate(parsed.value) : undefined
			const sessionId = parsed.ok ? extractClaudeSessionId(parsed.value) : undefined
			const audit = writeDesignAuditLog({ threadID: ctx.thread.id, input, args, result, output, sessionId, startedAt, finishedAt })

			if (result.timedOut) return failureJson(`Claude Design proxy timed out after ${input.timeoutMinutes} minute(s).`)
			if (result.exitCode !== 0) {
				return JSON.stringify({ ok: false, error: `Claude Code exited with code ${result.exitCode}.`, stderr: truncate(result.stderr, 4_000), auditLogPath: audit.auditPath }, null, 2)
			}
			if (!parsed.ok) {
				return JSON.stringify({ ok: false, error: `Could not parse Claude CLI JSON: ${parsed.error}`, stdout: truncate(result.stdout, 4_000), auditLogPath: audit.auditPath }, null, 2)
			}

			return JSON.stringify({
				ok: true,
				model: input.model,
				result: output,
				sessionId,
				auditLogPath: audit.auditPath,
				rawTranscriptPath: audit.rawPath,
			}, null, 2)
		},
	})
}

function normalizeDesignInput(raw: Record<string, unknown>): DesignToolInput | { error: string } {
	if (typeof raw.prompt !== 'string' || raw.prompt.trim().length === 0) {
		return { error: 'prompt is required and must be a non-empty string.' }
	}
	const workingDirectory = typeof raw.workingDirectory === 'string' && raw.workingDirectory.trim()
		? expandHome(raw.workingDirectory.trim())
		: process.cwd()
	if (!existsSync(workingDirectory)) return { error: `workingDirectory does not exist: ${workingDirectory}` }

	const sessionId = typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId.trim() : undefined
	if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
		return { error: 'sessionId must be a valid UUID returned by Claude Code.' }
	}

	return {
		prompt: raw.prompt.trim(),
		sessionId,
		model: raw.model === 'sonnet' ? 'sonnet' : DEFAULT_MODEL,
		timeoutMinutes: clampTimeout(raw.timeoutMinutes),
		workingDirectory,
		includeRawTranscript: raw.includeRawTranscript === true || process.env.AMP_CLAUDE_CODE_SUBAGENT_DEBUG === '1',
	}
}

function buildDesignCommand(input: DesignToolInput): string[] {
	const args = [
		'-p',
		'--model', input.model,
		'--output-format', 'json',
		'--permission-mode', 'dontAsk',
		'--tools', DESIGN_ALLOWED_TOOLS.join(','),
		'--allowedTools', [...DESIGN_ALLOWED_TOOLS, DESIGN_MCP_TOOLS].join(','),
		'--disallowedTools', DESIGN_DENIED_TOOLS.join(','),
	]
	if (input.sessionId) args.push('--resume', input.sessionId)
	return args
}

function buildDesignPrompt(input: DesignToolInput): string {
	return [
		'You are Claude Code acting as a narrow proxy between Amp and Claude Design.',
		'Use ToolSearch and Claude Design tools to complete the requested design task.',
		'You may read local files and use DesignSync when needed, but do not run Bash or modify local files.',
		'Return a concise summary of what changed, plus every relevant Claude Design project URL and ID.',
		'',
		'Design task from Amp:',
		input.prompt,
	].join('\n')
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

	const model = raw.model === 'sonnet' ? 'sonnet' : DEFAULT_MODEL
	const timeoutMinutes = clampTimeout(raw.timeoutMinutes)
	const githubProfile = normalizeGithubProfile(raw.githubProfile)
	const workingDirectory = typeof raw.workingDirectory === 'string' && raw.workingDirectory.trim()
		? expandHome(raw.workingDirectory.trim())
		: process.cwd()

	if (!existsSync(workingDirectory)) return { error: `workingDirectory does not exist: ${workingDirectory}` }

	return {
		mode,
		brief: brief.trim(),
		context: typeof raw.context === 'string' ? raw.context : undefined,
		githubProfile,
		model,
		timeoutMinutes,
		workingDirectory,
		safeRoots: stringArray(raw.safeRoots).map(expandHome),
		mcpConfigPath: typeof raw.mcpConfigPath === 'string' && raw.mcpConfigPath.trim()
			? expandHome(raw.mcpConfigPath.trim())
			: undefined,
		allowedMcpTools: stringArray(raw.allowedMcpTools),
		includeRawTranscript: raw.includeRawTranscript === true || process.env.AMP_CLAUDE_CODE_SUBAGENT_DEBUG === '1',
	}
}

function buildClaudeCommand(input: ToolInput, schema: Record<string, unknown>): { args: string[]; cwd: string } | { error: string } {
	const cwd = resolve(input.workingDirectory)
	const configuredMcpPath = input.mcpConfigPath

	if (input.mcpConfigPath && !existsSync(input.mcpConfigPath)) {
		return { error: `mcpConfigPath does not exist: ${input.mcpConfigPath}` }
	}
	if (!configuredMcpPath && input.allowedMcpTools.length > 0) {
		return { error: 'allowedMcpTools requires mcpConfigPath. MCP is explicit-only so the default Claude toolkit matches Pi.' }
	}

	for (const root of input.safeRoots) {
		if (!existsSync(root)) return { error: `safe root does not exist: ${root}` }
	}

	const defaultMcpTools = configuredMcpPath ? DEFAULT_ALLOWED_MCP_TOOLS : []
	const allowedTools = [...new Set([...BUILTIN_ALLOWED_TOOLS, ...defaultMcpTools, ...input.allowedMcpTools])]
	const args = [
		'-p',
		'--model', input.model,
		'--output-format', 'json',
		'--permission-mode', 'dontAsk',
		'--tools', BUILTIN_ALLOWED_TOOLS.join(','),
		'--allowedTools', allowedTools.join(','),
		'--disallowedTools', BUILTIN_DENIED_TOOLS.join(','),
		'--json-schema', JSON.stringify(schema),
	]

	if (configuredMcpPath) args.push('--strict-mcp-config', '--mcp-config', configuredMcpPath)
	for (const root of input.safeRoots) args.push('--add-dir', root)

	return { args, cwd }
}

function buildPrompt(input: ToolInput): string {
	const schemaDescription = JSON.stringify(schemaForMode(input.mode), null, 2)
	return [
		'You are Claude Code running as a read-only subagent for Amp.',
		'You must not modify files. Do not attempt to use Bash, Edit, Write, MultiEdit, or NotebookEdit.',
		'Amp is the executor. Your job is to provide structured advice only.',
		`Mode: ${input.mode}`,
		'',
		'Output requirements:',
		'- Return JSON only, matching the schema below.',
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
		`GitHub profile routing: ${input.githubProfile ? `${input.githubProfile} profile selected` : 'default profile'}.`,
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

function runClaude(args: string[], prompt: string, cwd: string, timeoutMs: number, githubProfile?: string, useConfiguredEnvFile = true): Promise<ClaudeRunResult> {
	return new Promise((resolveRun) => {
		const env = sanitizedSubagentEnv(githubProfile ? { AMP_GITHUB_PROFILE: githubProfile } : undefined)
		// Several Claude CLI options used above are variadic (`--mcp-config`,
		// `--add-dir`, `--allowedTools`). Terminate option parsing explicitly so
		// the task prompt is never consumed as another option value.
		const command = withOptionalOpRun('claude', [...args, '--', prompt], useConfiguredEnvFile ? SUBAGENT_ENV_FILE : undefined)
		const child = spawn(command.bin, command.args, {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
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
	})
}

function parseClaudeResult(stdout: string, mode: Mode): { ok: true; payload: unknown } | { ok: false; error: string } {
	const outer = parseJson(stdout)
	if (!outer.ok) return { ok: false, error: `Could not parse Claude CLI JSON: ${outer.error}` }

	const candidate = extractResultCandidate(outer.value)
	if (typeof candidate === 'string') {
		const inner = parseJson(candidate)
		if (!inner.ok) return { ok: false, error: `Could not parse Claude result as ${mode} JSON: ${inner.error}` }
		return { ok: true, payload: inner.value }
	}
	return { ok: true, payload: candidate }
}

function extractResultCandidate(value: unknown): unknown {
	if (Array.isArray(value)) {
		for (let i = value.length - 1; i >= 0; i--) {
			const item = value[i]
			if (item && typeof item === 'object' && (item as { type?: unknown }).type === 'result') {
				const result = item as { structured_output?: unknown; result?: unknown }
				if (result.structured_output !== undefined) return result.structured_output
				if (result.result !== undefined) return result.result
			}
		}
	}
	if (value && typeof value === 'object' && 'result' in value) return (value as { result: unknown }).result
	return value
}

function extractClaudeSessionId(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		for (let i = value.length - 1; i >= 0; i--) {
			const item = value[i]
			if (item && typeof item === 'object' && typeof (item as { session_id?: unknown }).session_id === 'string') {
				return (item as { session_id: string }).session_id
			}
		}
	}
	if (value && typeof value === 'object' && typeof (value as { session_id?: unknown }).session_id === 'string') {
		return (value as { session_id: string }).session_id
	}
	return undefined
}

function validateModePayload(payload: unknown, mode: Mode): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Claude payload must be a JSON object.'
	const obj = payload as Record<string, unknown>
	for (const key of ['summary', 'confidence']) {
		if (typeof obj[key] !== 'string') return `Claude payload is missing string field: ${key}`
	}
	if (!['low', 'medium', 'high'].includes(String(obj.confidence))) return 'confidence must be low, medium, or high.'

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

function extractClaudeUsage(stdout: string): TokenUsage | null {
	const parsed = parseJson(stdout)
	if (!parsed.ok) return null

	const aggregate = extractAggregateUsage(parsed.value)
	if (aggregate) return aggregate

	const messageUsage = extractUniqueMessageUsage(parsed.value)
	if (messageUsage.length > 0) return sumUsages(messageUsage)

	return extractLastUsage(parsed.value)
}

function extractAggregateUsage(value: unknown): TokenUsage | null {
	if (Array.isArray(value)) {
		for (let i = value.length - 1; i >= 0; i--) {
			const item = value[i]
			if (!item || typeof item !== 'object') continue
			const obj = item as Record<string, unknown>
			if (obj.type === 'result') {
				const usage = normalizeTokenUsage(obj.usage)
				if (usage) return usage
			}
		}
	}

	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>
		if (obj.type === 'result' || 'result' in obj) {
			const usage = normalizeTokenUsage(obj.usage)
			if (usage) return usage
		}
	}

	return null
}

function extractUniqueMessageUsage(value: unknown): TokenUsage[] {
	const byMessageID = new Map<string, TokenUsage>()

	visitObjects(value, (obj) => {
		const message = obj.message
		if (!message || typeof message !== 'object' || Array.isArray(message)) return

		const messageObj = message as Record<string, unknown>
		const usage = normalizeTokenUsage(messageObj.usage)
		if (!usage) return

		const id = typeof messageObj.id === 'string' ? messageObj.id : undefined
		if (!id) return

		const existing = byMessageID.get(id)
		if (!existing || usage.totalTokens > existing.totalTokens) byMessageID.set(id, usage)
	})

	return [...byMessageID.values()]
}

function extractLastUsage(value: unknown): TokenUsage | null {
	let last: TokenUsage | null = null
	visitObjects(value, (obj) => {
		const usage = normalizeTokenUsage(obj.usage)
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
	const inputTokens = tokenCount(obj.input_tokens)
	const outputTokens = tokenCount(obj.output_tokens)
	const cacheCreationInputTokens = tokenCount(obj.cache_creation_input_tokens)
	const cacheReadInputTokens = tokenCount(obj.cache_read_input_tokens)
	const totalTokens = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens

	if (totalTokens === 0 && tokenCount(obj.total_tokens) === 0) return null

	return {
		inputTokens,
		outputTokens,
		cacheCreationInputTokens,
		cacheReadInputTokens,
		totalTokens: totalTokens || tokenCount(obj.total_tokens),
	}
}

function tokenCount(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function sumUsages(usages: TokenUsage[]): TokenUsage {
	return usages.reduce<TokenUsage>((sum, usage) => ({
		inputTokens: sum.inputTokens + usage.inputTokens,
		outputTokens: sum.outputTokens + usage.outputTokens,
		cacheCreationInputTokens: sum.cacheCreationInputTokens + usage.cacheCreationInputTokens,
		cacheReadInputTokens: sum.cacheReadInputTokens + usage.cacheReadInputTokens,
		totalTokens: sum.totalTokens + usage.totalTokens,
	}), {
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		totalTokens: 0,
	})
}

function writeAuditLog(details: {
	threadID: string
	input: ToolInput
	cwd: string
	args: string[]
	prompt: string
	result: ClaudeRunResult
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
		model: details.input.model,
		githubProfile: details.input.githubProfile,
		cwd: details.cwd,
		timeoutMinutes: details.input.timeoutMinutes,
		startedAt: details.startedAt.toISOString(),
		finishedAt: details.finishedAt.toISOString(),
		durationMs: details.finishedAt.getTime() - details.startedAt.getTime(),
		exitCode: details.result.exitCode,
		timedOut: details.result.timedOut,
		args: details.args.map((arg) => arg === JSON.stringify(schemaForMode(details.input.mode)) ? '<json-schema>' : arg),
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
			warning: 'Raw Claude CLI output may contain sensitive context.',
			stdout: details.result.stdout,
			stderr: details.result.stderr,
		}, null, 2))
	}
	return { auditPath, rawPath }
}

function writeDesignAuditLog(details: {
	threadID: string
	input: DesignToolInput
	args: string[]
	result: ClaudeRunResult
	output: unknown
	sessionId?: string
	startedAt: Date
	finishedAt: Date
}): { auditPath: string; rawPath?: string } {
	mkdirSync(AUDIT_DIR, { recursive: true })
	const stamp = details.startedAt.toISOString().replace(/[:.]/g, '-')
	const base = `${stamp}-design-${details.threadID}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
	const auditPath = join(AUDIT_DIR, `${base}.json`)
	const rawPath = details.input.includeRawTranscript ? join(AUDIT_DIR, `${base}.raw.json`) : undefined

	writePrivateFile(auditPath, JSON.stringify({
		threadID: details.threadID,
		mode: 'design',
		model: details.input.model,
		cwd: resolve(details.input.workingDirectory),
		sessionId: details.sessionId,
		timeoutMinutes: details.input.timeoutMinutes,
		startedAt: details.startedAt.toISOString(),
		finishedAt: details.finishedAt.toISOString(),
		durationMs: details.finishedAt.getTime() - details.startedAt.getTime(),
		exitCode: details.result.exitCode,
		timedOut: details.result.timedOut,
		args: details.args,
		prompt: redact(details.input.prompt),
		result: redactObject(details.output),
		stdout: redact(truncate(details.result.stdout, 30_000)),
		stderr: redact(truncate(details.result.stderr, 10_000)),
	}, null, 2))

	if (rawPath) {
		writePrivateFile(rawPath, JSON.stringify({
			warning: 'Raw Claude CLI output may contain sensitive context.',
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
	result: ClaudeRunResult
	validationError: string | null
	usage: TokenUsage | null
	auditPath: string
	startedAt: Date
	finishedAt: Date
}): { path: string; error?: string } {
	const event = {
		timestamp: details.startedAt.toISOString(),
		source: 'claude-code-subagent',
		agent: 'claude_code',
		threadID: details.threadID,
		mode: details.input.mode,
		model: details.input.model,
		durationMs: details.finishedAt.getTime() - details.startedAt.getTime(),
		exitCode: details.result.exitCode,
		timedOut: details.result.timedOut,
		validationError: details.validationError,
		usage: details.usage,
		metadata: {
			workingDirectory: details.cwd,
			githubProfile: details.input.githubProfile,
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
			.replace(/\b(LINEAR_API_KEY|LINEAR_TOKEN|NOTION_ACCESS_TOKEN|NOTION_API_TOKEN)(\s*[:=]\s*)[^\s"']+/gi, '$1$2[REDACTED]')
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

function clampTimeout(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MINUTES
	return Math.min(Math.ceil(value), MAX_TIMEOUT_MINUTES)
}

function normalizeGithubProfile(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined
	const profile = value.trim()
	const config = loadGithubProfileConfig()
	return Object.prototype.hasOwnProperty.call(config.profiles, profile) ? profile : undefined
}

function loadGithubProfileConfig(): { profiles: Record<string, unknown> } {
	const fallback = {
		profiles: {
			work: {},
			personal: {},
			bot: {},
		},
	}
	try {
		if (!existsSync(DEFAULT_GITHUB_PROFILE_CONFIG_PATH)) return fallback
		const parsed = JSON.parse(readFileSync(DEFAULT_GITHUB_PROFILE_CONFIG_PATH, 'utf8')) as {
			profiles?: Record<string, unknown>
		}
		return {
			profiles: parsed.profiles && typeof parsed.profiles === 'object'
				? parsed.profiles
				: fallback.profiles,
		}
	} catch {
		return fallback
	}
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
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
