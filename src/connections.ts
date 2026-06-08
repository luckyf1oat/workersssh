/**
 * SSH Connection management CRUD
 * Each connection is stored as a JSON object in KV
 * Connections list is stored as a JSON array under 'connections:list' key
 */

export interface SSHConnection {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string;
	authType: 'password' | 'key';
	password: string;
	privateKey: string;
	createdAt: string;
	updatedAt: string;
}

// Helper to get all connections
async function getConnections(env: any): Promise<SSHConnection[]> {
	const data = await env.WORKERSSH_KV.get('connections:list', 'json');
	return data || [];
}

// Helper to save all connections
async function saveConnections(env: any, connections: SSHConnection[]): Promise<void> {
	await env.WORKERSSH_KV.put('connections:list', JSON.stringify(connections));
}

export async function handleListConnections(request: any, env: any, ctx: any): Promise<Response> {
	const connections = await getConnections(env);
	// Strip sensitive fields for list view
	const safeList = connections.map(({ password, privateKey, ...rest }) => ({
		...rest,
		hasPassword: !!password,
		hasPrivateKey: !!privateKey,
	}));
	return new Response(JSON.stringify(safeList), {
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function handleCreateConnection(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const body = await request.json();
		const { name, host, port = 22, username, authType = 'password', password = '', privateKey = '' } = body;
		
		if (!name || !host || !username) {
			return new Response(JSON.stringify({ success: false, error: 'Name, host, and username are required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const connections = await getConnections(env);
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		
		const newConnection: SSHConnection = {
			id,
			name,
			host,
			port: parseInt(port) || 22,
			username,
			authType,
			password,
			privateKey,
			createdAt: now,
			updatedAt: now,
		};
		
		connections.push(newConnection);
		await saveConnections(env, connections);
		
		return new Response(JSON.stringify({ success: true, id }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ success: false, error: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export async function handleGetConnection(request: any, env: any, ctx: any): Promise<Response> {
	const { id } = request.params;
	const connections = await getConnections(env);
	const conn = connections.find(c => c.id === id);
	
	if (!conn) {
		return new Response(JSON.stringify({ success: false, error: 'Connection not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	
	return new Response(JSON.stringify(conn), {
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function handleUpdateConnection(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const { id } = request.params;
		const body = await request.json();
		const connections = await getConnections(env);
		const index = connections.findIndex(c => c.id === id);
		
		if (index === -1) {
			return new Response(JSON.stringify({ success: false, error: 'Connection not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const conn = connections[index];
		const { name, host, port, username, authType, password, privateKey } = body;
		
		if (name !== undefined) conn.name = name;
		if (host !== undefined) conn.host = host;
		if (port !== undefined) conn.port = parseInt(port) || 22;
		if (username !== undefined) conn.username = username;
		if (authType !== undefined) conn.authType = authType;
		if (password !== undefined) conn.password = password;
		if (privateKey !== undefined) conn.privateKey = privateKey;
		conn.updatedAt = new Date().toISOString();
		
		connections[index] = conn;
		await saveConnections(env, connections);
		
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

export async function handleRenameConnection(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const { id } = request.params;
		const { name } = await request.json();
		
		if (!name) {
			return new Response(JSON.stringify({ success: false, error: 'Name required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const connections = await getConnections(env);
		const index = connections.findIndex(c => c.id === id);
		
		if (index === -1) {
			return new Response(JSON.stringify({ success: false, error: 'Connection not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		connections[index].name = name;
		connections[index].updatedAt = new Date().toISOString();
		await saveConnections(env, connections);
		
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

export async function handleDeleteConnection(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const { id } = request.params;
		let connections = await getConnections(env);
		const index = connections.findIndex(c => c.id === id);
		
		if (index === -1) {
			return new Response(JSON.stringify({ success: false, error: 'Connection not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		connections.splice(index, 1);
		await saveConnections(env, connections);
		
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