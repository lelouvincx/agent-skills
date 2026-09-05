import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decideClaudeDesignMcpPermission, decideDesignSyncPermission, extractDesignSyncPlanId, sanitizeDesignSyncInput } from '../mcp-servers/design-sync-upload-policy.mjs'

const root = resolve(import.meta.dir, '..', '..')
const temp = mkdtempSync(join(tmpdir(), 'claude-design-subagent-test-'))
const bin = join(temp, 'bin')
const capturePath = join(temp, 'capture.json')
const auditDir = join(temp, 'audit')
const fakeClaude = join(bin, 'claude')
const fakeDesignRunner = join(bin, 'claude-design-sdk-runner')
const designSkillDir = join(temp, '.agents', 'skills', 'collaborating-with-claude-design')
const designSkillPath = join(designSkillDir, 'SKILL.md')
const designUploadDir = join(temp, 'design-upload')
const designSkillMarker = 'DESIGN_SKILL_TEST_MARKER'
const designSkillContent = `---\nname: collaborating-with-claude-design\ndescription: Test fixture.\n---\n\n# ${designSkillMarker}\n`
const designSkillSha256 = createHash('sha256').update(designSkillContent, 'utf8').digest('hex')
const sessionId = '123e4567-e89b-42d3-a456-426614174000'
const mismatchSessionId = '223e4567-e89b-42d3-a456-426614174000'
const secret = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-')
const originalHome = process.env.HOME

