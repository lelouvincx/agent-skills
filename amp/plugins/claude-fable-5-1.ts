// @amp-plugin — Claude Fable 5.1 agent mode.
// @amp-agent-mode {"key":"claude-fable-5-1","label":"Claude Fable 5.1"}

import type { PluginAPI } from '@ampcode/plugin'

export const description = 'Adds Claude Fable 5.1 as an Amp high-mode agent.'

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	const agent = amp.experimental.createAgent({
		extends: 'high',
		model: 'anthropic/claude-fable-5-1',
		display: { label: 'Claude Fable 5.1', color: '#d97706' },
	})

	amp.experimental.registerAgentMode({
		key: 'claude-fable-5-1',
		label: 'Claude Fable 5.1',
		description:
			'Runs Amp high mode on Claude Fable 5.1. Use for ambitious coding work that needs Fable.',
		color: '#d97706',
		agent: agent.definition,
	})
}
