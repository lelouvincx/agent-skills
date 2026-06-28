// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// skill-plugin-usage — append-only local capture for RFC-0004 grounded
// skill/plugin usage events and labels.

import type { PluginAPI, PluginThread, ThreadMessage } from '@ampcode/plugin'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const SOURCE_REPO = '/Users/lelouvincx/Developer/agent-skills'
const RUNTIME_ROOT = '/Users/lelouvincx/.config/amp'
const DATASET_DIR = process.env.AMP_SKILL_PLUGIN_USAGE_DIR ?? join(homedir(), '.config', 'amp', 'logs', 'skill-plugin-usage')
const EVENTS_PATH = join(DATASET_DIR, 'events.jsonl')
const LABELS_PATH = join(DATASET_DIR, 'labels.jsonl')
const MAX_SUMMARY_CHARS = 180
const MAX_NOTE_CHARS = 300

const TRACKED_TOOL_CAPABILITIES: Record<string, { target: string; label: string }> = {
	claude_code_subagent: { target: 'claude-code-subagent', label: 'Claude Code subagent' },
	pi_code_subagent: { target: 'pi-code-subagent', label: 'Pi Code subagent' },
	spawn_worker: { target: 'spawn-worker', label: 'spawn worker' },
}

type Trigger = 'automatic' | 'explicit' | 'implicit' | 'agent_decision' | 'user_correction'
type Phase = 'planning' | 'implementation' | 'review' | 'verification' | 'documentation' | 'handoff'
type Outcome = 'completed' | 'blocked' | 'abandoned' | 'partially_completed' | 'not_applicable'
type Verdict = 'keep' | 'rewrite' | 'delete' | 'split' | 'merge' | 'needs_more_data'
type Confidence = 'low' | 'medium' | 'high'

interface Artifact {
	type: string
	id: string
	source_repo: string | null
	source_path: string | null
	runtime_path: string | null
	vcs: {
		commit: string | null
		dirty: boolean | null
	}
	notes?: string
}

interface EventRow {
	schema: 'skill-plugin-usage-event/v1'
	event_id: string
	captured_at: string
	thread_id: string
	workspace: string | null
	task: {
		user_intent: string
		summary: string
		tags: string[]
	}
	artifacts: Artifact[]
	usage: {
		trigger: Trigger
		phase: Phase
		outcome: Outcome
	}
	evidence: {
		files_changed: string[]
		tools_called: string[]
		checks_run: string[]
		user_correction?: string
		notes?: string
	}
	privacy: {
		contains_raw_transcript: false
		contains_file_contents: false
		contains_secrets: false
	}
}

interface LabelRow {
	schema: 'skill-plugin-usage-label/v1'
	label_id: string
	event_id: string
	labeled_at: string
	labeled_by: 'chinh' | 'amp_with_confirmation'
	target: {
		scope: string
		type: string | null
		id: string
		source_repo: string | null
		source_path: string | null
		runtime_path: string | null
		ref: string | null
	}
	labels: string[]
	verdict: Verdict | null
	confidence: Confidence
	notes: string | null
	supersedes_label_id: string | null
	superseded_by: null
}

