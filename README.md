# SceneTalk —— 能看见的 AI 对话助手

SceneTalk 通过摄像头理解用户当前看到的场景，听取用户的语音提问，并用文字和自然语音作出连续回答。

## 核心流程

```
开启摄像头 → 用户语音提问 → 语音识别 → 截取关键帧
    → 图片压缩 → 视觉模型分析 → 文字回答 + 语音播报 → 继续追问
```

## 技术栈

| 层     | 技术                                |
| ------ | ----------------------------------- |
| 前端   | Vue 3, TypeScript, Vite, Pinia      |
| 后端   | Python 3.11, FastAPI, Pydantic      |
| 视觉   | OpenAI 兼容接口（阿里云百炼等）     |
| 语音   | Web Speech API (识别 + 合成)        |

## 快速开始

### 1. 环境准备

```bash
# 前端
cd frontend
npm install

# 后端
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env         # 根目录
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# 编辑 backend/.env，填入视觉模型密钥
VISION_API_KEY=your_api_key_here
```

### 3. 启动

```bash
# 终端 1：启动后端
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 终端 2：启动前端
cd frontend
npm run dev
```

访问 http://localhost:5173

## 功能特性

- 浏览器摄像头实时预览
- 中文语音识别与合成
- 自动截取关键帧并压缩
- 视觉模型场景理解与问答
- 最近 4 轮对话上下文
- 图片压缩率和请求耗时展示
- 完善的异常处理和降级策略

## 项目结构

详见 [CLAUDE.md](CLAUDE.md) 和 [设计文档](docs/design.md)。

## 许可证

MIT License
