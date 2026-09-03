// @amp-plugin — Grok 4.6 Max agent mode.
// @amp-agent-mode {"key":"grok-4-6-max","label":"Grok 4.6 Max"}

import type { PluginAPI } from '@ampcode/plugin'
import { FABLE_AGENT_PROMPT, FABLE_TOOL_NAMES } from './gpt-5-5-modes'

export const description = 'Adds Grok 4.6 with max reasoning effort.'

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	const agent = amp.experimental.createAgent({
		name: 'grok-4-6-max',
		model: 'xai/grok-4.6',
		instructions: FABLE_AGENT_PROMPT,
		tools: FABLE_TOOL_NAMES,
		reasoningEffort: 'max',
		display: { label: 'Grok 4.6 Max', color: '#0ea5e9' },
	})

	amp.experimental.registerAgentMode({
		key: 'grok-4-6-max',
		label: 'Grok 4.6 Max',
		description: 'Grok 4.6 with max reasoning effort.',
		color: '#0ea5e9',
		agent: agent.definition,
	})
}