export default function (amp: PluginAPI) {
	amp.logger.log(`[skill-plugin-usage] plugin loaded → ${DATASET_DIR}`)

	amp.on('agent.start', async (event, ctx) => {
		const parsed = parseMagicWord(event.message)
		if (!parsed) return {}

		try {
			if (parsed.kind === 'report') {
				const eventID = await appendEvent({
					threadID: event.thread.id,
					workspace: process.cwd(),
					trigger: 'automatic',
					phase: 'review',
					outcome: 'not_applicable',
					userIntent: 'Request a local skill/plugin usage report.',
					summary: 'Generated skill/plugin usage report.',
					tags: ['report', 'skill-plugin-usage'],
					artifacts: [resolveArtifact('plugin', 'skill-plugin-usage')],
					notes: 'usage report',
				})

				const report = await buildReport()
				return {
					message: {
						content: `${report}\n\nCaptured report request as ${eventID}. Answer the user with this report concisely.`,
						display: false,
					},
				}
			}

			if (parsed.kind === 'label') {
				const labels = normalizeLabels(parsed.phrase)
				const eventID = await appendEvent({
					threadID: event.thread.id,
					workspace: process.cwd(),
					trigger: 'user_correction',
					phase: 'review',
					outcome: 'not_applicable',
					userIntent: 'Label the previous meaningful agent turn.',
					summary: `Labeled previous agent turn: ${parsed.phrase}`,
					tags: ['label', 'skill-plugin-usage'],
					artifacts: [],
					userCorrection: `usage label: ${parsed.phrase}`,
				})

				const labelID = await appendLabel({
					eventID,
					target: eventTarget(eventID),
					labels: labels.length ? labels : ['needs_more_data'],
					verdict: labels.length ? defaultVerdict(labels) : 'needs_more_data',
					confidence: 'medium',
					notes: `usage label: ${truncateNote(parsed.phrase)}`,
					labeledBy: 'chinh',
				})

				return {
					message: {
						content: `Captured usage label ${labelID} for ${eventID}. Continue with the user's request; do not repeat raw thread content.`,
						display: false,
					},
				}
			}

			const artifact = resolveArtifact(parsed.kind, parsed.target)
			const eventID = await appendEvent({
				threadID: event.thread.id,
				workspace: process.cwd(),
				trigger: 'automatic',
				phase: 'planning',
				outcome: 'not_applicable',
				userIntent: `Capture current task for ${parsed.kind} usage evidence.`,
				summary: `Captured ${parsed.kind} usage target: ${artifact.id}`,
				tags: [parsed.kind, 'skill-plugin-usage'],
				artifacts: [artifact],
				notes: artifact.notes,
			})

			return {
				message: {
					content: `Captured skill/plugin usage event ${eventID} for ${artifact.id}. Continue with the user's request; do not store raw transcripts or file contents.`,
					display: false,
				},
			}
		} catch (error) {
			ctx.logger.log(`[skill-plugin-usage] capture failed: ${errorMessage(error)}`)
			return {
				message: {
					content: `Skill/plugin usage capture failed: ${errorMessage(error)}`,
					display: false,
				},
			}
		}
	})

	amp.on('tool.result', async (event, ctx) => {
		const tracked = TRACKED_TOOL_CAPABILITIES[event.tool]
		if (!tracked) return undefined

		try {
			const artifact = resolveArtifact('plugin', tracked.target)
			await appendEvent({
				threadID: event.thread.id,
				workspace: process.cwd(),
				trigger: 'automatic',
				phase: 'implementation',
				outcome: outcomeForToolStatus(event.status),
				userIntent: 'Track terminal invocation of a tracked plugin/subagent capability.',
				summary: `Tracked ${tracked.label} invocation: ${event.status}`,
				tags: ['tracked-tool-invocation', 'skill-plugin-usage'],
				artifacts: [artifact],
				toolsCalled: [event.tool],
				notes: `tool.result status=${event.status}`,
			})
		} catch (error) {
			ctx.logger.log(`[skill-plugin-usage] tracked tool capture failed: ${errorMessage(error)}`)
		}

		return undefined
	})

	amp.registerCommand(
		'track_event',
		{
			title: 'track event',
			category: 'usage',
			description: 'Append a compact skill/plugin usage event for the current task.',
		},
		async (ctx) => {
			if (!ctx.thread) {
				await ctx.ui.notify('Open an Amp thread before running track event.')
				return
			}

			const details = await ctx.ui.input({
				title: 'track event',
				helpText: 'Optional lines: target:, labels:, verdict:, notes:. Keep notes short and do not paste secrets or transcripts.',
				initialValue: 'target: \nlabels: \nverdict: \nnotes: ',
				submitButtonText: 'Track event',
			})

			if (details === undefined) {
				await ctx.ui.notify('track event cancelled.')
				return
			}

			try {
				const fields = parseDetails(details)
				const seed = await compactThreadSeed(ctx.thread)
				const artifact = fields.target ? resolveArtifact('artifact', fields.target) : null
				const eventID = await appendEvent({
					threadID: ctx.thread.id,
					workspace: process.cwd(),
					trigger: 'explicit',
					phase: 'implementation',
					outcome: 'not_applicable',
					userIntent: 'Manually track the current task for skill/plugin usage evidence.',
					summary: fields.notes || seed || 'Manual skill/plugin usage capture.',
					tags: ['manual', 'skill-plugin-usage'],
					artifacts: artifact ? [artifact] : [],
					notes: fields.notes || undefined,
				})

				const labels = normalizeLabels(fields.labels)
				const labelIDs: string[] = []
				if (labels.length) {
					labelIDs.push(await appendLabel({
						eventID,
						target: artifact ? artifactTarget(artifact) : eventTarget(eventID),
						labels,
						verdict: fields.verdict ?? defaultVerdict(labels),
						confidence: 'medium',
						notes: fields.notes || null,
						labeledBy: 'chinh',
					}))
				}

				await ctx.ui.notify(`Tracked usage event ${eventID}${labelIDs.length ? ` with label ${labelIDs.join(', ')}` : ''}.`)
			} catch (error) {
				await ctx.ui.notify(`track event failed: ${errorMessage(error)}`)
			}
		},
	)

	amp.registerTool({
		name: 'label_skill_plugin_usage',
		description: [
			'Append a manual label or superseding correction for an existing skill/plugin usage event.',
			'Use this for explicit user backfills/corrections only; it appends to labels.jsonl and never edits historical rows.',
			'Do not include raw transcripts, full messages, file contents, secrets, or tool outputs in notes.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				event_id: { type: 'string', description: 'Existing usage event ID. Required unless relative_event is provided.' },
				relative_event: { type: 'string', description: 'Use previous/current to resolve the latest event in this thread.' },
				target: { description: 'Event, artifact, capability, instruction, or prompt target as a string or object.' },
				labels: { description: 'One or more taxonomy labels as an array or comma-separated string.' },
				verdict: { type: 'string', description: 'Optional keep, rewrite, delete, split, merge, or needs_more_data.' },
				confidence: { type: 'string', description: 'Optional low, medium, or high.' },
				notes: { type: 'string', description: 'Short user-authored evidence note; do not paste transcripts.' },
				supersedes_label_id: { type: 'string', description: 'Previous label row superseded by this correction, when known.' },
			},
			required: ['target', 'labels'],
		},
		async execute(input, ctx) {
			const eventID = await resolveEventID(input, ctx.thread)
			const labels = normalizeLabels(input.labels)
			if (!labels.length) throw new Error('labels must include at least one supported taxonomy label')

			const verdict = normalizeVerdict(input.verdict) ?? defaultVerdict(labels)
			const confidence = normalizeConfidence(input.confidence) ?? 'medium'
			const target = resolveLabelTarget(input.target, eventID)
			const labelID = await appendLabel({
				eventID,
				target,
				labels,
				verdict,
				confidence,
				notes: optionalString(input.notes),
				supersedesLabelID: optionalString(input.supersedes_label_id),
				labeledBy: 'amp_with_confirmation',
			})

			return `Appended label ${labelID} for event ${eventID}${optionalString(input.supersedes_label_id) ? `; supersedes ${optionalString(input.supersedes_label_id)}` : ''}.`
		},
	})
}

