/**
 * WorkersSSH Deploy Script
 *
 * 支持两种部署方式:
 *   1. 本地 CLI: `npm run deploy` - 自动创建 KV + 更新配置 + 部署
 *   2. Cloudflare Dashboard: 自动处理 KV 绑定，只需直接部署
 *
 * 工作流程:
 *   1. 检查 KV Namespace 是否存在
 *   2. 如不存在则自动创建
 *   3. 更新 wrangler.toml 中的 KV ID
 *   4. 部署 Worker
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRANGLER_TOML_PATH = path.join(__dirname, '..', 'wrangler.toml');
const KV_NAMESPACE_TITLE = 'workersssh-kv';

function run(cmd, options = {}) {
  const defaultOpts = { encoding: 'utf8', stdio: 'pipe' };
  const opts = { ...defaultOpts, ...options };

  try {
    return execSync(cmd, opts);
  } catch (e) {
    if (opts.ignoreErrors) {
      return e.stdout || e.stderr || '';
    }
    throw e;
  }
}

/**
 * 检测是否在 Cloudflare Dashboard CI 环境中运行
 * Dashboard CI 环境会自动处理 KV 绑定，不需要手动创建
 */
function isCloudflareDashboard() {
  return (
    process.env.CF_PAGES === '1' ||
    process.env.CF_ACCOUNT_ID !== undefined ||
    process.env.CLOUDFLARE_ACCOUNT_ID !== undefined
  );
}

/**
 * 从 wrangler.toml 中读取当前 KV ID
 */
function getCurrentKvId() {
  try {
    const config = fs.readFileSync(WRANGLER_TOML_PATH, 'utf8');
    const match = config.match(/^id\s*=\s*"([^"]*)"$/m);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

/**
 * 解析 wrangler kv namespace list 的 JSON 输出
 */
function parseNamespaces(output) {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * 解析 wrangler kv namespace create 的输出，提取 ID
 */
function parseCreateOutput(output) {
  // wrangler@3+ JSON 格式: { "id": "xxx", "title": "xxx" }
  try {
    const json = JSON.parse(output);
    if (json.id) return json.id;
  } catch {
    // 忽略
  }

  // wrangler@2 TEXT 格式: id: xxx
  const idMatch = output.match(/id["']?\s*[:=]\s*["']?([a-f0-9-]+)["']?/i);
  if (idMatch) return idMatch[1];

  // 旧格式: wrangler kv:namespace create 输出
  const oldMatch = output.match(/Success.*?id\s*=\s*([a-f0-9-]+)/i);
  if (oldMatch) return oldMatch[1];

  return '';
}

/**
 * 更新 wrangler.toml 中的 KV ID
 */
function updateWranglerToml(kvId) {
  let config = fs.readFileSync(WRANGLER_TOML_PATH, 'utf8');

  // 更新主 id
  config = config.replace(/^id\s*=\s*""[^"]*$/m, `id = "${kvId}"`);

  // 更新 preview_id（如果没有则追加）
  if (!config.includes('preview_id')) {
    config = config.replace(
      /^id\s*=\s*"([^"]+)"$/m,
      `id = "$1"\npreview_id = "$1"`
    );
  } else if (config.includes('preview_id = ""')) {
    config = config.replace(/^preview_id\s*=\s*""$/m, `preview_id = "${kvId}"`);
  }

  fs.writeFileSync(WRANGLER_TOML_PATH, config, 'utf8');
  return config;
}

async function main() {
  console.log('🚀 WorkersSSH Deploy Script');
  console.log('');

  // 检测运行环境
  const isDashboard = isCloudflareDashboard();
  if (isDashboard) {
    console.log('🌐 检测到 Cloudflare Dashboard CI 环境');
    console.log('   KV 绑定将由 Dashboard 自动处理');
    console.log('');
  }

  // 检查是否已存在 KV ID
  const existingKvId = getCurrentKvId();
  let kvId = existingKvId;

  // 如果 KV ID 已配置且有效，跳过创建
  if (kvId && kvId.length > 0 && kvId !== '<KV_ID>') {
    console.log(`📦 检测到已配置的 KV Namespace: ${kvId}`);
    console.log('   跳过 KV 创建步骤');
  } else if (isDashboard) {
    // 在 Dashboard CI 环境中，KV 由 Dashboard UI 自动创建绑定
    // wrangler.toml 中的 KV 声明会被 Dashboard 自动替换
    console.log('📦 Cloudflare Dashboard 将自动创建 KV 绑定');
    console.log('   无需手动创建 KV Namespace');
  } else {
    // 本地 CLI 部署流程：自动创建 KV Namespace
    console.log('📦 正在检查 KV Namespace...');

    try {
      // 获取现有的 KV 列表
      const listOutput = run('npx wrangler kv namespace list', { ignoreErrors: true });
      const kvs = parseNamespaces(listOutput);

      if (Array.isArray(kvs)) {
        const existing = kvs.find((k) => {
          const title = k.title || k.titles || '';
          return title === KV_NAMESPACE_TITLE;
        });

        if (existing) {
          kvId = existing.id;
          console.log(`   ✅ 找到已有 KV Namespace: ${kvId}`);
        }
      }
    } catch (e) {
      console.log('   ⚠️ 查询 KV 列表失败，尝试创建新 Namespace...');
    }

    // 如果没有找到，创建新的
    if (!kvId) {
      console.log(`   ⏳ 正在创建 KV Namespace "${KV_NAMESPACE_TITLE}"...`);

      try {
        const createOutput = run(`npx wrangler kv namespace create "${KV_NAMESPACE_TITLE}"`, {
          ignoreErrors: true,
        });
        kvId = parseCreateOutput(createOutput);

        if (kvId) {
          console.log(`   ✅ KV Namespace 创建成功: ${kvId}`);
        } else {
          console.log('   ⚠️ 无法解析 KV ID，输出内容:');
          console.log('   ', createOutput.trim());
        }
      } catch (e) {
        console.error('   ❌ 创建 KV Namespace 失败:', e.message);
        console.log('   请手动在 Cloudflare Dashboard 中创建 KV Namespace');
        console.log('   并将 ID 填写到 wrangler.toml 中');
        process.exit(1);
      }
    }

    // 更新 wrangler.toml 中的 KV ID
    if (kvId) {
      updateWranglerToml(kvId);
      console.log('   ✅ 已更新 wrangler.toml 中的 KV ID');
    }
  }

  // 部署 Worker
  console.log('');
  console.log('☁️  正在部署到 Cloudflare Workers...');
  console.log('');

  try {
    execSync('npx wrangler deploy --assets public', { stdio: 'inherit' });
    console.log('');
    console.log('✅ 部署成功！');
  } catch (e) {
    console.error('');
    console.error('❌ 部署失败:', e.message);
    console.log('');
    console.log('可能的解决方案:');
    console.log('  1. 请确认已登录: npx wrangler login');
    console.log('  2. 请确认 wrangler.toml 中的 KV ID 是否正确');
    console.log('  3. 如果是首次部署，请先创建 KV Namespace');
    console.log('  4. Workers Paid Plan 需要才能使用出站 TCP 连接');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});