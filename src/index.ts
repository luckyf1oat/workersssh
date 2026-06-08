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
	WORKERSSH_KV: KVNamespace;
	ENVIRONMENT: string;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
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
router.get('/api/auth/check', (request, env, ctx) => handleAuth(request, env, ctx));
router.post('/api/auth/check-password', (request, env, ctx) => handleCheckPassword(request, env, ctx));
router.post('/api/auth/set-password', (request, env, ctx) => handleSetPassword(request, env, ctx));

// Connection CRUD routes
router.get('/api/connections', (request, env, ctx) => handleListConnections(request, env, ctx));
router.post('/api/connections', (request, env, ctx) => handleCreateConnection(request, env, ctx));
router.get('/api/connections/:id', (request, env, ctx) => handleGetConnection(request, env, ctx));
router.put('/api/connections/:id', (request, env, ctx) => handleUpdateConnection(request, env, ctx));
router.patch('/api/connections/:id/rename', (request, env, ctx) => handleRenameConnection(request, env, ctx));
router.delete('/api/connections/:id', (request, env, ctx) => handleDeleteConnection(request, env, ctx));

// Status & IP check routes
router.get('/api/check/:id', (request, env, ctx) => handleCheckStatus(request, env, ctx));
router.post('/api/check-ip', (request, env, ctx) => handleCheckIp(request, env, ctx));

// WebSocket route
router.get('/ws', handleWebSocket);

// Catch-all: serve static assets or 404
router.all('*', async (request: Request, env: Env) => {
	const url = new URL(request.url);
	const path = url.pathname;

	// If it's an API route that wasn't matched, return 404
	if (path.startsWith('/api/')) {
		return errorResponse('Not Found', 404);
	}

	// Try to serve static assets
	try {
		if (env.ASSETS) {
			return await env.ASSETS.fetch(request);
		}
	} catch (err) {
		// Fall through to 404
	}

	// Try to serve index.html for SPA routes
	try {
		if (env.ASSETS) {
			const indexRequest = new Request(new URL('/index.html', url).toString(), request);
			return await env.ASSETS.fetch(indexRequest);
		}
	} catch (err) {
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
			return new Response(err.message || 'Internal Server Error', {
				status: 500,
				headers: corsHeaders,
			});
		}
	},
};