function parseMagicWord(message: string):
	| { kind: 'skill' | 'plugin'; target: string }
	| { kind: 'label'; phrase: string }
	| { kind: 'report' }
	| null {
	const text = message.trim()
	let match = text.match(/^usage\s+capture:\s*(skill|plugin)\s+(.+)$/i)
	if (match) return { kind: match[1].toLowerCase() as 'skill' | 'plugin', target: oneLine(match[2]) }
	match = text.match(/^usage\s+label:\s*(.+)$/i)
	if (match) return { kind: 'label', phrase: oneLine(match[1]) }
	if (/^usage\s+report\s*$/i.test(text)) return { kind: 'report' }
	return null
}

function parseDetails(input: string): { target: string | null; labels: string; verdict: Verdict | null; notes: string | null } {
	const fields = new Map<string, string>()
	const loose: string[] = []
	for (const line of input.split('\n')) {
		const match = line.match(/^\s*([a-zA-Z_ -]+):\s*(.*)$/)
		if (match) fields.set(match[1].trim().toLowerCase().replace(/[ -]/g, '_'), match[2].trim())
		else if (line.trim()) loose.push(line.trim())
	}
	return {
		target: emptyToNull(fields.get('target')),
		labels: fields.get('labels') ?? '',
		verdict: normalizeVerdict(fields.get('verdict')),
		notes: truncateNote(emptyToNull(fields.get('notes')) ?? loose.join(' ')) || null,
	}
}

