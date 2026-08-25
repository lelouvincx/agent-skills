import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..', '..')
const temp = mkdtempSync(join(tmpdir(), 'op-account-selection-test-'))
const binDir = join(temp, 'bin')
const capturePath = join(temp, 'op-capture.json')
const claudeEnvPath = join(temp, 'claude.env')
const piEnvPath = join(temp, 'pi.env')
const fakeOp = join(binDir, 'op')
const fakeAdvisor = join(binDir, 'advisor')

interface RegisteredTool {
	name: string
	execute: (input: Record<string, unknown>, context: { thread: { id: string } }) => Promise<string>
}

interface TestCase {
	name: string
	contents: string
	expectsPersonalAccount: boolean
}

const cases: TestCase[] = [
	{
		name: 'unquoted Agent Secrets assignment',
		contents: 'TEST_TOKEN=op://Agent Secrets/Test Item/credential\n',
		expectsPersonalAccount: true,
	},
	{
		name: 'quoted Agent Secrets assignment',
		contents: 'TEST_TOKEN="op://Agent Secrets/Test Item/credential"\n',
		expectsPersonalAccount: true,
	},
	{
		name: 'other vault assignment',
		contents: 'TEST_TOKEN=op://Other Vault/Test Item/credential\n',
		expectsPersonalAccount: false,
	},
	{
		name: 'comment mentioning Agent Secrets',
		contents: '# TEST_TOKEN=op://Agent Secrets/Test Item/credential\nTEST_TOKEN=op://Other Vault/Test Item/credential\n',
		expectsPersonalAccount: false,
	},
	{
		name: 'mixed active assignments',
		contents: 'TEST_TOKEN=op://Other Vault/Test Item/credential\nSECOND_TOKEN=op://Agent Secrets/Second Item/credential\n',
		expectsPersonalAccount: true,
	},
]

try {
	mkdirSync(binDir)
	writeFileSync(fakeOp, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.writeFileSync(process.env.AMP_OP_CAPTURE_PATH, JSON.stringify(args))
const separator = args.indexOf('--')
if (separator < 0) process.exit(64)
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  const result = spawnSync(args[separator + 1], args.slice(separator + 2), {
    env: process.env,
    input: Buffer.concat(chunks),
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
})
`)
	chmodSync(fakeOp, 0o700)
	writeFileSync(fakeAdvisor, `#!/usr/bin/env node
const path = require('node:path')
const research = { summary: 'summary', answer: 'answer', confidence: 'high', citations: [], risks: [] }
if (path.basename(process.argv[1]) === 'pi') {
  process.stdout.write(JSON.stringify(research))
} else {
  process.stdout.write(JSON.stringify({ type: 'result', result: JSON.stringify(research) }))
}
`)
	chmodSync(fakeAdvisor, 0o700)
	for (const name of ['claude', 'pi']) {
		writeFileSync(join(binDir, name), readFileSync(fakeAdvisor))
		chmodSync(join(binDir, name), 0o700)
	}

	process.env.HOME = temp
	process.env.PATH = `${binDir}:${process.env.PATH}`
	process.env.OP_BIN = fakeOp
	process.env.AMP_OP_CAPTURE_PATH = capturePath
	process.env.AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE = claudeEnvPath
	process.env.AMP_PI_CODE_SUBAGENT_ENV_FILE = piEnvPath
	process.env.AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR = join(temp, 'claude-audit')
	process.env.AMP_PI_CODE_SUBAGENT_AUDIT_DIR = join(temp, 'pi-audit')
	process.env.AMP_AGENT_TOKEN_USAGE_LOG = join(temp, 'usage.jsonl')

	writeFileSync(claudeEnvPath, cases[0].contents)
	writeFileSync(piEnvPath, cases[0].contents)

	const [{ default: claudePlugin }, { default: piPlugin }] = await Promise.all([
		import(join(root, 'amp', 'plugins', 'claude-code-subagent.ts')),
		import(join(root, 'amp', 'plugins', 'pi-code-subagent.ts')),
	])
	const claudeTool = register(claudePlugin, 'claude_code_subagent')
	const piTool = register(piPlugin, 'pi_code_subagent')

	for (const testCase of cases) {
		for (const [name, tool, envPath] of [
			['Claude', claudeTool, claudeEnvPath],
			['Pi', piTool, piEnvPath],
		] as const) {
			writeFileSync(envPath, testCase.contents)
			const result = JSON.parse(await tool.execute({
				mode: 'research',
				brief: 'Test account selection.',
				workingDirectory: root,
			}, { thread: { id: `T-${name.toLowerCase()}-op-account-test` } })) as { ok?: boolean; error?: string }
			assert(result.ok === true, `${name} failed for ${testCase.name}: ${result.error ?? 'unknown error'}`)
			const args = JSON.parse(readFileSync(capturePath, 'utf8')) as string[]
			assertAccountArgs(args, testCase.expectsPersonalAccount, `${name}: ${testCase.name}`)
		}
	}

	console.log('1Password account selection tests passed')
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

function assertAccountArgs(args: string[], expected: boolean, label: string): void {
	const accountIndex = args.indexOf('--account')
	if (expected) {
		assert(accountIndex >= 0, `${label} must pass --account`)
		assert(args[accountIndex + 1] === 'my.1password.com', `${label} must select my.1password.com`)
	} else {
		assert(accountIndex === -1, `${label} must not force the personal account`)
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}
