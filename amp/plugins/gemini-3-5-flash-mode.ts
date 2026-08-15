// @amp-plugin — Gemini 3.5 Flash agent mode.
// @amp-agent-mode {"key":"gemini-3-5-flash","label":"Gemini 3.5 Flash"}

// Uses the same system prompt and tool list as the deprecated built-in Deep
// mode (deep-classic.ts), but backed by Gemini 3.5 Flash with xhigh reasoning.

import type { PluginAPI } from '@ampcode/plugin'
import { DEEP_PROMPT, DEEP_TOOLS } from './deep-classic'

export default function (amp: PluginAPI) {
	if (!amp.experimental) {
		amp.logger.log('Experimental plugin API is not available.')
		return
	}

	const agent = amp.experimental.createAgent({
		name: 'gemini-3-5-flash',
		model: 'google-vertex/gemini-3.5-flash',
		instructions: DEEP_PROMPT,
		tools: DEEP_TOOLS,
		reasoningEffort: 'xhigh',
		display: { label: 'Gemini 3.5 Flash', color: '#4285f4' },
	})

	amp.experimental.registerAgentMode({
		key: 'gemini-3-5-flash',
		label: 'Gemini 3.5 Flash',
		description: 'Gemini 3.5 Flash-driven agent mode with xhigh reasoning.',
		color: '#4285f4',
		agent: agent.definition,
	})
}
