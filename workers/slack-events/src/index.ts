// RFC-0016: Slack Events API -> watch filter -> per-thread Amp webhook.
// The Worker stores channel IDs, timestamps, Amp thread IDs and webhook URLs only, never message text.

export interface WorkerEnv {
	WATCHES: KVNamespace
	SLACK_SIGNING_SECRET: string
	SLACK_AMP_WORKER_SECRET: string
	SLACK_SELF_USER_ID: string
}

type KVNamespace = {
	get(key: string): Promise<string | null>
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
	delete(key: string): Promise<void>
}

type Watch = { amp_thread: string; webhook_url: string; expires_at: number }

const CHANNEL = /^[CG][A-Z0-9]{2,20}$/
const TS = /^\d{10}\.\d{6}$/
const THREAD = /^T-[0-9a-f-]{36}$/
const WEBHOOK_PREFIX = 'https://ampcode.com/api/plugin-triggers/'
const MAX_SKEW_SECONDS = 300
const FORWARD_TIMEOUT_MS = 2500
const MIN_KV_TTL = 60

const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
const watchKey = (channel: string, threadTs: string) => `watch:${channel}:${threadTs}`
const msgKey = (channel: string, ts: string) => `msg:${channel}:${ts}`

function hex(buffer: ArrayBuffer) {
	return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function equal(a: string, b: string) {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

export async function slackSignature(secret: string, timestamp: string, body: string) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
	return 'v0=' + hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`)))
}

async function verifiedSlack(request: Request, body: string, env: WorkerEnv, now: number) {
	const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''
	const signature = request.headers.get('x-slack-signature') ?? ''
	if (!/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) return false
	return equal(signature, await slackSignature(env.SLACK_SIGNING_SECRET, timestamp, body))
}

function ttl(expiresAt: number, now: number) {
	return Math.max(MIN_KV_TTL, Math.floor(expiresAt - now))
}

async function readWatch(env: WorkerEnv, key: string): Promise<Watch | null> {
	const raw = await env.WATCHES.get(key)
	return raw ? (JSON.parse(raw) as Watch) : null
}

type Forward = { event_id: string; kind: 'reply' | 'reaction'; channel: string; thread_ts: string; ts: string; user: string; reaction?: string }

async function forward(env: WorkerEnv, key: string, watch: Watch, envelope: Forward): Promise<Response> {
	let response: Response
	try {
		response = await fetch(watch.webhook_url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': envelope.event_id },
			body: JSON.stringify(envelope),
			signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
		})
	} catch {
		return text('amp unavailable', 500)
	}
	if (response.status === 404) {
		// The owning Amp thread is archived: drop its watch so later events stop here.
		await env.WATCHES.delete(key)
		return text('watch removed')
	}
	return response.ok ? text('forwarded') : text('amp rejected', 500)
}

async function handleEvent(payload: any, env: WorkerEnv, now: number): Promise<Response> {
	const eventId = typeof payload.event_id === 'string' ? payload.event_id : ''
	const event = payload.event ?? {}
	if (!eventId) return text('ignored')

	if (event.type === 'message') {
		const { channel, ts, thread_ts: threadTs, user, subtype } = event
		if (subtype !== undefined && subtype !== 'thread_broadcast') return text('ignored')
		if (event.bot_id || typeof user !== 'string') return text('ignored')
		if (!CHANNEL.test(channel ?? '') || !TS.test(ts ?? '') || !TS.test(threadTs ?? '') || ts === threadTs) return text('ignored')
		if (user === env.SLACK_SELF_USER_ID && typeof event.text === 'string' && event.text.startsWith('[AI] ')) return text('ignored')
		const key = watchKey(channel, threadTs)
		const watch = await readWatch(env, key)
		if (!watch) return text('ignored')
		await env.WATCHES.put(msgKey(channel, ts), key, { expirationTtl: ttl(watch.expires_at, now) })
		return forward(env, key, watch, { event_id: eventId, kind: 'reply', channel, thread_ts: threadTs, ts, user })
	}

	if (event.type === 'reaction_added') {
		const item = event.item ?? {}
		const { channel, ts } = item
		if (item.type !== 'message' || !CHANNEL.test(channel ?? '') || !TS.test(ts ?? '')) return text('ignored')
		if (typeof event.user !== 'string' || event.user === env.SLACK_SELF_USER_ID) return text('ignored')
		if (typeof event.reaction !== 'string' || !/^[a-z0-9_+:'-]{1,100}$/.test(event.reaction)) return text('ignored')
		const key = (await readWatch(env, watchKey(channel, ts))) ? watchKey(channel, ts) : await env.WATCHES.get(msgKey(channel, ts))
		const watch = key ? await readWatch(env, key) : null
		if (!key || !watch) return text('ignored')
		const threadTs = key.split(':')[2]
		return forward(env, key, watch, { event_id: eventId, kind: 'reaction', channel, thread_ts: threadTs, ts, user: event.user, reaction: event.reaction })
	}

	return text('ignored')
}

async function handleWatches(request: Request, env: WorkerEnv, now: number): Promise<Response> {
	const auth = request.headers.get('authorization') ?? ''
	if (!env.SLACK_AMP_WORKER_SECRET || !equal(auth, `Bearer ${env.SLACK_AMP_WORKER_SECRET}`)) return text('unauthorized', 401)
	let body: any
	try { body = await request.json() } catch { return text('invalid json', 400) }
	const { channel, thread_ts: threadTs, amp_thread: ampThread } = body ?? {}
	if (!CHANNEL.test(channel ?? '') || !TS.test(threadTs ?? '') || !THREAD.test(ampThread ?? '')) return text('invalid watch', 400)
	const key = watchKey(channel, threadTs)
	const existing = await readWatch(env, key)

	if (request.method === 'DELETE') {
		if (existing && existing.amp_thread !== ampThread) return text('watched by another thread', 409)
		await env.WATCHES.delete(key)
		return text('deleted')
	}

	const days = body.days ?? 7
	if (!Number.isInteger(days) || days < 1 || days > 30) return text('days must be 1 to 30', 400)
	if (typeof body.webhook_url !== 'string' || !body.webhook_url.startsWith(WEBHOOK_PREFIX)) return text('invalid webhook_url', 400)
	if (existing && existing.amp_thread !== ampThread && existing.expires_at > now) return text('watched by another thread', 409)
	const watch: Watch = { amp_thread: ampThread, webhook_url: body.webhook_url, expires_at: now + days * 86400 }
	await env.WATCHES.put(key, JSON.stringify(watch), { expirationTtl: days * 86400 })
	return Response.json({ channel, thread_ts: threadTs, expires_at: watch.expires_at })
}

export async function handle(request: Request, env: WorkerEnv, now = Math.floor(Date.now() / 1000)): Promise<Response> {
	const { pathname } = new URL(request.url)
	if (pathname === '/watches' && (request.method === 'PUT' || request.method === 'DELETE')) return handleWatches(request, env, now)
	if (pathname !== '/slack/events' || request.method !== 'POST') return text('not found', 404)

	const body = await request.text()
	if (!(await verifiedSlack(request, body, env, now))) return text('invalid signature', 401)
	let payload: any
	try { payload = JSON.parse(body) } catch { return text('invalid json', 400) }
	if (payload.type === 'url_verification' && typeof payload.challenge === 'string') return text(payload.challenge)
	if (payload.type !== 'event_callback') return text('ignored')
	return handleEvent(payload, env, now)
}

export default { fetch: (request: Request, env: WorkerEnv) => handle(request, env) }
