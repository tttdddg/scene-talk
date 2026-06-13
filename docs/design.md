# SceneTalk 设计文档

## 1. 项目概述

SceneTalk 是一个面向日常视觉辅助场景的中文视觉对话助手。用户通过摄像头展示当前场景，使用语音提问，系统截取关键帧并结合视觉模型给出回答，以文字和语音形式呈现。

### 1.1 核心设计理念

**端云协同与成本控制**：采用"实时摄像头预览 + 关键帧按需上传"模式，而非连续视频流。这带来以下优势：

- 降低推理费用（仅在用户提问时调用模型）
- 减少网络传输（单张 JPEG 图片，控制在 500KB 内）
- 降低开发复杂度（无需处理流式视频编码和 WebSocket）
- 提高 Demo 稳定性（请求-响应模式，易于调试和降级）

## 2. 系统架构

```
┌──────────────┐     HTTP/JSON      ┌──────────────┐
│   Browser    │ ──────────────────> │   FastAPI    │
│              │ <────────────────── │   Backend    │
│ Vue 3 + TS   │                     │              │
│ Web Speech   │                     │ OpenAI SDK   │
│ MediaStream  │                     │              │
└──────────────┘                     └──────┬───────┘
                                            │ OpenAI 兼容 API
                                     ┌──────┴───────┐
                                     │  视觉模型     │
                                     │  (QWen/etc)   │
                                     └──────────────┘
```

## 3. 技术选型

### 3.1 前端

| 依赖              | 用途           |
| ----------------- | -------------- |
| Vue 3             | UI 框架        |
| TypeScript        | 类型安全       |
| Vite              | 构建工具       |
| Pinia             | 状态管理       |
| lucide-vue-next   | 图标库         |
| 原生 CSS           | 样式           |
| Web Speech API    | 语音识别/合成  |
| MediaStream API   | 摄像头访问     |

### 3.2 后端

| 依赖               | 用途              |
| ------------------ | ----------------- |
| Python 3.11        | 运行时            |
| FastAPI            | Web 框架          |
| Pydantic           | 数据校验          |
| OpenAI Python SDK  | 视觉模型客户端    |
| Uvicorn            | ASGI 服务器       |

## 4. 数据流

### 4.1 核心交互流程

```
用户点击麦克风
    → SpeechRecognition 开始识别
    → interimResult 显示临时文本
    → 识别结束，获得最终文本
    → 从 <video> 截取当前帧到 <canvas>
    → Canvas 压缩为 JPEG (最长边 1024px, quality 0.72)
    → 如果超过 500KB，quality 降至 0.6
    → POST /api/v1/vision/chat { question, image, history, clientMetrics }
    → 后端调用视觉模型（30s 超时）
    → 返回 { answer, latencyMs, usage, ... }
    → 页面显示回答，同时 speechSynthesis 播放语音
```

### 4.2 上下文管理

- 前端 Pinia store 保存最近 4 轮对话（8 条消息）
- 发送给后端时只传文本历史，不传历史图片
- 每条消息包含 `role`, `content`, `createdAt`
- 超长回答在发送前截断

## 5. API 设计

### 5.1 健康检查

```
GET /api/v1/health
→ { "status": "ok", "service": "scenetalk-api" }
```

### 5.2 视觉问答

```
POST /api/v1/vision/chat
Content-Type: application/json

Request:
{
  "question": string,
  "image": "data:image/jpeg;base64,...",
  "history": [{ "role": "user" | "assistant", "content": string }],
  "clientMetrics": {
    "originalBytes": number,
    "compressedBytes": number,
    "captureDurationMs": number
  }
}

Response (200):
{
  "requestId": "uuid",
  "answer": string,
  "model": string,
  "latencyMs": number,
  "historyRounds": number,
  "usage": { "inputTokens": number | null, "outputTokens": number | null }
}

Error Response:
{
  "code": string,
  "message": string,
  "requestId": "uuid"
}
```

## 6. 视觉模型提示词

系统提示词要求模型：
1. 只描述可确认的内容
2. 无法确认时明确说明
3. 不识别真实人物身份
4. 支持代词指代理解
5. 回答 1-4 句话，适合语音播报
6. 优先直接回答问题
7. 对数量/颜色/文字保持谨慎
8. 画面不佳时建议调整摄像头
9. 不使用 Markdown 表格
10. 避免重复套话

## 7. 页面布局

桌面端双栏布局：
- 左侧：摄像头实时画面 + 当前快照/状态提示
- 右侧：对话记录 + AI 回答气泡
- 底部：指标面板（压缩率、耗时、上下文）+ 语音识别文字 + 麦克风按钮

## 8. 异常处理策略

| 异常               | 处理                                       |
| ------------------ | ------------------------------------------ |
| 摄像头权限拒绝     | 显示引导文字，建议在浏览器设置中允许       |
| 麦克风权限拒绝     | 显示引导文字，建议检查系统输入设备         |
| 浏览器不支持语音   | 显示提示，降级为文字输入（调试模式）        |
| 图片过大           | 前端再次压缩；仍过大则不发送并提示         |
| 模型超时 (30s)     | 取消请求，提示稍后重试                     |
| 模型限流           | 提示稍等几秒                               |
| 模型返回空内容     | 提示重新描述问题                           |
| 重复点击           | 请求处理中禁用按钮                         |

## 9. 开发阶段

| PR  | 阶段         | 内容                                         |
| --- | ------------ | -------------------------------------------- |
| 1   | 摄像头       | 权限申请、实时预览、截帧、基础布局            |
| 2   | 语音交互     | 语音识别、临时文本、最终确认、语音播报        |
| 3   | 后端集成     | FastAPI、视觉模型、前后端联通、完整闭环        |
| 4   | 完善         | 图片压缩、上下文管理、防重复提交、超时、统计  |
| 5   | UI 美化      | 样式优化、动画、对话气泡、指标面板             |
| 6   | 异常处理     | 权限拒绝、降级处理、各种错误提示               |
