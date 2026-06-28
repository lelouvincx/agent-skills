// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// holistics-md — transforms Holistics MCP tool results (executed via the
// `holistics mcp ...` CLI through the Bash tool) by rendering the verbose
// YAML `result_data` block as a markdown table before it reaches the LLM.
//
// Target CLI shape (Bash stdout, indented YAML):
//
//   status: success
//   error: null
//   result:
//     type: .call
//     data:
//       aql: |- ...
//       sql: | ...
//       result_data:
//         fields:
//           - col_a
//           - col_b
//         field_labels:
//           - A
//           - B
//         data:
//           - - v1
//             - v2
//           - - v3
//             - v4
//         ...
//       result_row_count: N
//       url: https://...
//
// We surgically replace the `result_data:` sub-block with a rendered
// markdown table while leaving the rest of the YAML intact.

import type { PluginAPI, PluginToolResultContentBlock } from '@ampcode/plugin'

const HOLISTICS_MCP_RE =
	/\bholistics\s+mcp\b(?:\s+--\S+)*\s+(execute_aql|execute_viz|execute_viz_block)\b/

function isContentBlockArray(v: unknown): v is PluginToolResultContentBlock[] {
	return Array.isArray(v) && v.every((b) => b && typeof b === 'object' && 'type' in b)
}

function matchesHolisticsCli(input: Record<string, unknown>): boolean {
	const cmd = input.cmd ?? input.command
	return typeof cmd === 'string' && HOLISTICS_MCP_RE.test(cmd)
}

function indentOf(line: string): number {
	const m = line.match(/^( *)/)
	return m ? m[1].length : 0
}

// Trim trailing CRs and surrounding quotes from a YAML scalar.
function unquoteScalar(s: string): string {
	const t = s.trim()
	if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
		return t.slice(1, -1)
	}
	return t
}

function escapeCell(v: string): string {
	return v.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

interface ResultData {
	fields: string[]
	field_labels: string[] | null
	data: string[][]
}

// Parse a sub-block of YAML representing the `result_data:` value.
// `block` is the raw text starting from the line *after* `result_data:`,
// up to but not including the next sibling key. `baseIndent` is the indent
// of `result_data:` itself (children are at baseIndent + 2).
function parseResultData(block: string, baseIndent: number): ResultData | null {
	const lines = block.split('\n')
	const childIndent = baseIndent + 2
	const itemIndent = childIndent + 2

	const fields: string[] = []
	const field_labels: string[] = []
	let hasFieldLabels = false
	let fieldLabelsIsNull = false
	const data: string[][] = []

	let mode: 'none' | 'fields' | 'labels' | 'data' = 'none'
	let currentRow: string[] | null = null

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (line.trim() === '') continue
		const ind = indentOf(line)

		// New child key under result_data
		if (ind === childIndent && /^[A-Za-z_][\w]*:/.test(line.slice(ind))) {
			const colon = line.indexOf(':', ind)
			const key = line.slice(ind, colon)
			const valStr = line.slice(colon + 1).trim()
			if (key === 'fields') {
				mode = 'fields'
			} else if (key === 'field_labels') {
				mode = 'labels'
				hasFieldLabels = true
				if (valStr === 'null' || valStr === '~') fieldLabelsIsNull = true
			} else if (key === 'data') {
				mode = 'data'
				currentRow = null
			} else {
				mode = 'none'
			}
			continue
		}

		// List items
		if (mode === 'fields' && ind === itemIndent && line.slice(ind).startsWith('- ')) {
			fields.push(unquoteScalar(line.slice(ind + 2)))
			continue
		}
		if (mode === 'labels' && ind === itemIndent && line.slice(ind).startsWith('- ')) {
			field_labels.push(unquoteScalar(line.slice(ind + 2)))
			continue
		}
		if (mode === 'data') {
			// Outer row marker: "- - val" at itemIndent
			if (ind === itemIndent && line.slice(ind).startsWith('- - ')) {
				currentRow = [unquoteScalar(line.slice(ind + 4))]
				data.push(currentRow)
				continue
			}
			// Continuation of current row: "  - val" at itemIndent + 2
			if (
				currentRow &&
				ind === itemIndent + 2 &&
				line.slice(ind).startsWith('- ')
			) {
				currentRow.push(unquoteScalar(line.slice(ind + 2)))
				continue
			}
			// Empty row: "- []" at itemIndent
			if (ind === itemIndent && line.slice(ind).trim() === '- []') {
				data.push([])
				currentRow = null
				continue
			}
		}
	}

	if (fields.length === 0 && data.length === 0) return null

	return {
		fields,
		field_labels: hasFieldLabels && !fieldLabelsIsNull && field_labels.length > 0
			? field_labels
			: null,
		data,
	}
}

