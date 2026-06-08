/**
 * WorkersSSH - Cloudflare Workers SSH Client
 * Main entry point with routing and static asset serving
 */

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

// CORS headers
const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200): Response {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...corsHeaders,
	};
	return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(error: string, status = 500): Response {
	return jsonResponse({ success: false, error }, status);
}

// Handle OPTIONS requests (CORS preflight)
router.options('*', () => new Response(null, { headers: corsHeaders }));

// Auth routes
router.get('/api/auth/check', (request: any, env: Env, ...args: any[]) =>
	handleAuth(request, env).catch(e => jsonResponse({ hasPassword: false, error: String(e) })));
router.post('/api/auth/check-password', (request: any, env: Env, ...args: any[]) =>
	handleCheckPassword(request, env).catch(e => jsonResponse({ success: false, error: String(e) }, 500)));
router.post('/api/auth/set-password', (request: any, env: Env, ...args: any[]) =>
	handleSetPassword(request, env).catch(e => jsonResponse({ success: false, error: String(e) }, 500)));

// Connection CRUD routes
router.get('/api/connections', (request: any, env: Env, ...args: any[]) =>
	handleListConnections(request, env).catch(e => errorResponse(String(e))));
router.post('/api/connections', (request: any, env: Env, ...args: any[]) =>
	handleCreateConnection(request, env).catch(e => errorResponse(String(e))));
router.get('/api/connections/:id', (request: any, env: Env, ...args: any[]) =>
	handleGetConnection(request, env).catch(e => errorResponse(String(e))));
router.put('/api/connections/:id', (request: any, env: Env, ...args: any[]) =>
	handleUpdateConnection(request, env).catch(e => errorResponse(String(e))));
router.patch('/api/connections/:id/rename', (request: any, env: Env, ...args: any[]) =>
	handleRenameConnection(request, env).catch(e => errorResponse(String(e))));
router.delete('/api/connections/:id', (request: any, env: Env, ...args: any[]) =>
	handleDeleteConnection(request, env).catch(e => errorResponse(String(e))));

// Status & IP check routes
router.get('/api/check/:id', (request: any, env: Env, ...args: any[]) =>
	handleCheckStatus(request, env).catch(e => errorResponse(String(e))));
router.post('/api/check-ip', (request: any, env: Env, ...args: any[]) =>
	handleCheckIp(request, env).catch(e => errorResponse(String(e))));

// WebSocket route
router.get('/ws', handleWebSocket);

// Catch-all: serve static assets or 404
router.all('*', async (request: Request, env: Env) => {
	const url = new URL(request.url);
	const path = url.pathname;

	if (path.startsWith('/api/')) {
		return errorResponse('Not Found', 404);
	}

	// Try to serve static assets
	try {
		if (env.ASSETS) {
			return await env.ASSETS.fetch(request);
		}
	} catch {
		// Fall through
	}

	// Try to serve index.html for SPA routes
	try {
		if (env.ASSETS) {
			const indexRequest = new Request(new URL('/index.html', url).toString(), request);
			return await env.ASSETS.fetch(indexRequest);
		}
	} catch {
		// Return 404
	}

	return new Response('Not Found', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const response = await router.handle(request, env, ctx);
			if (response) {
				return response;
			}
			return new Response('Not Found', { status: 404, headers: corsHeaders });
		} catch (err: any) {
			console.error('Unhandled error:', err);
			return new Response(JSON.stringify({ success: false, error: String(err?.message || err || 'Internal Server Error') }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...corsHeaders },
			});
		}
	},
};