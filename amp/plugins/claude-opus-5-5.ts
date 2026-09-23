// @amp-plugin — Claude Opus 5.5 agent mode.
// @amp-agent-mode {"key":"claude-opus-5-5","label":"Claude Opus 5.5"}

import type { PluginAPI } from '@ampcode/plugin'

export const description = 'Adds Claude Opus 5.5 as an Amp high-mode agent.'

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	const agent = amp.experimental.createAgent({
		extends: 'high',
		model: 'anthropic/claude-opus-5-5',
		oracle: { model: 'openai/gpt-6-astra', effort: 'medium' },
		subagents: { model: 'openai/gpt-5.6-sol', effort: 'medium' },
		display: { label: 'Claude Opus 5.5', color: '#7c3aed' },
	})

	amp.experimental.registerAgentMode({
		key: 'claude-opus-5-5',
		label: 'Claude Opus 5.5',
		description:
			'Runs Amp high mode on Claude Opus 5.5. Use for coding work that needs Opus 5.5.',
		color: '#7c3aed',
		agent: agent.definition,
	})
}