function toMarkdownTable(rd: ResultData): string {
	const headers =
		rd.field_labels && rd.field_labels.length === rd.fields.length
			? rd.field_labels
			: rd.fields
	if (headers.length === 0) return '_(no columns)_'
	const head = `| ${headers.map(escapeCell).join(' | ')} |`
	const sep = `| ${headers.map(() => '---').join(' | ')} |`
	if (rd.data.length === 0) return `${head}\n${sep}\n_(no rows)_`
	const body = rd.data
		.map((row) => `| ${row.map((v) => escapeCell(v ?? '')).join(' | ')} |`)
		.join('\n')
	return `${head}\n${sep}\n${body}`
}

// Locate the `result_data:` line, capture its block (children at deeper
// indent), return [startLine, endLine, baseIndent] or null.
function findResultDataBlock(
	text: string,
): { start: number; end: number; baseIndent: number; lines: string[] } | null {
	const lines = text.split('\n')
	let start = -1
	let baseIndent = 0
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const ind = indentOf(line)
		if (/^result_data:\s*$/.test(line.slice(ind))) {
			start = i
			baseIndent = ind
			break
		}
	}
	if (start === -1) return null

	let end = lines.length
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i]
		if (line.trim() === '') continue
		const ind = indentOf(line)
		if (ind <= baseIndent) {
			end = i
			break
		}
	}
	return { start, end, baseIndent, lines }
}

function transformPayload(text: string): string | null {
	const loc = findResultDataBlock(text)
	if (!loc) return null

	const blockText = loc.lines.slice(loc.start + 1, loc.end).join('\n')
	const rd = parseResultData(blockText, loc.baseIndent)
	if (!rd) return null

	const md = toMarkdownTable(rd)
	const pad = ' '.repeat(loc.baseIndent)
	// Replace the `result_data:` block with a literal block scalar holding
	// the markdown table — preserves YAML well-formedness for any LLM that
	// tries to re-parse, and keeps it indented under `data:`.
	const replacement = [
		`${pad}result_data: |`,
		...md.split('\n').map((l) => `${pad}  ${l}`),
	].join('\n')

	const before = loc.lines.slice(0, loc.start).join('\n')
	const after = loc.lines.slice(loc.end).join('\n')
	return [before, replacement, after].filter((s) => s.length > 0).join('\n')
}

export default function (amp: PluginAPI) {
	amp.logger.log('[holistics-md] plugin loaded')

	amp.on('tool.result', async (event, ctx) => {
		if (event.status !== 'done') return
		if (!matchesHolisticsCli(event.input)) return
		if (!isContentBlockArray(event.output)) return

		let changed = false
		const newOutput: PluginToolResultContentBlock[] = event.output.map((block) => {
			if (block.type !== 'text') return block
			const md = transformPayload(block.text)
			if (md === null) return block
			changed = true
			return { type: 'text', text: md }
		})

		if (!changed) return
		ctx.logger.log(`[holistics-md] rendered result_data as markdown table`)
		return { status: 'done', output: newOutput }
	})
}
