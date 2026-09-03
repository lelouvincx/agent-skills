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

The user manually selected Logseq: Log Current Task. Complete it now.

Call the built-in Task tool as your next action. Task starts with fresh context. Put one concise, self-contained handoff and the bounded execution contract directly in the Task prompt, using these sections in order:

### Parent handoff

Synthesize from your live conversation context. Include each material fact once:
- original user intent and any later redirect that changes it
- latest coherent requested outcome
- work completed and its durable result
- current task state and one concrete next action when follow-up remains
- decisions, known blockers, and authority still required
- actual task inputs and important deliverables, including relevant Slack, Notion, Linear, GitHub, Read AI, customer-document, design-document, or Amp-thread links

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

Tell Task:

"Treat the Parent handoff as the primary intent source. If one named material intent fact required for safe logging is absent, use read_thread only to retrieve that fact when the tool is available. If the tool is unavailable, report the missing fact as the blocker. Continue from the Parent handoff for all other intent."

### Logging contract

Copy every numbered requirement below into the Task prompt:
1. Read ${logseqRepo}/pages/Canonical Pages.md, then the relevant canonical project and rule pages, especially Projects.md and Backlog.md. Use them as the source of truth for project taxonomy, priority, task state, placement, and active Backlog matches.
2. Search Backlog.md for every actionable task whose direct input:: contains ${parentThreadID}. If exactly one exists, update it. If none exists, create one. If several exist, reconcile them into one only when every durable fact can be preserved; otherwise stop and report the duplicate task locations as the blocker. Finish with exactly one actionable parent-linked task.
3. Write the durable task or outcome to Backlog.md first. Preserve valid existing fields and surrounding indentation. Do not modify unrelated blocks.
4. Every new task must have direct id:: <uuid>, project:: [[...]], priority:: #P..., input:: ..., and updated-at:: ${today.isoDate}. Generate a unique stable UUID. Use [[Personal]] only when no more specific canonical project applies.
5. Preserve a Linear issue ID in direct linear:: when one exists. Treat only DAT-, PS-, and DOC- IDs as Linear team IDs.
6. An active task must have one concrete direct next-action::. Add blocker:: only for a known blocker or waiting condition. A DONE task must have completed:: [[${today.isoDate}]] and no next-action:: or blocker::.
7. Keep actual source and deliverable links in the task's direct input::. Always include [Ampcode](${parentThreadID}). Use numbered labels when there are multiple links, deduplicate equivalent links, and omit incidental research links.
8. Record the durable result as a directly nested activity bullet with its own stable id:: <uuid>, observed-at:: ${today.isoDate}, and non-empty outcome::. Add decision:: and input:: when the parent brief supports them.
9. Add or update one brief journal pointer to the same task UUID under ### Done when complete, ### Tasks when follow-up remains, or ### Notes when informational. Keep the journal entry as a pointer, not a duplicate task.
10. Keep the Backlog task short. Do not paste the parent synthesis, transcript, or private reasoning.
11. Re-read Backlog.md and today's journal after mutation. Report Backlog verified only after finding exactly one actionable parent-linked task with one unique UUID, all required direct fields, valid state-specific fields, and today's directly nested activity. Report journal verified only after finding a block reference to that same task UUID.
12. Before finishing, check that a fresh agent could understand every recorded fact, answer status and history questions, and take the next action without asking the user to repeat known context. Repair missing durable context before final read-back.
13. Only after both files pass read-back, update parent thread ${parentThreadID}. Derive the exact title as [Project] task title and preserve any Linear ID immediately after the project prefix. Add a normalized label for the Backlog project, plus customer-... when applicable. When Parent workspace is not (none), also add a working-project label: resolve its directory name with project-resolve <directory-name> --json and use the registry key, falling back to the normalized directory name. Normalize labels to lowercase words joined with hyphens, omit punctuation, limit each label to 32 characters, remove trailing hyphens and duplicates, preserve existing labels, and add no priority or task-state label. Run amp threads rename and amp threads label. Report parent metadata verified only when both commands succeed.
14. Do not commit, push, run weekly report automation, or make unrelated changes.
15. Return a compact evidence report containing:
- task UUID, title, state, Backlog path, journal path, and concise outcome
- Backlog verification: parent-linked task count, UUID uniqueness result, required direct-field result, state-specific-field result, and today's activity UUID and date
- journal verification: the task UUID referenced by the journal pointer
- parent metadata: separate rename and label command results
If blocked, name the exact blocker and the smallest parent or user input needed. Return this report as Task's final result to the parent.

After Task returns, verify that its report contains every item required by requirement 15 and that each successful verification includes the listed evidence. When the evidence is complete, reply in this parent thread with what was logged, the task UUID and state, whether both files were verified, whether parent metadata was updated, and any blocker. If evidence is missing or a safe local repair remains, call one focused Task with the Parent handoff, Runtime context, Optional user hint, prior report, and unmet requirements. That Task owns the file re-read or repair and returns a revised report. Keep Task calls serial.`
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