async function appendEvent(input: {
	threadID: string
	workspace: string | null
	trigger: Trigger
	phase: Phase
	outcome: Outcome
	userIntent: string
	summary: string
	tags: string[]
	artifacts: Artifact[]
	notes?: string | null
	userCorrection?: string
	toolsCalled?: string[]
}): Promise<string> {
	const eventID = makeID('evt')
	const row: EventRow = {
		schema: 'skill-plugin-usage-event/v1',
		event_id: eventID,
		captured_at: new Date().toISOString(),
		thread_id: input.threadID,
		workspace: input.workspace,
		task: {
			user_intent: truncateSummary(input.userIntent),
			summary: truncateSummary(input.summary),
			tags: input.tags,
		},
		artifacts: input.artifacts,
		usage: {
			trigger: input.trigger,
			phase: input.phase,
			outcome: input.outcome,
		},
		evidence: {
			files_changed: [],
			tools_called: input.toolsCalled ?? [],
			checks_run: [],
			...(input.userCorrection ? { user_correction: truncateNote(input.userCorrection) } : {}),
			...(input.notes ? { notes: truncateNote(input.notes) } : {}),
		},
		privacy: {
			contains_raw_transcript: false,
			contains_file_contents: false,
			contains_secrets: false,
		},
	}

	await appendJsonLine(EVENTS_PATH, row)
	return eventID
}

async function appendLabel(input: {
	eventID: string
	target: LabelRow['target']
	labels: string[]
	verdict: Verdict | null
	confidence: Confidence
	notes?: string | null
	supersedesLabelID?: string | null
	labeledBy: LabelRow['labeled_by']
}): Promise<string> {
	const labelID = makeID('lbl')
	const row: LabelRow = {
		schema: 'skill-plugin-usage-label/v1',
		label_id: labelID,
		event_id: input.eventID,
		labeled_at: new Date().toISOString(),
		labeled_by: input.labeledBy,
		target: input.target,
		labels: input.labels,
		verdict: input.verdict,
		confidence: input.confidence,
		notes: input.notes ? truncateNote(input.notes) : null,
		supersedes_label_id: input.supersedesLabelID ?? null,
		superseded_by: null,
	}

	await appendJsonLine(LABELS_PATH, row)
	return labelID
}

async function appendJsonLine(path: string, row: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	await appendFile(path, `${JSON.stringify(row)}\n`, 'utf8')
}

function resolveArtifact(kind: 'skill' | 'plugin' | 'artifact', rawTarget: string): Artifact {
	const target = cleanTarget(rawTarget)
	const candidates = artifactCandidates(kind, target)
	const sourcePath = candidates.find((candidate) => existsSync(join(SOURCE_REPO, candidate))) ?? null
	const runtimePath = sourcePath ? runtimePathFor(sourcePath) : null
	const vcs = gitMetadata(sourcePath)
	return {
		type: sourcePath ? artifactType(sourcePath, kind) : kind,
		id: sourcePath ? sourcePath : target,
		source_repo: sourcePath ? SOURCE_REPO : null,
		source_path: sourcePath,
		runtime_path: runtimePath,
		vcs,
		...(sourcePath ? {} : { notes: `Could not resolve target path for ${target}; stored metadata best-effort.` }),
	}
}

