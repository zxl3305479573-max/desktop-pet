# 🐾 Pet-Bot — 自定义桌面宠物

上传一张照片，AI 自动生成一个可在桌面上自由活动、拖拽交互的 2D 骨骼动画宠物。

> **平台**: Windows (Electron) | **状态**: MVP

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33.x-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/PixiJS-8.x-E72264" alt="PixiJS">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
</p>

---

## ✨ 功能

- 📸 **照片上传** — 上传人物/动物/角色照片，AI 自动拆解生成骨骼动画素材
- 🦴 **骨骼动画** — 基于 PixiJS 的 2D 骨骼系统，支持多部位独立运动
- 🖥️ **桌面悬浮** — 透明窗口 + 置顶，像真正的桌宠一样浮在桌面
- 🖱️ **拖拽交互** — 可拖拽移动，点击有反馈，行为树驱动自主空闲动作
- 🎛️ **多宠管理** — 创建、浏览、切换多个桌宠
- 🔑 **自定义 API Key** — 支持配置自己的 AI 模型 API Key

## 🏗️ 架构

```
┌─────────────────────────────────┐      ┌──────────────────────────┐
│       Electron Client            │      │     Web Backend           │
│                                  │      │     (Python FastAPI)      │
│  ┌───────────────────────────┐   │ HTTP │                          │
│  │  Main Window (React)      │───┼──────▶  • 用户管理              │
│  │  • 上传 / 浏览 / 设置      │   │      │  • Pet CRUD              │
│  └───────────────────────────┘   │      │  • AI Pipeline 调度       │
│                                  │      │  • 素材分发               │
│  ┌───────────────────────────┐   │      └──────────────────────────┘
│  │  Pet Window × N           │   │                │
│  │  (透明 / 置顶 / 无边框)    │   │                ▼
│  │  • PixiJS 骨骼渲染         │◀──┼──────  ┌──────────────────────┐
│  │  • 行为树空闲动画          │   │ load   │  AI Pipeline          │
│  │  • 点击 & 拖拽             │   │ .pet   │  1. 姿态估计           │
│  └───────────────────────────┘   │ 文件   │  2. 背景移除           │
│                                  │        │  3. 部件分割           │
│  ┌───────────────────────────┐   │        │  4. 部件风格化          │
│  │  托盘图标 & 右键菜单       │   │        │  5. 骨骼绑定           │
│  └───────────────────────────┘   │        │  6. 多视角预览          │
└─────────────────────────────────┘        └──────────────────────┘
```

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron 33 |
| 前端 UI | React 18 + TypeScript + Tailwind CSS |
| 状态管理 | Zustand |
| 骨骼渲染 | PixiJS 8 |
| 后端 | Python FastAPI + SQLite |
| AI Pipeline | 姿态估计 / 背景移除 / 部件分割 / 骨骼绑定 |
| 打包格式 | `.pet` (JSON + atlas.png 的 zip 包) |

## 📁 项目结构

```
pet-bot/
├── electron/              # Electron 主进程
│   ├── main.ts            # 应用入口
│   ├── windows.ts         # 窗口管理
│   ├── tray.ts            # 系统托盘
│   ├── preload.ts         # 预加载脚本
│   └── ipc-handlers.ts    # IPC 通信
├── src/                   # React 前端 (主窗口)
│   ├── pages/             # Home / Create / PetDetail / Settings
│   ├── components/        # UI 组件
│   ├── hooks/             # 自定义 Hooks
│   ├── lib/               # API 客户端 & 本地数据库
│   └── store/             # Zustand 状态
├── pet-renderer/          # 桌宠渲染器 (Pet Window)
│   ├── index.ts           # PixiJS 应用入口
│   ├── skeleton.ts        # 2D 骨骼系统
│   ├── behavior.ts        # 行为树 (空闲动画)
│   └── interaction.ts     # 拖拽 & 点击
├── pet-bot-server/        # Python 后端
│   ├── app/
│   │   ├── routers/       # API 路由
│   │   ├── services/      # AI Pipeline / 动作帧 / 骨骼绑定
│   │   ├── providers/     # AI 模型提供商
│   │   └── validators/    # .pet 包校验
│   └── tests/
├── shared/                # 前后端共享类型
└── docs/                  # 设计文档 & 实现计划
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+
- Windows 10/11

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/zxl3305479573-max/desktop-pet.git
cd pet-bot

# 2. 安装前端依赖
npm install

# 3. 配置后端
cd pet-bot-server
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env      # 编辑 .env 填入你的 API Key

# 4. 启动开发环境
cd ..
npm run dev               # 同时启动 Vite + Electron + Backend
```

### 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动完整开发环境 (前端 + Electron + 后端) |
| `npm run dev:renderer` | 仅启动 Vite 前端 |
| `npm run dev:electron` | 仅启动 Electron |
| `npm run dev:backend` | 仅启动 FastAPI 后端 |
| `npm run build` | 构建生产版本 |

## ⚙️ 配置

在 `pet-bot-server/.env` 中配置：

```env
BUILTIN_PROVIDER_KEY=your-api-key    # AI 模型 API Key
BUILTIN_MODEL=gpt-image-2            # 模型名称
BUILTIN_API_BASE=https://www.micuapi.ai/v1  # API 地址
JWT_SECRET=your-secret               # JWT 密钥 (生产环境务必修改)
MAX_FREE_GENERATIONS=5               # 免费生成配额
```

## 📄 License

MIT
