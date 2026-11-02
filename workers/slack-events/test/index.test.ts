import { afterEach, expect, test } from 'bun:test'
import { handle, slackSignature, type WorkerEnv } from '../src/index'

const NOW = 1_793_600_000
const SECRET = 'signing-secret'
const BEARER = 'worker-secret'
const SELF = 'U083NKXG3A7'
const THREAD = 'T-01a19a30-053f-760a-9a0d-365f37f2e266'
const OTHER_THREAD = 'T-01a19a82-5ec5-7176-9359-de97c21635c6'
const HOOK = 'https://ampcode.com/api/plugin-triggers/abc/def'
const ROOT = '1793590000.000100'
const originalFetch = globalThis.fetch

function makeEnv() {
	const store = new Map<string, { value: string; ttl?: number }>()
	const env: WorkerEnv = {
		WATCHES: {
			async get(key) { return store.get(key)?.value ?? null },
			async put(key, value, options) { store.set(key, { value, ttl: options?.expirationTtl }) },
			async delete(key) { store.delete(key) },
		},
		SLACK_SIGNING_SECRET: SECRET,
		SLACK_AMP_WORKER_SECRET: BEARER,
		SLACK_SELF_USER_ID: SELF,
	}
	return { env, store }
}

function watch(store: Map<string, { value: string }>, ampThread = THREAD) {
	store.set(`watch:C0123:${ROOT}`, { value: JSON.stringify({ amp_thread: ampThread, webhook_url: HOOK, expires_at: NOW + 3600 }) })
}

async function slack(env: WorkerEnv, payload: unknown, { timestamp = NOW, secret = SECRET } = {}) {
	const body = JSON.stringify(payload)
	return handle(new Request('https://w.example/slack/events', {
		method: 'POST',
		headers: { 'x-slack-request-timestamp': String(timestamp), 'x-slack-signature': await slackSignature(secret, String(timestamp), body) },
		body,
	}), env, NOW)
}

function amp(status = 200) {
	const calls: { url: string; headers: Headers; body: any }[] = []
	globalThis.fetch = Object.assign(async (input: any, init?: RequestInit) => {
		calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) })
		return new Response('', { status })
	}, { preconnect: originalFetch.preconnect })
	return calls
}

const reply = (fields: Record<string, unknown> = {}) => ({
	type: 'event_callback', event_id: 'Ev1',
	event: { type: 'message', channel: 'C0123', user: 'U0456', text: 'hi', ts: '1793590123.000200', thread_ts: ROOT, ...fields },
})
const reaction = (ts: string, user = 'U0456') => ({
	type: 'event_callback', event_id: 'Ev2',
	event: { type: 'reaction_added', user, reaction: 'eyes', item: { type: 'message', channel: 'C0123', ts } },
})

afterEach(() => { globalThis.fetch = originalFetch })

test('answers url_verification only with a valid, fresh signature', async () => {
	const { env } = makeEnv()
	const challenge = { type: 'url_verification', challenge: 'abc123' }
	expect(await (await slack(env, challenge)).text()).toBe('abc123')
	expect((await slack(env, challenge, { secret: 'wrong' })).status).toBe(401)
	expect((await slack(env, challenge, { timestamp: NOW - 301 })).status).toBe(401)
})

test('forwards a reply in a watched thread with the event ID as idempotency key and records the reply', async () => {
	const { env, store } = makeEnv()
	watch(store)
	const calls = amp()
	const response = await slack(env, reply())
	expect(response.status).toBe(200)
	expect(calls).toHaveLength(1)
	expect(calls[0].url).toBe(HOOK)
	expect(calls[0].headers.get('idempotency-key')).toBe('Ev1')
	expect(calls[0].body).toEqual({ event_id: 'Ev1', kind: 'reply', channel: 'C0123', thread_ts: ROOT, ts: '1793590123.000200', user: 'U0456' })
	expect(calls[0].body).not.toHaveProperty('text')
	expect(store.get('msg:C0123:1793590123.000200')?.value).toBe(`watch:C0123:${ROOT}`)
})

test('ignores roots, edits, bots, unwatched threads and the agent\'s own [AI] replies', async () => {
	const { env, store } = makeEnv()
	watch(store)
	const calls = amp()
	await slack(env, reply({ ts: ROOT }))
	await slack(env, reply({ subtype: 'message_changed' }))
	await slack(env, reply({ bot_id: 'B1' }))
	await slack(env, reply({ thread_ts: '1793590999.000100' }))
	await slack(env, reply({ user: SELF, text: '[AI] Thanks' }))
	expect(calls).toHaveLength(0)
	await slack(env, reply({ user: SELF, text: 'Chinh typed this himself' }))
	expect(calls).toHaveLength(1)
})

test('forwards reactions on the root and on recorded replies with the root thread_ts', async () => {
	const { env, store } = makeEnv()
	watch(store)
	store.set('msg:C0123:1793590123.000200', { value: `watch:C0123:${ROOT}` })
	const calls = amp()
	await slack(env, reaction(ROOT))
	await slack(env, reaction('1793590123.000200'))
	await slack(env, reaction('1793590555.000300'))
	await slack(env, reaction(ROOT, SELF))
	expect(calls.map(c => [c.body.kind, c.body.thread_ts, c.body.ts, c.body.reaction])).toEqual([
		['reaction', ROOT, ROOT, 'eyes'],
		['reaction', ROOT, '1793590123.000200', 'eyes'],
	])
})

test('drops the watch when Amp reports the thread archived, and asks Slack to retry on Amp failure', async () => {
	const { env, store } = makeEnv()
	watch(store)
	amp(500)
	expect((await slack(env, reply())).status).toBe(500)
	expect(store.has(`watch:C0123:${ROOT}`)).toBe(true)
	amp(404)
	expect((await slack(env, reply())).status).toBe(200)
	expect(store.has(`watch:C0123:${ROOT}`)).toBe(false)
})

async function watches(env: WorkerEnv, method: string, body: unknown, auth = `Bearer ${BEARER}`) {
	return handle(new Request('https://w.example/watches', { method, headers: { authorization: auth }, body: JSON.stringify(body) }), env, NOW)
}

test('manages watches with bearer auth, validation and per-thread ownership', async () => {
	const { env, store } = makeEnv()
	const valid = { channel: 'C0123', thread_ts: ROOT, amp_thread: THREAD, webhook_url: HOOK, days: 2 }
	expect((await watches(env, 'PUT', valid, 'Bearer nope')).status).toBe(401)
	expect((await watches(env, 'PUT', { ...valid, webhook_url: 'https://evil.example/x' })).status).toBe(400)
	expect((await watches(env, 'PUT', { ...valid, days: 31 })).status).toBe(400)
	expect((await watches(env, 'PUT', valid)).status).toBe(200)
	expect(store.get(`watch:C0123:${ROOT}`)?.ttl).toBe(2 * 86400)
	expect((await watches(env, 'PUT', { ...valid, amp_thread: OTHER_THREAD })).status).toBe(409)
	expect((await watches(env, 'DELETE', { ...valid, amp_thread: OTHER_THREAD })).status).toBe(409)
	expect((await watches(env, 'DELETE', valid)).status).toBe(200)
	expect(store.has(`watch:C0123:${ROOT}`)).toBe(false)
})
