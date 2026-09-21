// @amp-plugin — Claude Opus 4.7 agent mode.
// @amp-agent-mode {"key":"claude-opus-4-7","label":"Claude Opus 4.7"}

import type { PluginAPI } from '@ampcode/plugin'

export const description = 'Adds Claude Opus 4.7 as an Amp high-mode agent.'

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	const agent = amp.experimental.createAgent({
		extends: 'high',
		model: 'anthropic/claude-opus-4-7',
		display: { label: 'Claude Opus 4.7', color: '#c2410c' },
	})

	amp.experimental.registerAgentMode({
		key: 'claude-opus-4-7',
		label: 'Claude Opus 4.7',
		description:
			'Runs Amp high mode on Claude Opus 4.7. Use for coding work that needs Opus 4.7.',
		color: '#c2410c',
		agent: agent.definition,
	})
}
