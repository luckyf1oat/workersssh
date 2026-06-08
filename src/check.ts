/**
 * SSH status check and IP geolocation
 */

// Cache result for IP lookups (24h TTL in KV)
async function getIpInfo(env: any, ip: string): Promise<any> {
	const cacheKey = `ipinfo:${ip}`;
	const cached = await env.WORKERSSH_KV.get(cacheKey, 'json');
	if (cached) return cached;
	
	try {
		// Using ip-api.com free API
		const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,isp,query`);
		const data = await response.json();
		
		if (data.status === 'success') {
			// Cache for 24 hours
			await env.WORKERSSH_KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 86400 });
			return data;
		}
		return null;
	} catch (err) {
		return null;
	}
}

// Convert country code to flag emoji
function countryCodeToFlag(countryCode: string): string {
	if (!countryCode) return '🌐';
	const codePoints = countryCode
		.toUpperCase()
		.split('')
		.map(char => 0x1F1E6 + char.charCodeAt(0) - 65);
	return String.fromCodePoint(...codePoints);
}

// Check if a host:port is reachable via HTTP check or DNS resolution
async function checkReachable(host: string, port: number): Promise<boolean> {
	try {
		// For SSH (port 22), try a simple HTTP fetch to see if host is reachable
		// This is a best-effort check since Workers cannot do raw TCP
		const url = `http://${host}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		
		try {
			const resp = await fetch(url, {
				method: 'HEAD',
				signal: controller.signal,
			});
			clearTimeout(timeout);
			// If we get any response, the host is reachable (even if it's a non-HTTP response)
			return true;
		} catch (e) {
			clearTimeout(timeout);
			// Try with port-specific URL
			try {
				const resp2 = await fetch(`${url}:${port}`, {
					method: 'HEAD',
					signal: AbortSignal.timeout(3000),
				});
				return true;
			} catch {
				// Host might still be reachable but not HTTP
				// Try DNS resolution by fetching a working URL with same host
				return false;
			}
		}
	} catch {
		return false;
	}
}

export async function handleCheckStatus(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const { id } = request.params;
		
		// Get connection details
		const connectionsData = await env.WORKERSSH_KV.get('connections:list', 'json');
		const connections = connectionsData || [];
		const conn = connections.find((c: any) => c.id === id);
		
		if (!conn) {
			return new Response(JSON.stringify({ success: false, error: 'Connection not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		// Check if host is reachable
		const isReachable = await checkReachable(conn.host, conn.port);
		
		// Get IP info
		const ipInfo = await getIpInfo(env, conn.host);
		let countryFlag = '';
		let countryName = '';
		let region = '';
		let city = '';
		let isp = '';
		
		if (ipInfo) {
			countryFlag = countryCodeToFlag(ipInfo.countryCode || '');
			countryName = ipInfo.country || '';
			region = ipInfo.region || '';
			city = ipInfo.city || '';
			isp = ipInfo.isp || '';
		}
		
		return new Response(JSON.stringify({
			success: true,
			id: conn.id,
			host: conn.host,
			port: conn.port,
			reachable: isReachable,
			countryFlag,
			countryName,
			region,
			city,
			isp,
		}), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ success: false, error: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export async function handleCheckIp(request: any, env: any, ctx: any): Promise<Response> {
	try {
		const { host } = await request.json();
		if (!host) {
			return new Response(JSON.stringify({ success: false, error: 'Host required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		const ipInfo = await getIpInfo(env, host);
		
		if (!ipInfo) {
			return new Response(JSON.stringify({
				success: true,
				flag: '',
				country: '',
				region: '',
				city: '',
				isp: '',
			}), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		
		return new Response(JSON.stringify({
			success: true,
			flag: countryCodeToFlag(ipInfo.countryCode || ''),
			country: ipInfo.country || '',
			region: ipInfo.region || '',
			city: ipInfo.city || '',
			isp: ipInfo.isp || '',
		}), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ success: false, error: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}