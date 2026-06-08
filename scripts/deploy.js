/**
 * WorkersSSH Deploy Script
 *
 * 坑点:
 *   1. wrangler v4 需要 Node.js >= 22
 *   2. wrangler 会校验 wrangler.toml，kv_namespaces.id 不能为空
 *   3. 创建 KV 时如果 toml 有空的 id 会报错，必须先注释掉
 *   4. deploy 后需要确保 KV 绑定到 Worker（通过 wrangler.toml 自动绑定）
 *
 * 流程:
 *   1. 检查 Node 版本
 *   2. 检查 wrangler.toml 中 KV ID 是否已配置
 *   3. 如未配置，临时注释 id，执行 wrangler kv namespace create
 *   4. 将真实 ID 写回 wrangler.toml
 *   5. wrangler deploy --assets public
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRANGLER_TOML = path.join(__dirname, '..', 'wrangler.toml');
const KV_NAMESPACE = 'workersssh-kv';

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

function extractKvId(output) {
  try {
    const j = JSON.parse(output);
    if (j.success && j.result?.id) return j.result.id;
    if (j.id) return j.id;
  } catch {}
  const m = output.match(/id["']?\s*[:=]\s*["']?([a-f0-9-]+)["']?/i);
  return m ? m[1] : '';
}

function main() {
  console.log('🚀 WorkersSSH Deploy\n');

  let toml = readToml();

  // 已有的 KV ID（非空）
  const existingMatch = toml.match(/^id\s*=\s*"([a-f0-9-]{8,})"$/m);
  const existingId = existingMatch ? existingMatch[1] : '';
  // 也支持带 preview_id
  const existingPreviewMatch = toml.match(/^preview_id\s*=\s*"([a-f0-9-]{8,})"$/m);
  const existingPreviewId = existingPreviewMatch ? existingPreviewMatch[1] : '';

  if (existingId) {
    console.log(`📦 KV Namespace: ${existingId} (已存在)\n`);
  } else {
    console.log(`📦 创建 KV Namespace "${KV_NAMESPACE}" ...`);

    // wrangler kv namespace create 会校验 toml，空 id 会导致报错
    // 所以先把 id/preview_id 注释掉
    const clean = toml
      .replace(/^id\s*=\s*""\s*$/m, '# id = ""')
      .replace(/^preview_id\s*=\s*""\s*$/m, '# preview_id = ""');
    writeToml(clean);

    try {
      const output = exec(`npx wrangler kv namespace create "${KV_NAMESPACE}"`);
      const id = extractKvId(output);

      if (!id) {
        console.error('❌ 无法从 wrangler 输出提取 KV ID');
        console.error(output);
        writeToml(toml);
        process.exit(1);
      }

      console.log(`   ✅ 创建成功: ${id}`);

      // 写入真实 ID
      toml = readToml()
        .replace(/^#\s*id\s*=\s*""\s*$/m, `id = "${id}"`)
        .replace(/^#\s*preview_id\s*=\s*""\s*$/m, `preview_id = "${id}"`);
      writeToml(toml);
      console.log('   ✅ 已写入 wrangler.toml\n');
    } catch (err) {
      writeToml(toml);
      console.error(`❌ 创建 KV 失败: ${err.message}`);
      process.exit(1);
    }
  }

  // 部署
  console.log('☁️  部署到 Cloudflare Workers ...\n');

  try {
    exec('npx wrangler deploy', { stdio: 'inherit' });
    console.log('\n✅ 部署成功！');
  } catch (err) {
    console.error(`\n❌ 部署失败: ${err.message}`);
    process.exit(1);
  }
}

main();