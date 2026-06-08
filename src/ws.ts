/**
 * WebSocket ↔ TCP Proxy Handler
 * Bridges browser WebSocket connections to SSH servers via Workers TCP connect()
 */

// Try to import connect - fallback to no-op if not available
let connect: any;
try {
	connect = (globalThis as any).connect;
} catch {
	connect = null;
}

export async function handleWebSocket(request: any, env: any, ctx: any): Promise<Response> {
	// Check if the request is a WebSocket upgrade
	const upgradeHeader = request.headers.get('Upgrade') || request.headers.get('upgrade') || '';
	if (upgradeHeader.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket', { status: 426 });
	}

	const [client, server] = Object.values(new WebSocketPair());
	
	server.accept();

	// Get connection parameters from URL
	const url = new URL(request.url);
	const connectionId = url.searchParams.get('id') || '';
	const token = url.searchParams.get('token') || '';

	// Verify token (basic auth check)
	if (!token) {
		server.close(4001, 'Authentication required');
		return new Response(null, { status: 101, webSocket: client });
	}

	// Verify auth
	const storedHash = await env.WORKERSSH_KV.get('password_hash');
	if (!storedHash) {
		server.close(4001, 'No password set');
		return new Response(null, { status: 101, webSocket: client });
	}

	// Get connection details from KV
	const connectionsData = await env.WORKERSSH_KV.get('connections:list', 'json');
	const connections = connectionsData || [];
	const conn = connections.find((c: any) => c.id === connectionId);

	if (!conn) {
		server.close(4004, 'Connection not found');
		return new Response(null, { status: 101, webSocket: client });
	}

	let tcpSocket: any = null;
	let isClosed = false;

	// Try to establish TCP connection via Workers connect() API
	async function connectTcp() {
		if (!connect) {
			server.send(JSON.stringify({
				type: 'error',
				message: 'TCP connect() API not available in this Workers runtime. Upgrade required.',
			}));
			return;
		}

		try {
			tcpSocket = await connect({
				hostname: conn.host,
				port: conn.port,
			});

			server.send(JSON.stringify({
				type: 'status',
				message: `✅ TCP connected to ${conn.host}:${conn.port}`,
			}));

			// Forward TCP data to WebSocket
			tcpSocket.readable.pipeTo(new WritableStream({
				write(chunk: Uint8Array) {
					if (!isClosed && server.readyState === WebSocket.OPEN) {
						server.send(chunk);
					}
				},
				close() {
					if (!isClosed) {
						server.close(4000, 'TCP connection closed');
					}
				},
				abort(err: any) {
					if (!isClosed) {
						server.close(4000, `TCP error: ${err.message}`);
					}
				},
			})).catch((err: any) => {
				if (!isClosed) {
					server.close(4000, `TCP stream error: ${err.message}`);
				}
			});

		} catch (err: any) {
			server.send(JSON.stringify({
				type: 'error',
				message: `❌ TCP connection failed: ${err.message}`,
			}));
			server.send(JSON.stringify({
				type: 'status',
				message: '⚠️  Your Worker needs to be on a Paid plan with connect() API support to use TCP proxy.',
			}));
		}
	}

	// Start TCP connection
	connectTcp();

	// Handle messages from the browser
	server.addEventListener('message', async (event: MessageEvent) => {
		try {
			const data = event.data;
			
			if (typeof data === 'string') {
				try {
					const msg = JSON.parse(data);
					
					if (msg.type === 'ssh_data' && tcpSocket && tcpSocket.writable) {
						// Decode base64 SSH data and send to TCP
						const binaryStr = atob(msg.data);
						const uint8 = new Uint8Array(binaryStr.length);
						for (let i = 0; i < binaryStr.length; i++) {
							uint8[i] = binaryStr.charCodeAt(i);
						}
						const writer = tcpSocket.writable.getWriter();
						await writer.write(uint8);
						writer.releaseLock();
					} else if (msg.type === 'resize') {
						// Terminal resize - can forward if needed
					}
				} catch {
					// Plain string - forward to TCP
					if (tcpSocket && tcpSocket.writable) {
						const encoder = new TextEncoder();
						const writer = tcpSocket.writable.getWriter();
						await writer.write(encoder.encode(data));
						writer.releaseLock();
					}
				}
			} else if (data instanceof ArrayBuffer || data instanceof Blob) {
				// Binary data - forward to TCP
				if (tcpSocket && tcpSocket.writable) {
					const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
					const writer = tcpSocket.writable.getWriter();
					await writer.write(new Uint8Array(buffer));
					writer.releaseLock();
				}
			}
		} catch (err: any) {
			console.error('WebSocket message error:', err);
		}
	});

	server.addEventListener('close', (event: CloseEvent) => {
		isClosed = true;
		if (tcpSocket) {
			try { tcpSocket.close(); } catch {}
		}
	});

	server.addEventListener('error', (event: ErrorEvent) => {
		isClosed = true;
		if (tcpSocket) {
			try { tcpSocket.close(); } catch {}
		}
	});

	return new Response(null, { status: 101, webSocket: client });
}