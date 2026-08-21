// @amp-plugin — GPT-5.5 agent modes.
// @amp-agent-mode {"key":"gpt-5-5-medium","label":"GPT-5.5 Medium"}
// @amp-agent-mode {"key":"gpt-5-5-xhigh","label":"GPT-5.5 XHigh"}

import type { PluginAPI } from '@ampcode/plugin'
import { DEEP_PROMPT, DEEP_TOOLS } from './deep-classic'

export const description = 'Adds GPT-5.5 agent modes with medium and xhigh reasoning effort.'

const modes = [
	{
		key: 'gpt-5-5-medium',
		label: 'GPT-5.5 Medium',
		reasoningEffort: 'medium',
		color: '#10a37f',
	},
	{
		key: 'gpt-5-5-xhigh',
		label: 'GPT-5.5 XHigh',
		reasoningEffort: 'xhigh',
		color: '#67ffa8',
	},
] as const

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	for (const mode of modes) {
		const agent = amp.experimental.createAgent({
			name: mode.key,
			model: 'openai/gpt-5.5',
			instructions: DEEP_PROMPT,
			tools: DEEP_TOOLS,
			reasoningEffort: mode.reasoningEffort,
			display: { label: mode.label, color: mode.color },
		})

		amp.experimental.registerAgentMode({
			key: mode.key,
			label: mode.label,
			description: `GPT-5.5 with ${mode.reasoningEffort} reasoning effort.`,
			color: mode.color,
			agent: agent.definition,
		})
	}
}
