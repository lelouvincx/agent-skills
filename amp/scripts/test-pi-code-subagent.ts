import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dir, '..', '..')
const temp = mkdtempSync(join(tmpdir(), 'pi-code-subagent-test-'))
const binDir = join(temp, 'bin')
const repo = join(temp, 'repo')
const promptPath = join(temp, 'pi-prompt.txt')

interface RegisteredTool {
	name: string
	execute: (input: Record<string, unknown>, context: { thread: { id: string } }) => Promise<string>
}

try {
	mkdirSync(binDir)
	mkdirSync(repo)
	writeFileSync(join(binDir, 'pi'), `#!/usr/bin/env node
const fs = require('node:fs')
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.AMP_PI_PROMPT_CAPTURE, Buffer.concat(chunks))
  process.stdout.write(JSON.stringify({ summary: 'summary', recommendation: 'apply', confidence: 'high', findings: [], tests: [], risks: [] }))
})
`)
	chmodSync(join(binDir, 'pi'), 0o700)

	run(repo, 'git', 'init')
	run(repo, 'git', 'config', 'user.email', 'agent@example.com')
	run(repo, 'git', 'config', 'user.name', 'Agent Test')
	writeFileSync(join(repo, 'file.txt'), 'one\n')
	run(repo, 'git', 'add', 'file.txt')
	run(repo, 'git', 'commit', '-m', 'initial')
	writeFileSync(join(repo, 'file.txt'), 'one\ntwo\n')
	writeFileSync(join(repo, 'untracked.txt'), 'new\n')

	process.env.PATH = `${binDir}:${process.env.PATH}`
	process.env.HOME = temp
	process.env.AMP_PI_PROMPT_CAPTURE = promptPath
	process.env.AMP_PI_CODE_SUBAGENT_AUDIT_DIR = join(temp, 'audit')
	process.env.AMP_AGENT_TOKEN_USAGE_LOG = join(temp, 'usage.jsonl')

	const { default: piPlugin } = await import(join(root, 'amp', 'plugins', 'pi-code-subagent.ts'))
	const tool = register(piPlugin, 'pi_code_subagent')
	const result = JSON.parse(await tool.execute({
		mode: 'review',
		brief: 'Review the current diff.',
		workingDirectory: repo,
	}, { thread: { id: 'T-pi-code-subagent-test' } })) as { ok?: boolean; error?: string }
	assert(result.ok === true, result.error ?? 'Pi review should succeed')

	const prompt = readFileSync(promptPath, 'utf8')
	assert(prompt.includes('Built-in Git diff from Amp'), 'review without context must include built-in Git diff context')
	assert(prompt.includes('Tracked diff against HEAD'), 'default review context must include tracked diff heading')
	assert(prompt.includes('+two'), 'default review context must include tracked file changes')
	assert(prompt.includes('"untracked.txt"'), 'default review context must include untracked path names')

	console.log('Pi Code subagent regression tests passed')
} finally {
	rmSync(temp, { recursive: true, force: true })
}

function register(plugin: (amp: never) => void, toolName: string): RegisteredTool {
	const tools: RegisteredTool[] = []
	plugin({ registerTool(tool: RegisteredTool) { tools.push(tool) } } as never)
	const tool = tools.find((candidate) => candidate.name === toolName)
	assert(tool, `${toolName} must register`)
	return tool
}

function run(cwd: string, command: string, ...args: string[]): void {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}
