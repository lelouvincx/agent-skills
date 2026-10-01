// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// logseq-manual-log — command-palette action that asks the active parent
// agent to brief a native Task subagent from its current conversation context.

import type { PluginAPI, PluginCommandContext, ThreadID } from '@ampcode/plugin'

const LOGSEQ_REPO = process.env.AMP_LOGSEQ_GRAPH_DIR ?? '/Users/lelouvincx/Developer/second-brain-logseq'

type LogContext = Pick<PluginCommandContext, 'thread'>

export default function (amp: PluginAPI) {
	amp.logger.log(`[logseq-manual-log] plugin loaded → ${LOGSEQ_REPO}`)

	amp.registerCommand(
		'logseq-log-current-task',
		{
			title: 'Log Current Task',
			category: 'Logseq',
			description: 'Ask this thread to delegate its current task to a Logseq logging subagent.',
		},
		async (ctx) => {
			if (!ctx.thread) {
				await ctx.ui.notify('Open an Amp thread before running Logseq: Log Current Task.')
				return
			}

			const hint = await ctx.ui.input({
				title: 'Log current task to Logseq',
				message:
					'Optional target, note, or source link, e.g. "update DAT-594" or a Slack/PR/Notion URL. Leave blank to infer from this thread.',
				placeholder: 'Optional Logseq target / context / source links',
				submitButtonText: 'Log to Logseq',
			})

			if (hint === undefined) {
				await ctx.ui.notify('Logseq logging cancelled.')
				return
			}

			try {
				const parentWorkspace = ctx.system.workspaceRoot
					? amp.helpers.filePathFromURI(ctx.system.workspaceRoot)
					: '(none)'
				await queueLogCurrentTask(ctx, hint.trim(), parentWorkspace)
				await ctx.ui.notify('Logseq logging queued in this thread. The parent agent will delegate it through Task.')
			} catch (error) {
				amp.logger.log(`[logseq-manual-log] parent turn delivery failed: ${errorMessage(error)}`)
				await ctx.ui.notify(`Could not queue Logseq logging: ${errorMessage(error)}`)
			}
		},
	)
}

export async function queueLogCurrentTask(
	ctx: LogContext,
	hint: string,
	parentWorkspace: string,
	logseqRepo = LOGSEQ_REPO,
	now = new Date(),
): Promise<void> {
	if (!ctx.thread) {
		throw new Error('Open an Amp thread before running Logseq: Log Current Task.')
	}

	await ctx.thread.appendUserMessage({
		type: 'user-message',
		content: buildParentTaskPrompt(ctx.thread.id, hint, parentWorkspace, logseqRepo, now),
	})
}