try {
	mkdirSync(bin)
	mkdirSync(designSkillDir, { recursive: true })
	mkdirSync(join(designUploadDir, 'raw'), { recursive: true })
	mkdirSync(join(designUploadDir, 'amql'), { recursive: true })
	writeFileSync(designSkillPath, designSkillContent)
	writeFileSync(join(designUploadDir, 'raw', 'q9.jsonl'), '{"record":1}\n')
	writeFileSync(join(designUploadDir, 'amql', 'q9.jsonl'), '{"record":2}\n')
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
	writeFileSync(fakeDesignRunner, `#!/usr/bin/env node
const fs = require('node:fs')
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  const request = JSON.parse(raw)
  fs.writeFileSync(process.env.AMP_DESIGN_CAPTURE_PATH, JSON.stringify({
    args: [],
    request,
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
  else process.stdout.write(JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'design result ${secret}',
    session_id: scenario === 'missing-session' ? undefined : scenario === 'mismatch' ? '${mismatchSessionId}' : request.sessionId,
  }))
})
`)
	chmodSync(fakeDesignRunner, 0o700)

	process.env.HOME = temp
	process.env.AMP_CLAUDE_DESIGN_SKILL_PATH = designSkillPath
	process.env.PATH = `${bin}:${process.env.PATH}`
	process.env.AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR = auditDir
	process.env.AMP_AGENT_TOKEN_USAGE_LOG = join(temp, 'usage.jsonl')
	process.env.AMP_DESIGN_CAPTURE_PATH = capturePath
	process.env.AMP_CLAUDE_DESIGN_SDK_RUNNER = fakeDesignRunner
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
	const missingSkillHash = JSON.parse(await design.execute({ prompt: 'test' }, { thread: { id: 'T-missing-skill-hash' } })) as Record<string, unknown>
	assert(!missingSkillHash.ok && String(missingSkillHash.error).includes('skillSha256 is required'), 'design must require Amp skill trace evidence')
	assert(!existsSync(capturePath), 'missing skill trace evidence must fail before spawning Claude')
	const mismatchedSkillHash = await invoke({ prompt: 'test', skillSha256: '0'.repeat(64) }, 'mismatched-skill-hash')
	assert(!mismatchedSkillHash.ok && String(mismatchedSkillHash.error).includes('does not match'), 'design must reject a different Amp skill hash')
	assert(!existsSync(capturePath), 'mismatched skill trace evidence must fail before spawning Claude')

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
	assert(capture.request?.model === 'fable', 'design subagent must pass the Fable model alias')
	assert(capture.request?.resume === true && capture.request.sessionId === sessionId, 'valid session ID must be passed as an SDK resume')
	assert(capture.request.cwd === root, 'design SDK runner must receive the selected working directory')
	assert(capture.request.approval === undefined, 'ordinary design calls must not receive an upload approval')
	const runnerSource = readFileSync(join(root, 'amp', 'plugins', 'claude-design-sdk-runner.mjs'), 'utf8')
	assert(runnerSource.includes("permissionMode: 'default'"), 'design SDK runner must route project grants through the permission callback')
	assert(runnerSource.includes("settingSources: ['user']"), 'design SDK runner must load user settings only')
	assert(runnerSource.includes("['Read', 'Grep', 'Glob', 'ToolSearch', 'DesignSync']"), 'design built-in allowlist must be exact')
	assert(runnerSource.includes("toolName.startsWith('mcp__claude-design__')"), 'Claude Design MCP project grants must reach the permission callback')
	assert(runnerSource.includes('allowedTools: DESIGN_AUTO_ALLOWED_TOOLS'), 'DesignSync and Claude Design MCP tools must not be auto-approved before the callback')
	assert(runnerSource.includes("['Bash', 'Edit', 'Write', 'NotebookEdit']"), 'local execution and edit tools must be denied')
	const capturedPrompt = String(capture.request.prompt)
	assert(capturedPrompt?.includes(designSkillContent), 'design prompt must include the complete collaboration skill')
	assert(capturedPrompt.includes(`sha256="${designSkillSha256}"`), 'design prompt must identify the injected skill revision')
	assert(capturedPrompt.includes('Amp has already loaded and hashed the skill and invoked this tool'), 'design prompt must exclude recursive caller actions')
	assert(capturedPrompt.includes('Execute only the bounded Claude Design cloud operation'), 'design prompt must preserve the Amp and Claude Design role boundary')
	assert(capture.safeMarker === 'safe-marker', 'safe AMP variables should reach Claude')
	assert(!capture.hasAnthropicKey && !capture.hasAmpToken && !capture.hasRandomCredential, 'secret-looking ambient variables must be stripped')
	const skillTrace = success.skillTrace as Record<string, unknown>
	assert(skillTrace.skillSha256 === designSkillSha256 && skillTrace.ampProvidedSkillSha256 === designSkillSha256, 'result must correlate Amp and proxy skill hashes')
	assert(skillTrace.skillHashMatched === true && skillTrace.claudePromptIncludedSkill === true, 'result must record hash matching and prompt containment')
	const capturedPromptSha256 = createHash('sha256').update(capturedPrompt).digest('hex')
	assert(skillTrace.claudePromptSha256 === capturedPromptSha256, 'result must contain the SHA-256 of the exact assembled Claude prompt')
	const audit = readFileSync(String(success.auditLogPath), 'utf8')
	assert(audit.includes('[REDACTED:API_KEY]') && !audit.includes(secret), 'normal audit must redact API-key-shaped text')
	const auditPayload = JSON.parse(audit) as { skillTrace?: Record<string, unknown> }
	assert(auditPayload.skillTrace?.skillSha256 === designSkillSha256, 'audit must retain the verified skill hash')
	assert(auditPayload.skillTrace?.claudePromptSha256 === skillTrace.claudePromptSha256, 'audit and result must correlate the assembled prompt hash')

	const designProjectId = 'f484a493-c6a2-4a4a-9660-7955bbf4f46b'
	const approvedDesignSyncUpload = {
		projectId: designProjectId,
		localDir: designUploadDir,
		files: [
			{ path: 'raw-traces/raw/q9.jsonl', localPath: 'raw/q9.jsonl' },
			{ path: 'raw-traces/amql/q9.jsonl', localPath: 'amql/q9.jsonl' },
		],
	}
	rmSync(capturePath, { force: true })
	const invalidDesignSyncApproval = await invoke({
		prompt: 'invalid DesignSync approval',
		workingDirectory: temp,
		approvedDesignSyncUpload: {
			...approvedDesignSyncUpload,
			files: [{ path: 'raw-traces/*.jsonl', localPath: 'raw/q9.jsonl' }],
		},
	}, 'invalid-design-sync-approval')
	assert(!invalidDesignSyncApproval.ok && String(invalidDesignSyncApproval.error).includes('without globs'), 'DesignSync approval must reject remote globs')
	assert(!existsSync(capturePath), 'invalid DesignSync approval must fail before spawning Claude')

	const approvedDesignSync = await invoke({
		prompt: 'use the exact approved DesignSync upload',
		workingDirectory: temp,
		approvedDesignSyncUpload,
	}, 'approved-design-sync')
	assert(approvedDesignSync.ok, 'exact DesignSync approval must succeed')
	const approvedCapture = readCapture()
	const encodedApproval = approvedCapture.request.approval as {
		projectId: string
		localDir: string
		files: Array<{ path: string; localPath: string; bytes: number; sha256: string }>
	}
	assert(encodedApproval.projectId === designProjectId && encodedApproval.localDir === designUploadDir, 'SDK approval must pin the project and source directory')
	assert(JSON.stringify(encodedApproval.files.map(({ path, localPath }) => ({ path, localPath }))) === JSON.stringify(approvedDesignSyncUpload.files), 'SDK approval must pin the ordered local-to-remote mappings')
	assert(encodedApproval.files.every((file) => file.bytes > 0 && /^[0-9a-f]{64}$/.test(file.sha256)), 'SDK approval must pin each source byte size and SHA-256')
	const approvedAudit = JSON.parse(readFileSync(String(approvedDesignSync.auditLogPath), 'utf8')) as { args: string[] }
	assert(argumentValue(approvedAudit.args, '--permission-mode') === 'default', 'DesignSync approval must use SDK prompting through the exact callback')
	assert(argumentValue(approvedAudit.args, '--can-use-tool') === 'claude-design-project-access+exact-design-sync-upload', 'DesignSync approval must use the project and exact-upload permission callback')
	assert(!String(argumentValue(approvedAudit.args, '--allowedTools')).split(',').includes('DesignSync'), 'DesignSync must not be auto-approved when the exact callback is active')
	assert(!String(argumentValue(approvedAudit.args, '--allowedTools')).split(',').some((tool) => tool.startsWith('mcp__claude-design__')), 'Claude Design MCP tools must not shadow the project-grant callback')
	assert(!approvedAudit.args.includes('--permission-prompt-tool'), 'DesignSync must not use the unsupported MCP prompt approval path')
	const approvalPrompt = String(approvedCapture.request.prompt)
	assert(approvalPrompt.includes('explicit user approval for this exact DesignSync upload'), 'Claude prompt must state the exact approval boundary')
	assert(approvalPrompt.includes('"localPath": "raw/q9.jsonl"'), 'Claude prompt must carry the approved local-to-remote mapping')

	const exactPermissionRequest = {
		tool_name: 'DesignSync',
		input: {
			method: 'finalize_plan',
			projectId: designProjectId,
			localDir: designUploadDir,
			writes: encodedApproval.files.map((file) => file.path),
			deletes: [],
		},
	}
	assert(decideDesignSyncPermission(encodedApproval, exactPermissionRequest).behavior === 'allow', 'permission callback must allow the exact finalized plan')
	const consentMarkedRequest = {
		...exactPermissionRequest,
		input: { ...exactPermissionRequest.input, __consentBitShown: true, __consentAskCanReachUser: false },
	}
	assert(decideDesignSyncPermission(encodedApproval, consentMarkedRequest).behavior === 'allow', 'permission callback must ignore Claude Code’s internal consent metadata')
	const sanitizedConsentInput = sanitizeDesignSyncInput(consentMarkedRequest.input)
	assert(!Object.keys(sanitizedConsentInput).some((key) => key.startsWith('__consent')), 'all internal consent metadata must be stripped before DesignSync schema validation')
	assert(decideDesignSyncPermission(encodedApproval, {
		...exactPermissionRequest,
		input: { ...exactPermissionRequest.input, __otherInternalField: true },
	}).behavior === 'deny', 'permission callback must deny other unexpected fields')
	assert(decideDesignSyncPermission(encodedApproval, {
		...exactPermissionRequest,
		input: { ...exactPermissionRequest.input, writes: [...exactPermissionRequest.input.writes].reverse() },
	}).behavior === 'deny', 'permission callback must deny reordered remote paths')
	assert(decideDesignSyncPermission(encodedApproval, {
		...exactPermissionRequest,
		input: { ...exactPermissionRequest.input, deletes: ['data.js'] },
	}).behavior === 'deny', 'permission callback must deny every deletion')
	assert(decideDesignSyncPermission(encodedApproval, {
		...exactPermissionRequest,
		tool_name: 'Bash',
	}).behavior === 'deny', 'permission callback must deny every other tool')
	const claudeDesignRequest = {
		tool_name: 'mcp__claude-design__write_files',
		input: { projectId: designProjectId, files: [{ path: 'Q9 Execution Theatre.html', data: '<html></html>' }], __consentAskCanReachUser: true },
	}
	const claudeDesignDecision = decideClaudeDesignMcpPermission(claudeDesignRequest)
	assert(claudeDesignDecision.behavior === 'allow', 'permission callback must allow Claude Design project calls')
	assert(!Object.keys('updatedInput' in claudeDesignDecision ? claudeDesignDecision.updatedInput : {}).some((key) => key.startsWith('__consent')), 'Claude Design project calls must strip internal consent metadata')
	assert(decideClaudeDesignMcpPermission({ ...claudeDesignRequest, tool_name: 'mcp__other__write_files' }).behavior === 'deny', 'permission callback must deny other MCP servers')
	const approvedPlanIds = new Set(['plan-approved'])
	const exactWriteRequest = {
		tool_name: 'DesignSync',
		input: {
			method: 'write_files',
			projectId: designProjectId,
			planId: 'plan-approved',
			files: encodedApproval.files.map(({ path, localPath }) => ({ path, localPath })),
		},
	}
	assert(decideDesignSyncPermission(encodedApproval, exactWriteRequest, approvedPlanIds).behavior === 'allow', 'permission callback must allow the exact write mapping for the approved plan')
	assert(decideDesignSyncPermission(encodedApproval, exactWriteRequest, new Set()).behavior === 'deny', 'permission callback must deny a plan ID not returned in this run')
	assert(decideDesignSyncPermission(encodedApproval, {
		...exactWriteRequest,
		input: { ...exactWriteRequest.input, files: [{ ...exactWriteRequest.input.files[0], data: 'inline' }, exactWriteRequest.input.files[1]] },
	}, approvedPlanIds).behavior === 'deny', 'permission callback must deny inline source data')
	assert(extractDesignSyncPlanId('{"method":"finalize_plan","planId":"plan-approved"}') === 'plan-approved', 'finalized plan IDs must be captured from tool output')
	writeFileSync(join(designUploadDir, 'raw', 'q9.jsonl'), '{"record":"changed"}\n')
	assert(decideDesignSyncPermission(encodedApproval, exactWriteRequest, approvedPlanIds).behavior === 'deny', 'permission callback must deny a changed approved source')
	writeFileSync(join(designUploadDir, 'raw', 'q9.jsonl'), '{"record":1}\n')

	const rawSuccess = await invoke({ prompt: 'raw test', includeRawTranscript: true, workingDirectory: root }, 'raw-success')
	assert(rawSuccess.ok && existsSync(String(rawSuccess.rawTranscriptPath)), 'opt-in raw transcript must be returned and written')
	const freshCapture = readCapture()
	const freshSessionId = freshCapture.request.sessionId
	assert(freshSessionId && rawSuccess.sessionId === freshSessionId, 'fresh calls must preassign and return their session ID')
	assert(freshCapture.request.resume === false, 'fresh sessions must not resume')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'exit'
	const exit = await invoke({ prompt: 'exit test', includeRawTranscript: true, workingDirectory: root }, 'exit')
	assert(!exit.ok && String(exit.error).includes('code 7'), 'nonzero exit must be reported')
	assert(exit.sessionId === readCapture().request.sessionId, 'nonzero exit must preserve the preassigned session ID')
	assert(existsSync(String(exit.auditLogPath)) && existsSync(String(exit.rawTranscriptPath)), 'nonzero exit must return audit and raw transcript paths')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'invalid'
	const invalidJson = await invoke({ prompt: 'invalid JSON test', includeRawTranscript: true, workingDirectory: root }, 'invalid-json')
	assert(!invalidJson.ok && String(invalidJson.error).includes('Could not parse'), 'invalid JSON must be reported')
	assert(invalidJson.sessionId === readCapture().request.sessionId, 'invalid JSON must preserve the preassigned session ID')
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
	assert(outputLimit.sessionId === readCapture().request.sessionId, 'output-limit failure must preserve the preassigned session ID')

	process.env.AMP_DESIGN_TEST_SCENARIO = 'timeout'
	const realSetTimeout = globalThis.setTimeout
	globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
		realSetTimeout(handler, timeout && timeout >= 60_000 ? 25 : timeout, ...args)
	)) as typeof setTimeout
	try {
		const timeout = await invoke({ prompt: 'timeout test', timeoutMinutes: 0.01, includeRawTranscript: true, workingDirectory: root }, 'timeout')
		assert(!timeout.ok && String(timeout.error).includes('timed out'), 'timeout must be reported')
		const timeoutAudit = JSON.parse(readFileSync(String(timeout.auditLogPath), 'utf8')) as { args: string[] }
		assert(timeout.sessionId === argumentValue(timeoutAudit.args, '--session-id'), 'timeout audit must preserve the preassigned session ID')
		assert(existsSync(String(timeout.auditLogPath)) && existsSync(String(timeout.rawTranscriptPath)), 'timeout must return audit and raw transcript paths')
	} finally {
		globalThis.setTimeout = realSetTimeout
	}

	rmSync(designSkillPath)
	rmSync(capturePath, { force: true })
	const missingSkill = await invoke({ prompt: 'missing skill test', workingDirectory: root }, 'missing-skill')
	assert(!missingSkill.ok && String(missingSkill.error).includes('collaboration skill cannot be read'), 'missing collaboration skill must fail explicitly')
	assert(!existsSync(capturePath), 'missing collaboration skill must fail before spawning Claude')

	console.log('Claude Design subagent regression tests passed')

	async function invoke(input: Record<string, unknown>, thread: string): Promise<Record<string, unknown>> {
		const tracedInput = Object.hasOwn(input, 'skillSha256') ? input : { ...input, skillSha256: designSkillSha256 }
		return JSON.parse(await design!.execute(tracedInput, { thread: { id: `T-${thread}` } })) as Record<string, unknown>
	}

	async function invokeCode(input: Record<string, unknown>, thread: string): Promise<Record<string, unknown>> {
		return JSON.parse(await code!.execute(input, { thread: { id: `T-${thread}` } })) as Record<string, unknown>
	}

	function readCapture(): {
		args: string[]
		request: {
			prompt: string
			cwd: string
			model: string
			sessionId: string
			resume: boolean
			approval?: unknown
		}
		safeMarker?: string
		hasAnthropicKey: boolean
		hasAmpToken: boolean
		hasRandomCredential: boolean
	} {
		return JSON.parse(readFileSync(capturePath, 'utf8'))
	}
} finally {
	if (originalHome === undefined) delete process.env.HOME
	else process.env.HOME = originalHome
	rmSync(temp, { recursive: true, force: true })
}

function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message)
}

function argumentValue(args: string[], name: string): string | undefined {
	const index = args.indexOf(name)
	return index >= 0 ? args[index + 1] : undefined
}
