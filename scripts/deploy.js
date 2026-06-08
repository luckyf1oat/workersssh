/**
 * WorkersSSH Deploy Script
 *
 * 坑: wrangler kv namespace create 会先校验 wrangler.toml，
 *     如果 kv_namespaces.id = "" 会导致校验失败。
 *     所以创建 KV 时必须先清掉 id 字段，创建完再写回去。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRANGLER_TOML = path.join(__dirname, '..', 'wrangler.toml');
const KV_NAMESPACE = 'workersssh-kv';

// 检查 Node 版本
const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor < 22) {
  console.error(`❌ wrangler v4 需要 Node.js v22+，当前: ${process.version}`);
  process.exit(1);
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function readToml() {
  return fs.readFileSync(WRANGLER_TOML, 'utf8');
}

function writeToml(content) {
  fs.writeFileSync(WRANGLER_TOML, content, 'utf8');
}

/**
 * 临时清掉 kv_namespaces 的 id / preview_id（创建 KV 时 wrangler 会校验）
 * 返回原始内容用于恢复
 */
function stripKvIds(content) {
  return content
    .replace(/^id\s*=\s*""\s*$/m, '# id = ""')
    .replace(/^preview_id\s*=\s*""\s*$/m, '# preview_id = ""');
}

/**
 * 把 id / preview_id 设回真实值
 */
function setKvIds(content, id) {
  return content
    .replace(/^#\s*id\s*=\s*""\s*$/m, `id = "${id}"`)
    .replace(/^#\s*preview_id\s*=\s*""\s*$/m, `preview_id = "${id}"`);
}

/**
 * 从 wrangler output 中提取 KV ID
 */
function extractKvId(output) {
  // wrangler 3+ JSON: { "success": true, "result": { "id": "xxx" } }
  try {
    const j = JSON.parse(output);
    if (j.success && j.result?.id) return j.result.id;
    if (j.id) return j.id;
  } catch {}
  // wrangler 2 text: id: xxx
  const m = output.match(/id["']?\s*[:=]\s*["']?([a-f0-9-]+)["']?/i);
  return m ? m[1] : '';
}

function main() {
  console.log('🚀 WorkersSSH Deploy\n');

  // 1. 检查 wrangler.toml
  let toml = readToml();
  const existingId = (toml.match(/^id\s*=\s*"([^"]+)"$/m) || [])[1];

  if (existingId) {
    // KV 已创建过，直接部署
    console.log(`📦 KV Namespace: ${existingId} (已存在)\n`);
  } else {
    // 2. 创建 KV — 先清空 id 避免 wrangler 报错
    console.log(`📦 创建 KV Namespace "${KV_NAMESPACE}" ...`);

    // 临时注释掉空的 id / preview_id
    const clean = stripKvIds(toml);
    writeToml(clean);

    try {
      const output = exec(`npx wrangler kv namespace create "${KV_NAMESPACE}"`);
      const id = extractKvId(output);

      if (!id) {
        console.error('❌ 无法从 wrangler 输出中提取 KV ID:');
        console.error(output);
        // 恢复 toml
        writeToml(toml);
        process.exit(1);
      }

      // 写回真实 ID
      toml = setKvIds(readToml(), id);
      writeToml(toml);
      console.log(`   ✅ 创建成功，ID: ${id}\n`);
    } catch (err) {
      // 恢复 toml
      writeToml(toml);
      console.error(`❌ 创建 KV 失败: ${err.message}`);
      console.error('\n请手动操作：');
      console.error('  1. 在 Cloudflare Dashboard 手动创建 KV Namespace');
      console.error(`  2. 将 ID 填入 wrangler.toml 的 kv_namespaces.id`);
      process.exit(1);
    }
  }

  // 3. 部署
  console.log('☁️  部署到 Cloudflare Workers ...\n');
  try {
    exec('npx wrangler deploy --assets public', { stdio: 'inherit' });
    console.log('\n✅ 部署成功！');
  } catch (err) {
    console.error(`\n❌ 部署失败: ${err.message}`);
    console.error('\n可能原因：');
    console.error('  · 未登录: npx wrangler login');
    console.error('  · GitHub Actions: 未设置 CLOUDFLARE_API_TOKEN');
    console.error('  · Workers Paid 计划: 出站 TCP 需要付费');
    process.exit(1);
  }
}

main();