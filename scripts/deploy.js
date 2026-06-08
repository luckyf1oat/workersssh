/**
 * WorkersSSH Deploy Script
 * Automatically creates KV namespace (if needed) and deploys the worker
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    return e.stdout || '';
  }
}

async function main() {
  console.log('🚀 WorkersSSH Deploy Script');
  console.log('');

  // 1. Get existing KV namespaces
  console.log('📦 Checking KV namespaces...');
  const listOutput = run('npx wrangler kv namespace list');
  
  let kvId = '';
  try {
    const kvs = JSON.parse(listOutput);
    const existing = kvs.find((k) => k.title === 'workersssh-kv');
    
    if (existing) {
      kvId = existing.id;
      console.log(`   ✅ Found existing KV namespace: ${kvId}`);
    }
  } catch (e) {
    // Not JSON, try other formats
  }

  // 2. Create KV namespace if not exists
  if (!kvId) {
    console.log('   ⏳ Creating KV namespace...');
    const createOutput = run('npx wrangler kv namespace create workersssh-kv');
    
    // Try to extract ID from various output formats
    const idMatch = createOutput.match(/id["']?\s*[:=]\s*["']?([a-f0-9-]+)["']?/i);
    if (idMatch) {
      kvId = idMatch[1];
      console.log(`   ✅ Created KV namespace: ${kvId}`);
    } else {
      console.log('   ⚠️ Could not parse KV ID. Check wrangler.toml manually.');
      console.log('   Output:', createOutput);
    }
  }

  // 3. Update wrangler.toml with KV ID
  if (kvId) {
    let config = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');
    config = config.replace(/id\s*=\s*""/, `id = "${kvId}"`);
    fs.writeFileSync(path.join(__dirname, '..', 'wrangler.toml'), config);
    console.log('   ✅ Updated wrangler.toml with KV ID');
  }

  // 4. Deploy
  console.log('');
  console.log('☁️  Deploying to Cloudflare Workers...');
  console.log('');
  
  try {
    execSync('npx wrangler deploy --assets public', { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Deploy failed:', e.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});