function artifactCandidates(kind: 'skill' | 'plugin' | 'artifact', target: string): string[] {
	const noHash = target.split('#')[0].trim()
	const normalized = noHash.replace(/^plugins\//, 'amp/plugins/').replace(/^docs\/tools\//, 'amp/docs/tools/')
	const slug = basename(noHash).replace(/\.(ts|md)$/i, '')
	const dashed = slugify(slug)
	const explicit = normalized.startsWith('amp/') || normalized.startsWith('skills/') ? [normalized] : []

	if (kind === 'skill') {
		return [...explicit, `skills/${dashed}/SKILL.md`, `skills/${slug}/SKILL.md`]
	}
	if (kind === 'plugin') {
		return [...explicit, `amp/plugins/${dashed}.ts`, `amp/plugins/${slug}.ts`, `amp/docs/tools/${dashed}.md`, `amp/docs/tools/${slug}.md`]
	}
	return [
		...explicit,
		`amp/plugins/${dashed}.ts`,
		`amp/docs/tools/${dashed}.md`,
		`skills/${dashed}/SKILL.md`,
	]
}

function runtimePathFor(sourcePath: string): string | null {
	if (sourcePath.startsWith('amp/plugins/')) return join(RUNTIME_ROOT, 'plugins', basename(sourcePath))
	if (sourcePath.startsWith('amp/docs/')) return join(RUNTIME_ROOT, sourcePath.replace(/^amp\//, ''))
	if (sourcePath === 'amp/AGENTS.md') return join(RUNTIME_ROOT, 'AGENTS.md')
	if (sourcePath.startsWith('skills/')) return join(RUNTIME_ROOT, sourcePath)
	return null
}

function artifactType(sourcePath: string, fallback: string): string {
	if (sourcePath.endsWith('/SKILL.md')) return 'skill'
	if (sourcePath.startsWith('amp/plugins/')) return 'plugin'
	if (sourcePath.startsWith('amp/docs/tools/')) return 'plugin_capability_doc'
	if (sourcePath.endsWith('AGENTS.md')) return 'agents_instructions'
	return fallback
}

function gitMetadata(sourcePath: string | null): { commit: string | null; dirty: boolean | null } {
	const commit = runGit(['rev-parse', 'HEAD'])
	if (!commit) return { commit: null, dirty: null }
	const args = sourcePath ? ['status', '--porcelain', '--', sourcePath] : ['status', '--porcelain']
	const status = runGit(args)
	return { commit, dirty: status === null ? null : status.length > 0 }
}

function runGit(args: string[]): string | null {
	const result = spawnSync('git', args, { cwd: SOURCE_REPO, encoding: 'utf8' })
	if (result.status !== 0) return null
	return result.stdout.trim()
}

function artifactTarget(artifact: Artifact): LabelRow['target'] {
	return {
		scope: 'artifact',
		type: artifact.type,
		id: artifact.id,
		source_repo: artifact.source_repo,
		source_path: artifact.source_path,
		runtime_path: artifact.runtime_path,
		ref: null,
	}
}

function eventTarget(eventID: string): LabelRow['target'] {
	return {
		scope: 'event',
		type: 'usage_event',
		id: eventID,
		source_repo: null,
		source_path: null,
		runtime_path: null,
		ref: null,
	}
}

function resolveLabelTarget(input: unknown, eventID: string): LabelRow['target'] {
	if (typeof input === 'string') {
		const text = input.trim()
		if (!text || text === eventID) return eventTarget(eventID)
		return artifactTarget(resolveArtifact('artifact', text))
	}
	if (input && typeof input === 'object') {
		const obj = input as Record<string, unknown>
		const id = optionalString(obj.id) ?? optionalString(obj.target) ?? eventID
		const scope = optionalString(obj.scope) ?? (id === eventID ? 'event' : 'artifact')
		if (scope === 'event') return eventTarget(id)
		const artifact = resolveArtifact('artifact', id)
		return { ...artifactTarget(artifact), scope }
	}
	return eventTarget(eventID)
}

async function resolveEventID(input: Record<string, unknown>, thread: PluginThread): Promise<string> {
	const direct = optionalString(input.event_id)
	if (direct) return direct
	const relative = optionalString(input.relative_event)
	if (!relative) throw new Error('event_id or relative_event is required')
	if (!/^previous|current$/i.test(relative)) throw new Error('relative_event must be previous or current')

	const events = await readJsonLines<EventRow>(EVENTS_PATH)
	const sameThread = events.filter((row) => row.thread_id === thread.id)
	const event = sameThread[sameThread.length - 1]
	if (!event) throw new Error(`No usage events found for current thread ${thread.id}; pass an event_id.`)
	return event.event_id
}

async function buildReport(): Promise<string> {
	const events = await readJsonLines<EventRow>(EVENTS_PATH)
	const labels = await readJsonLines<LabelRow>(LABELS_PATH)
	const labelCounts = new Map<string, number>()
	for (const row of labels) {
		for (const label of row.labels ?? []) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
	}
	const recent = events.slice(-5).reverse()
	const topLabels = [...labelCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([label, count]) => `${label}:${count}`)
		.join(', ')

	const lines = [
		'Skill/plugin usage report',
		`Events: ${events.length}`,
		`Labels: ${labels.length}${topLabels ? ` (${topLabels})` : ''}`,
	]
	if (recent.length) {
		lines.push('Recent events:')
		for (const row of recent) lines.push(`- ${row.event_id}: ${row.task?.summary ?? '(no summary)'}`)
	} else {
		lines.push('Recent events: none yet')
	}
	return lines.join('\n')
}

async function readJsonLines<T>(path: string): Promise<T[]> {
	let text = ''
	try {
		text = await readFile(path, 'utf8')
	} catch {
		return []
	}
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line) as T)
}

async function compactThreadSeed(thread: PluginThread): Promise<string | null> {
	try {
		const messages = await thread.messages({ from: 'end', limit: 6 })
		const latestUser = [...messages].reverse().find((message) => message.role === 'user')
		return latestUser ? truncateSummary(messageText(latestUser)) : null
	} catch {
		return null
	}
}

function messageText(message: ThreadMessage): string {
	return message.content
		.map((block) => block.type === 'text' ? block.text : '')
		.filter(Boolean)
		.join(' ')
}

function normalizeLabels(value: unknown): string[] {
	const raw = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[,;\n]/)
	const labels = raw.map((item) => normalizeLabel(item)).filter((label): label is string => Boolean(label))
	return [...new Set(labels)]
}

