# 🔌 WorkersSSH

> 基于 Cloudflare Workers 的纯浏览器端 SSH 管理工具 - 无需任何后端服务器

基于 [luckyf1oat/workersssh](https://github.com/luckyf1oat/workersssh) 开发

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luckyf1oat/workersssh)

## ✨ 功能特性

- 🔐 **密码认证** - 首次使用设置密码，后续登录验证，保护你的 SSH 连接安全
- 📋 **连接管理** - 支持添加、编辑、改名、删除 SSH 连接，自动保存到 KV
- 🌐 **状态检测** - 每次打开自动检测每个 SSH 的连通状态，显示在线/离线
- 🚩 **IP 地理定位** - 自动检测服务器 IP 归属地，显示对应国家的国旗 emoji
- 🖥️ **Web 终端** - 基于 xterm.js 的完整终端体验，支持 ANSI 颜色
- 📋 **选中自动复制** - 鼠标选中文本自动复制到剪贴板，无需手动操作
- ⚡ **快捷命令** - 预置 12 个常用 Linux 命令，一键发送到终端
- 🔄 **自动重连** - 连接断开后按 R 键快速重连

## 🚀 一键部署

### 方式一：Deploy to Cloudflare 按钮

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luckyf1oat/workersssh)

点击上方按钮，Cloudflare 将自动：
1. Fork 仓库到你的 GitHub
2. 创建 KV Namespace 并自动绑定
3. 部署 Worker

### 方式二：手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/luckyf1oat/workersssh.git
cd workersssh

# 2. 安装依赖
npm install

# 3. 一键部署（自动创建 KV + 部署 Worker）
npm run deploy
```

`npm run deploy` 脚本会自动完成：
- ✅ 检查是否已存在 KV Namespace
- ✅ 如不存在则自动创建 `workersssh-kv`
- ✅ 自动更新 `wrangler.toml` 中的 KV ID
- ✅ 部署 Worker 到 Cloudflare

### 本地开发测试

```bash
npm run dev
```

## 🛠️ 技术栈

| 技术 | 用途 |
|---|---|
| **Cloudflare Workers** | 无服务器运行环境 |
| **Cloudflare KV** | 数据持久化存储（密码、连接配置、IP 缓存） |
| **Workers Socket API** | 原生 TCP 连接（`connect()`） |
| **itty-router** | 轻量级路由 |
| **xterm.js** | Web 终端模拟器 |
| **Web Crypto API** | 密码哈希（PBKDF2 + SHA-256） |
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
- **改名** - 点击名称直接编辑（点击 → 输入新名称 → Enter）
- **编辑** - 点击 ✏️ 按钮修改连接信息
- **删除** - 点击 🗑️ 按钮确认删除

### 终端使用

- **选中复制** - 鼠标选中任意文本自动复制
- **快捷命令** - 点击底部命令按钮一键执行（12 个预置命令）
- **清屏** - 点击 🧹 按钮
- **重连** - 按 `R` 键或点击 🔄 按钮
- **返回** - 按 `ESC` 键或点击 ◀ 按钮

### 预置快捷命令

| 命令 | 用途 |
|---|---|
| `ls -la` | 列出文件详情 |
| `df -h` | 磁盘使用情况 |
| `free -m` | 内存使用 |
| `top -bn1 \| head -20` | 进程排名 |
| `ps aux --sort=-%mem \| head -10` | 按内存排序进程 |
| `netstat -tlnp` | 监听端口 |
| `whoami` | 当前用户 |
| `uptime` | 运行时长 |
| `uname -a` | 系统内核信息 |
| `cat /etc/os-release` | 操作系统版本 |
| `docker ps` | Docker 容器列表 |
| `systemctl list-units...` | 运行中的服务 |

## 📁 项目结构

```
workersssh/
├── public/                  # 前端静态资源
│   ├── index.html           # SPA 入口
│   ├── app.css              # 暗黑主题样式
│   ├── app.js               # 主入口
│   ├── auth.js              # 登录/设置页面
│   ├── dashboard.js         # 连接管理 + 快捷命令
│   ├── terminal.js          # xterm.js 终端
│   └── utils.js             # 工具函数
├── src/                     # Worker 后端
│   ├── index.ts             # 路由 + 静态资源
│   ├── auth.ts              # 认证 (PBKDF2)
│   ├── connections.ts       # 连接 CRUD
│   ├── check.ts             # 状态检测 + IP 定位
│   └── ws.ts                # WebSocket ↔ TCP
├── scripts/
│   └── deploy.js            # 自动部署脚本
├── wrangler.toml
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