export function buildParentTaskPrompt(
	parentThreadID: ThreadID,
	hint: string,
	parentWorkspace: string,
	logseqRepo = LOGSEQ_REPO,
	now = new Date(),
): string {
	const today = localDateParts(now)
	return `[logseq-log-current-task]

The user ran Logseq: Log Current Task. Finish these steps in this turn:

1. Call the built-in Task tool as your next action. Task starts with fresh context, so its prompt is the whole handoff. Build that prompt from the 5 sections below, in order.
2. When Task returns, check its report against requirement 12. When evidence is missing or a safe local repair remains, call one focused Task with the Parent handoff, Runtime context, Optional user hint, prior report, and unmet requirements. That Task owns the file re-read or repair and returns a revised report.
3. When the evidence is complete, reply in this thread with what was logged, the task UUID and state, whether both files passed read-back, whether parent metadata was updated, and any blocker.

Keep Task calls serial.

### Parent handoff

Write this section from your live conversation context. Include each material fact once:
- original user intent and any later redirect that changes it
- latest requested outcome
- work completed and its durable result
- current state and one concrete next action when follow-up remains
- decisions, known blockers, and authority still required
- actual task inputs and important deliverables: Slack, Notion, Linear, GitHub, Read AI, customer-document, design-document, or Amp-thread links

### Runtime context

- Parent Amp thread: ${parentThreadID}
- Parent workspace: ${parentWorkspace}
- Logseq graph: ${logseqRepo}
- Backlog: ${logseqRepo}/pages/Backlog.md
- Today's date: ${today.isoDate}
- Today's journal: ${logseqRepo}/journals/${today.journalFile}

### Optional user hint

${hint || '(none)'}

### Intent boundary

Copy this paragraph:

"Treat the Parent handoff as the primary intent source. When one material fact needed for safe logging is missing, use read_thread only to retrieve that fact. When read_thread is unavailable, report the missing fact as the blocker."

### Logging contract

Copy these requirements verbatim. The parent-linked task is an actionable Backlog task whose direct input:: contains ${parentThreadID}.

1. Read ${logseqRepo}/pages/Canonical Pages.md, then the relevant project and rule pages, especially Projects.md and Backlog.md. Follow them for project taxonomy, priority, task state, placement, and Backlog matches.
2. Search Backlog.md for parent-linked tasks. If exactly one exists, update it. If none exists, create one. If several exist, reconcile them into one only when every durable fact survives; otherwise stop and report their locations as the blocker. Finish with exactly one actionable parent-linked task.
3. Write the durable task or outcome to Backlog.md first. In Backlog.md, edit only parent-linked tasks and their children, and keep valid existing fields and indentation.
4. Give the task these direct fields:
   - id:: <uuid>, unique and stable
   - project:: [[...]], using [[Personal]] only when no more specific canonical project applies
   - priority:: #P...
   - input:: with the actual source and deliverable links, always including [Ampcode](${parentThreadID}); number multiple links, deduplicate them, and leave out incidental research links
   - updated-at:: ${today.isoDate}
   - linear:: when a Linear ID exists; only DAT-, PS-, and DOC- are Linear team IDs
5. Set the state fields. An active task has one concrete direct next-action::, plus blocker:: only for a known blocker or wait. A DONE task has completed:: [[${today.isoDate}]] and drops next-action:: and blocker::.
6. Nest one activity bullet directly under the task with its own id:: <uuid>, observed-at:: ${today.isoDate}, and non-empty outcome::. Add decision:: and input:: when the handoff supports them.
7. Keep the task to the durable facts a fresh agent needs to answer status and history questions and take the next action without asking the user again. Leave the handoff text, transcript, and private reasoning out.
8. Add or update one journal pointer to the same task UUID in today's journal: under ### Done when complete, ### Tasks when follow-up remains, or ### Notes when informational. The pointer is a block reference, not a copy of the task.
9. Re-read Backlog.md and today's journal after mutation. Backlog passes read-back when requirements 2 to 7 hold. The journal passes read-back when it holds a block reference to the task UUID. Repair any failure, then re-read.
10. Only after both files pass read-back, update parent thread ${parentThreadID}:
   - title: [Project] task title, with any Linear ID right after the project prefix
   - labels: the Backlog project; customer-... when applicable; and, unless Parent workspace is (none), the working project from project-resolve <directory-name> --json, falling back to the normalized directory name
   - label format: lowercase words joined with hyphens, no punctuation, at most 32 characters, no trailing hyphen; keep existing labels, skip duplicates, and add only project and customer labels
   Run amp threads rename and amp threads label. Metadata passes when both commands succeed.
11. Limit changes to the Logseq task, the journal pointer, and parent thread metadata. Leave commits, pushes, and weekly report automation to the user.
12. Return a compact evidence report:
   - task UUID, title, state, Backlog path, journal path, and concise outcome
   - Backlog verification: parent-linked task count, UUID uniqueness result, required direct-field result, state-specific-field result, and today's activity UUID and date
   - journal verification: the task UUID referenced by the journal pointer
   - parent metadata: rename and label results, reported separately
   - when blocked: the exact blocker and the smallest parent or user input needed`
}

function localDateParts(now: Date): { isoDate: string; journalFile: string } {
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return {
		isoDate: `${year}-${month}-${day}`,
		journalFile: `${year}_${month}_${day}.md`,
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
