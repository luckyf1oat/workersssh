/**
 * WorkersSSH Deploy Script
 *
 * 工作流程:
 *   1. 检查 wrangler.toml 中 KV ID 是否已配置
 *   2. 如未配置，自动创建 KV Namespace 并写入 wrangler.toml
 *   3. 部署 Worker 到 Cloudflare
 *
 * 支持环境:
 *   - 本地 CLI: 自动创建 KV
 *   - GitHub Actions: 通过 CLOUDFLARE_API_TOKEN 环境变量认证
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRANGLER_TOML = path.join(__dirname, '..', 'wrangler.toml');
const KV_NAMESPACE = 'workersssh-kv';

function exec(cmd, opts = {}) {
  const defaultOpts = { encoding: 'utf8', stdio: 'pipe' };
  return execSync(cmd, { ...defaultOpts, ...opts });
}

/**
 * 读取 wrangler.toml 中已配置的 KV ID
 */
function readKvId() {
  const content = fs.readFileSync(WRANGLER_TOML, 'utf8');
  // kv_namespaces 块中的 id 字段
  const match = content.match(/^id\s*=\s*"([^"]*)"$/m);
  return match ? match[1] : '';
}

/**
 * 更新 wrangler.toml 中的 KV ID 和 preview_id
 */
function writeKvId(kvId) {
  let content = fs.readFileSync(WRANGLER_TOML, 'utf8');

  // 更新 id
  content = content.replace(/^id\s*=\s*""/m, `id = "${kvId}"`);
  // 更新 preview_id
  content = content.replace(/^preview_id\s*=\s*""/m, `preview_id = "${kvId}"`);

  fs.writeFileSync(WRANGLER_TOML, content, 'utf8');
}

/**
 * 解析 wrangler kv namespace create 的输出，提取 ID
 */
function parseKvOutput(output) {
  // wrangler@3 输出: { "success": true, "result": { "id": "...", "title": "..." } }
  try {
    const json = JSON.parse(output);
    if (json.success && json.result?.id) return json.result.id;
    if (json.id) return json.id;
  } catch { /* not JSON */ }

  // wrangler@2 输出: id: xxx
  const match = output.match(/id["']?\s*[:=]\s*["']?([a-f0-9-]+)["']?/i);
  return match ? match[1] : '';
}

function main() {
  console.log('🚀 WorkersSSH Deploy\n');

  // 1. 检查 KV ID
  const existing = readKvId();
  let kvId = '';

  if (existing) {
    console.log(`📦 使用已有 KV Namespace: ${existing}\n`);
    kvId = existing;
  } else {
    // 2. 创建 KV
    console.log(`📦 创建 KV Namespace "${KV_NAMESPACE}"...`);

    try {
      const output = exec(`npx wrangler kv namespace create "${KV_NAMESPACE}"`);
      kvId = parseKvOutput(output);

      if (!kvId) {
        console.error('   ❌ 无法解析 KV ID，输出:');
        console.error(output);
        process.exit(1);
      }

      console.log(`   ✅ 创建成功: ${kvId}`);

      // 写入配置
      writeKvId(kvId);
      console.log('   ✅ 已写入 wrangler.toml\n');
    } catch (err) {
      console.error(`   ❌ 创建失败: ${err.message}\n`);
      console.error('   请确保已在 Cloudflare Dashboard 中手动创建 KV Namespace');
      console.error('   并将 ID 填入 wrangler.toml 的 kv_namespaces.id 字段');
      process.exit(1);
    }
  }

  // 3. 部署
  console.log('☁️  部署中...\n');

  try {
    exec('npx wrangler deploy --assets public', { stdio: 'inherit' });
    console.log('\n✅ 部署成功！');
  } catch (err) {
    console.error(`\n❌ 部署失败: ${err.message}`);
    console.error('\n可能的原因:');
    console.error('  · 未登录: 在本地运行 npx wrangler login');
    console.error('  · GitHub Actions: 请设置 CLOUDFLARE_API_TOKEN');
    console.error('  · Workers Paid 计划: 出站 TCP 需要付费计划');
    process.exit(1);
  }
}

main();