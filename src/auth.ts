import { IRequest } from 'itty-router';

// Use a simple hash approach compatible with Workers (bcryptjs is not available in Workers runtime)
// We'll implement a PBKDF2-based password hashing using the Web Crypto API
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	
	// Generate a random salt if not provided
	if (!salt) {
		const saltBytes = crypto.getRandomValues(new Uint8Array(16));
		salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
	}
	
	const saltData = encoder.encode(salt);
	
	// Use PBKDF2 via Web Crypto API
	const key = await crypto.subtle.importKey(
		'raw',
		data,
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);
	
	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: saltData,
			iterations: 100000,
			hash: 'SHA-256',
		},
		key,
		256
	);
	
	const hashArray = Array.from(new Uint8Array(derivedBits));
	const hash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
	
	return { hash, salt };
}

async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
	const { hash } = await hashPassword(password, salt);
	return hash === storedHash;
}

export async function handleAuth(request: IRequest, env: any, ctx: any): Promise<Response> {
	const hasPassword = await env.WORKERSSH_KV.get('password_hash');
	return new Response(JSON.stringify({ 
		hasPassword: hasPassword !== null,
		version: '1.0.0'
	}), {
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function handleCheckPassword(request: IRequest, env: any, ctx: any): Promise<Response> {
	try {
		const { password } = await request.json();
		if (!password) {
			return new Response(JSON.stringify({ success: false, error: 'Password required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const storedHash = await env.WORKERSSH_KV.get('password_hash');
		const storedSalt = await env.WORKERSSH_KV.get('password_salt');
		
		if (!storedHash || !storedSalt) {
			return new Response(JSON.stringify({ success: false, error: 'No password set' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const isValid = await verifyPassword(password, storedHash, storedSalt);
		if (!isValid) {
			return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		// Generate a simple session token (for this request only - stateless)
		const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
		const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
		
		return new Response(JSON.stringify({ success: true, token }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ success: false, error: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export async function handleSetPassword(request: IRequest, env: any, ctx: any): Promise<Response> {
	try {
		const { password } = await request.json();
		if (!password) {
			return new Response(JSON.stringify({ success: false, error: 'Password required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const existingHash = await env.WORKERSSH_KV.get('password_hash');
		if (existingHash) {
			return new Response(JSON.stringify({ success: false, error: 'Password already set' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const { hash, salt } = await hashPassword(password);
		
		await env.WORKERSSH_KV.put('password_hash', hash);
		await env.WORKERSSH_KV.put('password_salt', salt);
		
		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ success: false, error: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}