function normalizeLabel(input: string): string | null {
	const key = input.trim().toLowerCase().replace(/[/-]/g, ' ').replace(/\s+/g, '_')
	const aliases: Record<string, string> = {
		helped: 'helped',
		useful: 'helped',
		correctly_triggered: 'correctly_triggered',
		prevented_mistake: 'prevented_mistake',
		improved_output_shape: 'improved_output_shape',
		saved_time: 'saved_time',
		no_op: 'no_op',
		ignored_instruction: 'ignored_instruction',
		wrong_trigger: 'wrong_trigger',
		missed_trigger: 'missed_trigger',
		over_scoped: 'over_scoped',
		too_verbose: 'too_verbose',
		wrong_tool: 'tool_mismatch',
		tool_mismatch: 'tool_mismatch',
		docs_code_drift: 'docs_code_drift',
		unsafe: 'unsafe_or_risky',
		risky: 'unsafe_or_risky',
		unsafe_or_risky: 'unsafe_or_risky',
		had_to_correct: 'user_had_to_correct',
		user_had_to_correct: 'user_had_to_correct',
		not_applicable: 'not_applicable',
		unclear: 'unclear',
		needs_more_examples: 'needs_more_examples',
		needs_more_data: 'needs_more_data',
	}
	return aliases[key] ?? null
}

function defaultVerdict(labels: string[]): Verdict {
	if (labels.some((label) => ['helped', 'correctly_triggered', 'prevented_mistake', 'improved_output_shape', 'saved_time'].includes(label))) return 'keep'
	if (labels.includes('needs_more_data') || labels.includes('unclear')) return 'needs_more_data'
	return 'rewrite'
}

function normalizeVerdict(value: unknown): Verdict | null {
	const verdict = optionalString(value)?.toLowerCase().replace(/[ -]/g, '_')
	return verdict && ['keep', 'rewrite', 'delete', 'split', 'merge', 'needs_more_data'].includes(verdict) ? verdict as Verdict : null
}

function normalizeConfidence(value: unknown): Confidence | null {
	const confidence = optionalString(value)?.toLowerCase()
	return confidence && ['low', 'medium', 'high'].includes(confidence) ? confidence as Confidence : null
}

function outcomeForToolStatus(status: string): Outcome {
	if (status === 'done') return 'completed'
	if (status === 'cancelled') return 'abandoned'
	return 'blocked'
}

function cleanTarget(value: string): string {
	return oneLine(value).replace(/^@/, '').replace(/^`|`$/g, '').trim()
}

function slugify(value: string): string {
	return value.trim().toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '')
}

function makeID(prefix: 'evt' | 'lbl'): string {
	const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')
	return `${prefix}_${ts}_${randomUUID().slice(0, 8)}`
}

function optionalString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function emptyToNull(value: string | undefined): string | null {
	return value && value.trim() ? value.trim() : null
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string | null | undefined): string {
	return truncate(redactSecretish(oneLine(value ?? '')), MAX_SUMMARY_CHARS)
}

function truncateNote(value: string | null | undefined): string {
	return truncate(redactSecretish(oneLine(value ?? '')), MAX_NOTE_CHARS)
}

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function redactSecretish(value: string): string {
	return value.replace(/\b([A-Z0-9_]*(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*\S+/gi, '$1=[redacted]')
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
