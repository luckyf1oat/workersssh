# 🔌 WorkersSSH

> 基于 Cloudflare Workers 的纯浏览器端 SSH 管理工具 - 无需任何后端服务器

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/workersssh)

## ✨ 功能特性

- 🔐 **密码认证** - 首次使用设置密码，后续登录验证，保护你的 SSH 连接安全
- 📋 **连接管理** - 支持添加、编辑、改名、删除 SSH 连接，自动保存到 KV
- 🌐 **状态检测** - 每次打开自动检测每个 SSH 的连通状态，显示在线/离线
- 🚩 **IP 地理定位** - 自动检测服务器 IP 归属地，显示对应国家的国旗 emoji
- 🖥️ **Web 终端** - 基于 xterm.js 的完整终端体验，支持 ANSI 颜色
- 📋 **选中自动复制** - 鼠标选中文本自动复制到剪贴板，无需手动操作
- ⚡ **快捷命令** - 预置常用 Linux 命令，一键发送到终端
- 🔄 **自动重连** - 连接断开后按 R 键快速重连

## 🚀 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/workersssh)

### 前提条件

1. 一个 [Cloudflare](https://dash.cloudflare.com) 账号
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) 已安装

### 手动部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/YOUR_USERNAME/workersssh.git
cd workersssh

# 2. 安装依赖
npm install

# 3. 创建 KV Namespace
npx wrangler kv:namespace create WORKERSSH_KV

# 4. 将输出的 KV ID 更新到 wrangler.toml
# [[kv_namespaces]]
# binding = "WORKERSSH_KV"
# id = "your-kv-id-here"

# 5. 本地开发测试
npx wrangler dev --assets public

# 6. 部署到 Cloudflare
npx wrangler deploy --assets public
```

## 🛠️ 技术栈

| 技术 | 用途 |
|---|---|
| **Cloudflare Workers** | 无服务器运行环境 |
| **Cloudflare KV** | 数据持久化存储（密码、连接配置） |
| **Workers Socket API** | 原生 TCP 连接（`connect()`） |
| **itty-router** | 轻量级路由 |
| **xterm.js** | Web 终端模拟器 |
| **Web Crypto API** | 密码哈希（PBKDF2） |
| **ip-api.com** | IP 地理定位 |
| **WebSocket** | 实时双向通信 |

## 🏗️ 架构说明

WorkersSSH 使用 **Cloudflare Workers Socket API (connect())** 直接将浏览器 WebSocket 桥接到目标 SSH 服务器：

```
浏览器 (xterm.js) → WebSocket → Cloudflare Worker → TCP Socket → SSH 服务器
```

Worker 只做纯 TCP 代理，不处理 SSH 协议。**SSH 握手、加密、认证全部由 SSH 服务器完成**，worker 仅转发二进制流。

> ⚠️ Workers Socket API 需要 Workers Paid 计划（$5+/月）。免费计划不支持出站 TCP 连接。

## 📖 使用指南

### 首次使用

1. 打开部署后的 Workers URL
2. 设置一个访问密码（无长度限制）
3. 登录后进入 Dashboard

### 添加 SSH 连接

1. 点击 "➕ 添加连接" 按钮
2. 填写连接信息（名称、主机、端口、用户名、密码/密钥）
3. 点击保存，连接会自动添加到列表

### 连接管理

- **连接** - 点击 ▶️ 按钮或双击卡片打开终端
- **改名** - 点击名称直接编辑
- **编辑** - 点击 ✏️ 按钮修改连接信息
- **删除** - 点击 🗑️ 按钮确认删除

### 终端使用

- **选中复制** - 鼠标选中任意文本自动复制
- **快捷命令** - 点击底部命令按钮一键执行
- **清屏** - 点击 🧹 按钮
- **重连** - 按 `R` 键或点击 🔄 按钮
- **返回** - 按 `ESC` 键或点击 ◀ 按钮

## 📁 项目结构

```
workersssh/
├── public/                  # 前端静态资源
│   ├── index.html           # SPA 入口
│   ├── app.css              # 样式
│   ├── app.js               # 主入口
│   ├── auth.js              # 认证页面
│   ├── dashboard.js         # 连接管理
│   ├── terminal.js          # 终端页面
│   └── utils.js             # 工具函数
├── src/                     # Worker 后端
│   ├── index.ts             # 主入口 + 路由
│   ├── auth.ts              # 认证 API
│   ├── connections.ts       # 连接 CRUD API
│   ├── check.ts             # 状态检测 + IP 定位
│   └── ws.ts                # WebSocket ↔ TCP 代理
├── wrangler.toml            # Workers 配置
├── package.json
├── tsconfig.json
└── README.md
```

## ⚠️ 安全说明

- 密码使用 PBKDF2 + SHA-256 哈希存储（100,000 次迭代）
- SSH 连接密码和私钥以明文存储在 KV 中（建议仅用于内网或个人测试服务器）
- 认证令牌存储在 sessionStorage 中，关闭浏览器即失效
- 建议绑定自定义域名并启用 Cloudflare Access 增加额外安全层
- **TCP 出站连接需要 Workers Paid 计划（$5/月起）**

## 📄 许可

MIT License
