# CLAUDE.md

## Project

SceneTalk — AI 视觉对话助手（比赛项目）。通过摄像头理解用户当前看到的场景，听取用户的语音问题，并用文字和自然语音作出连续回答。

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Vite, Pinia, lucide-vue-next, 原生 CSS
- **Backend**: Python 3.11, FastAPI, Pydantic, OpenAI Python SDK, Uvicorn
- **Visual Model**: 阿里云百炼 OpenAI 兼容接口（qwen3.5-plus 或同系视觉模型）

## Directory Structure

```
SceneTalk/
├─ frontend/        Vue 3 + TypeScript 前端
├─ backend/         FastAPI 后端
├─ docs/            设计文档和测试报告
├─ CLAUDE.md        本文件
├─ README.md        项目说明
└─ .env.example     环境变量模板
```

## Commands

### Frontend

```bash
cd frontend
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 生产构建
npm run preview      # 预览生产构建
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Development Rules

1. 按阶段逐步开发，每阶段只实现当前功能
2. 每阶段完成后执行构建测试，不允许 TypeScript/ESLint/Python 错误
3. 不伪造接口数据作为正式功能
4. 所有密钥通过环境变量读取，禁止硬编码
5. 不开发登录、注册、数据库、RAG、数字人、连续视频流等非核心功能
6. 不使用非必要依赖
7. 不执行 git push、PR 合并或 force push
8. 每次 commit 前先报告
9. 每个阶段结束后输出：修改文件清单、已完成功能、测试结果、已知问题、建议 commit 信息、PR 描述草稿

## Key Design Decisions

- 使用关键帧模式（非视频流）：降低推理费用和开发复杂度
- 图片压缩：前端 JPEG 压缩，限制 500KB
- 上下文管理：最近 4 轮对话，只传文本历史
- 中文语音：浏览器 SpeechRecognition + SpeechSynthesis
