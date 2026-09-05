import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function decideDesignSyncPermission(approval, request, approvedPlanIds = new Set()) {
	if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return deny('DesignSync upload approval is missing or invalid.')
	if (!request || typeof request !== 'object' || Array.isArray(request)) return deny('Permission request is missing or invalid.')
	if (request.tool_name !== 'DesignSync') return deny(`Permission is not approved for tool ${String(request.tool_name)}.`)

	const input = request.input
	if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('DesignSync input is missing or invalid.')
	if (input.method === 'finalize_plan') return decideFinalizePlan(approval, input)
	if (input.method === 'write_files') return decideWriteFiles(approval, input, approvedPlanIds)
	return deny(`DesignSync method is not approved: ${String(input.method)}.`)
}

export function decideClaudeDesignMcpPermission(request) {
	if (!request || typeof request !== 'object' || Array.isArray(request)) return deny('Claude Design permission request is missing or invalid.')
	if (typeof request.tool_name !== 'string' || !request.tool_name.startsWith('mcp__claude-design__')) {
		return deny(`Permission is not approved for tool ${String(request.tool_name)}.`)
	}
	if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
		return deny('Claude Design input is missing or invalid.')
	}
	return { behavior: 'allow', updatedInput: sanitizeDesignSyncInput(request.input) }
}

export function extractDesignSyncPlanId(response) {
	const parsed = parseJsonObject(response)
	if (!parsed) return undefined
	return findStringProperty(parsed, 'planId')
}

export function sanitizeDesignSyncInput(input) {
	return Object.fromEntries(Object.entries(input).filter(([key]) => !isConsentMetadata(key)))
}

function decideFinalizePlan(approval, input) {
	const unexpectedKeys = Object.keys(input).filter((key) => !['method', 'projectId', 'localDir', 'writes', 'deletes'].includes(key) && !isConsentMetadata(key))
	if (unexpectedKeys.length > 0) return deny(`DesignSync input has an unexpected field: ${unexpectedKeys[0]}`)
	if (input.projectId !== approval.projectId) return deny('DesignSync projectId does not match the approved project.')
	if (resolve(String(input.localDir ?? '')) !== approval.localDir) return deny('DesignSync localDir does not match the approved source directory.')
	if (!sameStringArray(input.writes, approval.files.map((file) => file.path))) return deny('DesignSync writes do not match the approved remote paths in order.')
	if (!sameStringArray(input.deletes, [])) return deny('DesignSync deletions are not approved.')
	return { behavior: 'allow' }
}

function decideWriteFiles(approval, input, approvedPlanIds) {
	const unexpectedKeys = Object.keys(input).filter((key) => !['method', 'projectId', 'planId', 'files'].includes(key) && !isConsentMetadata(key))
	if (unexpectedKeys.length > 0) return deny(`DesignSync input has an unexpected field: ${unexpectedKeys[0]}`)
	if (input.projectId !== approval.projectId) return deny('DesignSync projectId does not match the approved project.')
	if (typeof input.planId !== 'string' || !approvedPlanIds.has(input.planId)) return deny('DesignSync planId was not returned by the approved finalized plan in this run.')
	if (!Array.isArray(input.files) || input.files.length !== approval.files.length) return deny('DesignSync files do not match the complete approved mapping.')

	for (let index = 0; index < approval.files.length; index++) {
		const requested = input.files[index]
		const approved = approval.files[index]
		if (!requested || typeof requested !== 'object' || Array.isArray(requested)) return deny(`DesignSync files[${index}] is invalid.`)
		const unexpectedFileKeys = Object.keys(requested).filter((key) => !['path', 'localPath'].includes(key))
		if (unexpectedFileKeys.length > 0) return deny(`DesignSync files[${index}] has an unapproved field: ${unexpectedFileKeys[0]}`)
		if (requested.path !== approved.path || requested.localPath !== approved.localPath) return deny(`DesignSync files[${index}] does not match the approved path mapping.`)
		const identityError = verifySourceIdentity(approval.localDir, approved)
		if (identityError) return deny(identityError)
	}

	return { behavior: 'allow' }
}

function verifySourceIdentity(localDir, approved) {
	try {
		const bytes = readFileSync(resolve(localDir, approved.localPath))
		if (bytes.byteLength !== approved.bytes) return `Approved local source changed size before upload: ${approved.localPath}`
		if (createHash('sha256').update(bytes).digest('hex') !== approved.sha256) return `Approved local source changed content before upload: ${approved.localPath}`
		return undefined
	} catch {
		return `Approved local source cannot be read before upload: ${approved.localPath}`
	}
}

function parseJsonObject(value) {
	if (value && typeof value === 'object') return value
	if (typeof value !== 'string') return undefined
	try {
		const parsed = JSON.parse(value)
		return parsed && typeof parsed === 'object' ? parsed : undefined
	} catch {
		return undefined
	}
}

function findStringProperty(value, property) {
	if (!value || typeof value !== 'object') return undefined
	if (typeof value[property] === 'string') return value[property]
	for (const nested of Object.values(value)) {
		const match = findStringProperty(nested, property)
		if (match) return match
	}
	return undefined
}

function sameStringArray(left, right) {
	return Array.isArray(left)
		&& Array.isArray(right)
		&& left.length === right.length
		&& left.every((value, index) => typeof value === 'string' && value === right[index])
}

function isConsentMetadata(key) {
	return key.startsWith('__consent')
}

function deny(message) {
	return { behavior: 'deny', message }
}
