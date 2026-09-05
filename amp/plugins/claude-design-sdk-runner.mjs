#!/usr/bin/env bun

import { query } from '@anthropic-ai/claude-agent-sdk'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { decideClaudeDesignMcpPermission, decideDesignSyncPermission, extractDesignSyncPlanId, sanitizeDesignSyncInput } from '../mcp-servers/design-sync-upload-policy.mjs'

const DESIGN_TOOLS = ['Read', 'Grep', 'Glob', 'ToolSearch', 'DesignSync']
const DESIGN_AUTO_ALLOWED_TOOLS = DESIGN_TOOLS.filter((tool) => tool !== 'DesignSync')
const DESIGN_DENIED_TOOLS = ['Bash', 'Edit', 'Write', 'NotebookEdit']

export async function runDesignQuery(input) {
	const approvalState = {
		finalizeRequestId: undefined,
		writeRequestId: undefined,
		approvedPlanIds: new Set(),
	}
	const canUseTool = async (toolName, toolInput, options) => {
		if (toolName.startsWith('mcp__claude-design__')) {
			return decideClaudeDesignMcpPermission({ tool_name: toolName, input: toolInput })
		}
		if (!input.approval) {
			return { behavior: 'deny', message: `Permission is not approved for tool ${toolName}.` }
		}

		const decision = decideDesignSyncPermission(input.approval, {
			tool_name: toolName,
			input: toolInput,
		}, approvalState.approvedPlanIds)
		if (decision.behavior === 'deny') return decision

		if (toolInput.method === 'finalize_plan') {
			if (approvalState.finalizeRequestId && approvalState.finalizeRequestId !== options.requestId) {
				return { behavior: 'deny', message: 'Only one DesignSync finalized plan is approved.' }
			}
			approvalState.finalizeRequestId = options.requestId
		}
		if (toolInput.method === 'write_files') {
			if (approvalState.writeRequestId && approvalState.writeRequestId !== options.requestId) {
				return { behavior: 'deny', message: 'Only one exact DesignSync file upload is approved.' }
			}
			approvalState.writeRequestId = options.requestId
		}

		return { behavior: 'allow', updatedInput: sanitizeDesignSyncInput(toolInput) }
	}
	const hooks = input.approval
		? {
			PostToolUse: [{
				matcher: 'DesignSync',
				hooks: [async (hookInput) => {
					if (hookInput.tool_input?.method !== 'finalize_plan') return {}
					const planId = extractDesignSyncPlanId(hookInput.tool_response)
					if (planId) approvalState.approvedPlanIds.add(planId)
					return {}
				}],
			}],
		}
		: undefined

	let finalResult
	const stream = query({
		prompt: input.prompt,
		options: {
			cwd: input.cwd,
			model: input.model,
			...(input.resume ? { resume: input.sessionId } : { sessionId: input.sessionId }),
			abortController: input.abortController,
			tools: DESIGN_TOOLS,
			allowedTools: DESIGN_AUTO_ALLOWED_TOOLS,
			disallowedTools: DESIGN_DENIED_TOOLS,
			permissionMode: 'default',
			settingSources: ['user'],
			systemPrompt: { type: 'preset', preset: 'claude_code' },
			env: input.env,
			stderr: input.onStderr,
			canUseTool,
			hooks,
		},
	})
	for await (const message of stream) {
		if (message.type === 'result') finalResult = message
	}
	if (!finalResult) throw new Error('Claude Agent SDK did not return a result message.')
	return finalResult
}

async function main() {
	let raw = ''
	for await (const chunk of process.stdin) raw += chunk
	const input = JSON.parse(raw)
	const abortController = new AbortController()
	const result = await runDesignQuery({
		...input,
		abortController,
		env: process.env,
		onStderr: (data) => process.stderr.write(data),
	})
	process.stdout.write(JSON.stringify(result))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
		process.exitCode = 1
	})
}
