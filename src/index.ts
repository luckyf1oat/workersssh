import { Router } from 'itty-router';
import { handleAuth, handleCheckPassword, handleSetPassword } from './auth';
import { handleListConnections, handleCreateConnection, handleGetConnection, handleUpdateConnection, handleRenameConnection, handleDeleteConnection } from './connections';
import { handleCheckStatus, handleCheckIp } from './check';
import { handleWebSocket } from './ws';

export interface Env {
	WORKERSSH_KV?: KVNamespace;
	ENVIRONMENT?: string;
	ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

const router = Router();

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
};

function json(data: any, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders },
	});
}

// CORS preflight
router.options('*', () => new Response(null, { headers: corsHeaders }));

// --- Auth ---
router.get('/api/auth/check', async (request: any, env: Env, ctx: any) => {
	try {
		const hasPassword = await env.WORKERSSH_KV?.get('password_hash');
		return json({ hasPassword: hasPassword !== null, version: '1.0.0' });
	} catch (e) {
		return json({ hasPassword: false, error: String(e) });
	}
});

router.post('/api/auth/check-password', async (request: any, env: Env, ctx: any) => {
	try {
		const { password } = await request.json();
		if (!password) return json({ success: false, error: 'Password required' }, 400);
		return await handleCheckPassword(request, env, ctx);
	} catch (e) {
		return json({ success: false, error: String(e) }, 500);
	}
});

router.post('/api/auth/set-password', async (request: any, env: Env, ctx: any) => {
	try {
		const { password } = await request.json();
		if (!password) return json({ success: false, error: 'Password required' }, 400);
		return await handleSetPassword(request, env, ctx);
	} catch (e) {
		return json({ success: false, error: String(e) }, 500);
	}
});

// --- Connections CRUD ---
router.get('/api/connections', async (request: any, env: Env, ctx: any) => {
	try { return await handleListConnections(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.post('/api/connections', async (request: any, env: Env, ctx: any) => {
	try { return await handleCreateConnection(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.get('/api/connections/:id', async (request: any, env: Env, ctx: any) => {
	try { return await handleGetConnection(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.put('/api/connections/:id', async (request: any, env: Env, ctx: any) => {
	try { return await handleUpdateConnection(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.patch('/api/connections/:id/rename', async (request: any, env: Env, ctx: any) => {
	try { return await handleRenameConnection(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.delete('/api/connections/:id', async (request: any, env: Env, ctx: any) => {
	try { return await handleDeleteConnection(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

// --- Status check ---
router.get('/api/check/:id', async (request: any, env: Env, ctx: any) => {
	try { return await handleCheckStatus(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

router.post('/api/check-ip', async (request: any, env: Env, ctx: any) => {
	try { return await handleCheckIp(request, env, ctx); }
	catch (e) { return json({ success: false, error: String(e) }, 500); }
});

// WebSocket
router.get('/ws', handleWebSocket);

// Static assets
router.all('*', async (request: Request, env: Env, ctx: any) => {
	try {
		const url = new URL(request.url);
		if (url.pathname.startsWith('/api/')) {
			return json({ success: false, error: 'Not Found' }, 404);
		}
		if (env.ASSETS) {
			const resp = await env.ASSETS.fetch(request);
			if (resp.status !== 404) return resp;
		}
		if (env.ASSETS) {
			const indexReq = new Request(new URL('/index.html', url).toString(), request);
			return await env.ASSETS.fetch(indexReq);
		}
		return new Response('Not Found', { status: 404 });
	} catch (e) {
		try {
			if (env.ASSETS) {
				const indexReq = new Request(new URL('/index.html', new URL(request.url)).toString(), request);
				return await env.ASSETS.fetch(indexReq);
			}
		} catch {}
		return new Response('Not Found', { status: 404 });
	}
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const response = await router.handle(request, env, ctx);
			if (response) return response;
			return new Response('Not Found', { status: 404 });
		} catch (err: any) {
			return new Response(
				JSON.stringify({ success: false, error: String(err?.message || err) }),
				{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
			);
		}
	},
};