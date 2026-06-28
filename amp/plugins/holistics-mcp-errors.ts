// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// holistics-mcp-errors — append-only logger for failures/errors from
// Holistics MCP tool calls executed via the `holistics mcp ...` CLI
// (invoked through the Bash tool).
//
// Captures both:
//   * hard failures: status === 'error' | 'cancelled', or non-zero exit
//   * soft failures: status === 'done' but stdout YAML/JSON contains a
//     non-empty `errors` field (typical for execute_aql / validate_aql /
//     generate_aql validation errors).
//
// Output: JSONL at ~/.config/amp/logs/holistics-mcp-errors.jsonl
// One line per event. Pure observation — never mutates the tool result.

import type {
	PluginAPI,
	PluginToolResultContentBlock,
	ToolResultEvent,
} from '@ampcode/plugin'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const LOG_PATH = join(homedir(), '.config', 'amp', 'logs', 'holistics-mcp-errors.jsonl')

// Matches `holistics mcp <tool>` in a shell command. Captures the tool name.
// Allows optional flags like --dev / --live before the tool name.
const HOLISTICS_MCP_RE = /\bholistics\s+mcp\b(?:\s+--\S+)*\s+([a-zA-Z_][\w-]*)/

function extractCliCommand(input: Record<string, unknown>): string | null {
	const cmd = input.cmd ?? input.command
	return typeof cmd === 'string' ? cmd : null
}

function matchedMcpTool(input: Record<string, unknown>): string | null {
	const cmd = extractCliCommand(input)
	if (!cmd) return null
	const m = cmd.match(HOLISTICS_MCP_RE)
	return m ? m[1] : null
}

interface LogEntry {
	ts: string
	thread_id: string
	tool_use_id: string
	tool: string
	mcp_tool: string
	command: string
	status: 'error' | 'cancelled' | 'done'
	failure_kind: 'hard' | 'soft'
	error?: string
	input: Record<string, unknown>
	output_errors?: unknown
	output_excerpt?: string
}

function isContentBlockArray(v: unknown): v is PluginToolResultContentBlock[] {
	return Array.isArray(v) && v.every((b) => b && typeof b === 'object' && 'type' in b)
}

// Concatenate all text blocks (or pass through string output).
function extractOutputText(output: unknown): string | null {
	if (typeof output === 'string') return output
	if (isContentBlockArray(output)) {
		const text = output
			.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
		return text || null
	}
	return null
}

// Holistics CLI prints YAML by default. Try JSON first, then a lightweight
// YAML probe for a non-empty `errors:` field.
function extractSoftErrors(text: string): unknown | null {
	try {
		const payload = JSON.parse(text) as Record<string, unknown>
		const errs = payload.errors
		if (errs === null || errs === undefined) return null
		if (Array.isArray(errs) && errs.length === 0) return null
		if (typeof errs === 'object' && Object.keys(errs as object).length === 0) return null
		if (typeof errs === 'string' && errs.trim() === '') return null
		return errs
	} catch {
		// fall through to YAML probe
	}

	// YAML probe: look for a top-level `errors:` key with non-empty value.
	// Matches `errors:` followed by either inline non-empty value or an
	// indented block list / map on the next line.
	const m = text.match(/(^|\n)errors:[ \t]*(.*)(?:\n([ \t]+.+))?/)
	if (!m) return null
	const inline = (m[2] ?? '').trim()
	const next = (m[3] ?? '').trim()
	if (inline === '' && next === '') return null
	if (inline === '[]' || inline === '{}' || inline === 'null' || inline === '~') return null
	return inline || next
}

function isHardFailure(event: ToolResultEvent, outputText: string | null): boolean {
	if (event.status === 'error' || event.status === 'cancelled') return true
	// Bash tools embed exit code in the output envelope; detect non-zero.
	if (outputText && /<exitCode>\s*[^0\s]/.test(outputText)) return true
	return false
}

function buildEntry(event: ToolResultEvent, mcpTool: string, command: string): LogEntry | null {
	const outputText = extractOutputText(event.output)
	const hard = isHardFailure(event, outputText)
	const softErrors = !hard && outputText ? extractSoftErrors(outputText) : null

	if (!hard && !softErrors) return null

	return {
		ts: new Date().toISOString(),
		thread_id: event.thread.id,
		tool_use_id: event.toolUseID,
		tool: event.tool,
		mcp_tool: mcpTool,
		command,
		status: event.status,
		failure_kind: hard ? 'hard' : 'soft',
		error: event.error,
		input: event.input,
		output_errors: softErrors ?? undefined,
		output_excerpt: outputText ?? undefined,
	}
}

async function appendEntry(entry: LogEntry): Promise<void> {
	await mkdir(dirname(LOG_PATH), { recursive: true })
	await appendFile(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8')
}

export default function (amp: PluginAPI) {
	amp.logger.log(
		`[holistics-mcp-errors] plugin loaded → ${LOG_PATH} (watching \`holistics mcp\` CLI calls)`,
	)

	amp.on('tool.result', async (event, ctx) => {
		const mcpTool = matchedMcpTool(event.input)
		if (!mcpTool) return

		const command = extractCliCommand(event.input) ?? ''
		const entry = buildEntry(event, mcpTool, command)
		if (!entry) return

		try {
			await appendEntry(entry)
			ctx.logger.log(
				`[holistics-mcp-errors] logged ${entry.failure_kind} failure: ${entry.mcp_tool} (${entry.status})`,
			)
		} catch (err) {
			ctx.logger.log(
				`[holistics-mcp-errors] FAILED to write log: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
		// Always return undefined → never mutate the tool result.
	})
}
