<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import CameraStage from '../components/CameraStage.vue'
import VoiceControl from '../components/VoiceControl.vue'
import { useImageCapture } from '../composables/useImageCapture'
import { useSpeechSynthesis } from '../composables/useSpeechSynthesis'
import { useConversationStore } from '../stores/conversation'
import type { ClientMetrics } from '../api/visionChat'
import {
  Camera,
  Image,
  Trash2,
  Square,
  RefreshCw,
  Loader2,
  MessageSquare,
  AlertCircle,
  Gauge,
  XCircle,
  Trash,
} from 'lucide-vue-next'

// ---- Refs ----

const cameraStageRef = ref<InstanceType<typeof CameraStage> | null>(null)
const voiceControlRef = ref<InstanceType<typeof VoiceControl> | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
const showMetrics = ref(false)

// ---- Composables & Store ----

const { snapshot, captureError, lastMetrics: captureMetrics, captureFrame, clearSnapshot } = useImageCapture()
const { isSpeaking, voiceError, speak, stop } = useSpeechSynthesis()
const store = useConversationStore()

// ---- Camera helpers ----

function isCameraReady(): boolean {
  return cameraStageRef.value?.status === 'ready'
}

function handleCameraClose(): void {
  clearSnapshot()
}

// ---- Snapshot helpers ----

async function handleCapture(): Promise<void> {
  const videoEl = cameraStageRef.value?.videoRef ?? null
  await captureFrame(videoEl)
}

function handleClearSnapshot(): void {
  clearSnapshot()
}

// ---- Voice → Capture → Send → Speak pipeline ----

async function handleFinalTranscript(question: string): Promise<void> {
  // Stop any ongoing speech
  stop()

  if (!isCameraReady()) return

  // Cancel any in-flight request
  store.cancelRequest()

  // 1. Auto-capture + compress
  const videoEl = cameraStageRef.value?.videoRef ?? null
  const captured = await captureFrame(videoEl)

  if (!captured || !snapshot.value) return

  const metrics = captureMetrics.value
  const imageDataUrl = snapshot.value

  // 2. Build client metrics
  const clientMetrics: ClientMetrics = {
    original_bytes: metrics?.originalBytes ?? imageDataUrl.length,
    compressed_bytes: metrics?.compressedBytes ?? imageDataUrl.length,
    capture_duration_ms:
      (metrics?.captureDurationMs ?? 0) + (metrics?.compressionDurationMs ?? 0),
  }

  // 3. Send to backend
  try {
    const assistantMsg = await store.sendMessage(question, imageDataUrl, clientMetrics)

    // Patch in compression timing
    if (metrics) {
      store.patchMetrics({
        compressionDurationMs: metrics.compressionDurationMs,
        originalBytes: metrics.originalBytes,
        compressedBytes: metrics.compressedBytes,
        compressionRatio: metrics.compressionRatio,
        captureDurationMs: metrics.captureDurationMs,
      })
    }

    // Show metrics after successful send
    showMetrics.value = true

    // 4. Auto-speak
    if (assistantMsg.content.trim()) {
      speak(assistantMsg.content)
    }

    clearSnapshot()
  } catch {
    // Error stored on the message by the store
  }
}

// ---- Retry ----

async function handleRetry(messageId: string): Promise<void> {
  stop()
  store.cancelRequest()

  if (!isCameraReady()) return

  const videoEl = cameraStageRef.value?.videoRef ?? null
  const captured = await captureFrame(videoEl)
  if (!captured || !snapshot.value) return

  const metrics = captureMetrics.value
  const imageDataUrl = snapshot.value

  const clientMetrics: ClientMetrics = {
    original_bytes: metrics?.originalBytes ?? imageDataUrl.length,
    compressed_bytes: metrics?.compressedBytes ?? imageDataUrl.length,
    capture_duration_ms:
      (metrics?.captureDurationMs ?? 0) + (metrics?.compressionDurationMs ?? 0),
  }

  try {
    const assistantMsg = await store.retryMessage(messageId, imageDataUrl, clientMetrics)
    if (metrics) {
      store.patchMetrics({
        compressionDurationMs: metrics.compressionDurationMs,
        originalBytes: metrics.originalBytes,
        compressedBytes: metrics.compressedBytes,
        compressionRatio: metrics.compressionRatio,
        captureDurationMs: metrics.captureDurationMs,
      })
    }
    if (assistantMsg.content.trim()) speak(assistantMsg.content)
    clearSnapshot()
  } catch {
    // handled by store
  }
}

// ---- Cancel ----

function handleCancelRequest(): void {
  store.cancelRequest()
}

// ---- Clear session ----

function handleClearSession(): void {
  stop()
  store.clearSession()
  clearSnapshot()
  showMetrics.value = false
}

// ---- Speech ----

function handleStopSpeak(): void {
  stop()
}

// User starts speaking → stop TTS + cancel request
watch(
  () => voiceControlRef.value?.status,
  (newStatus) => {
    if (newStatus === 'listening') {
      stop()
      store.cancelRequest()
    }
  },
)

// Auto-scroll
watch(
  () => store.messages.length,
  async () => {
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  },
)

// Cleanup on unmount
onUnmounted(() => {
  store.cancelRequest()
})

// ---- Formatting ----

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatRatio(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
</script>

<template>
  <div class="home-view">
    <!-- 主区域：摄像头 + 快照面板 -->
    <section class="main-area">
      <div class="camera-panel">
        <div class="panel-label">摄像头实时画面</div>
        <CameraStage
          ref="cameraStageRef"
          @close="handleCameraClose"
        />
      </div>

      <aside class="snapshot-panel">
        <div class="panel-header">
          <Image :size="18" />
          <h2 class="panel-title">关键帧快照</h2>
        </div>
        <div class="panel-body">
          <!-- Sending -->
          <div v-if="snapshot && store.isSending" class="snapshot-display">
            <img :src="snapshot" alt="正在发送的关键帧" class="snapshot-image snapshot-sending" />
            <p class="snapshot-sending-text">
              <Loader2 :size="14" class="spin-icon" />
              正在观察并思考…
            </p>
            <button class="btn btn-sm btn-outline" @click="handleCancelRequest">
              <XCircle :size="14" />
              <span>取消</span>
            </button>
          </div>
          <!-- Idle snapshot -->
          <div v-else-if="snapshot" class="snapshot-display">
            <img :src="snapshot" alt="关键帧快照" class="snapshot-image" />
            <button class="btn btn-sm btn-outline" @click="handleClearSnapshot">
              <Trash2 :size="14" />
              <span>清除</span>
            </button>
          </div>
          <!-- Placeholder -->
          <div v-else class="snapshot-placeholder">
            <Camera :size="36" class="placeholder-icon" />
            <p class="placeholder-text">
              语音提问自动捕获<br />或点击下方按钮手动截图
            </p>
          </div>
          <p v-if="captureError" class="capture-error">{{ captureError }}</p>
        </div>
      </aside>
    </section>

    <!-- 语音交互区域 -->
    <section class="voice-section">
      <VoiceControl
        ref="voiceControlRef"
        @final-transcript="handleFinalTranscript"
      />
    </section>

    <!-- 消息列表 -->
    <section v-if="store.messages.length > 0" class="messages-section">
      <div class="messages-header">
        <MessageSquare :size="16" />
        <span>对话记录</span>
        <span class="context-badge">{{ store.contextRounds }} 轮上下文</span>
        <button class="btn-clear-session" @click="handleClearSession">
          <Trash :size="14" />
          <span>清空</span>
        </button>
      </div>
      <div ref="messageListRef" class="messages-list">
        <div
          v-for="msg in store.messages"
          :key="msg.id"
          class="message-item"
          :class="`message-${msg.role} message-${msg.status}`"
        >
          <div class="message-bubble">
            <div class="message-role">
              {{ msg.role === 'user' ? '你' : 'SceneTalk' }}
            </div>
            <div class="message-content">
              <template v-if="msg.status === 'sending'">
                <Loader2 :size="14" class="spin-icon" />
                <span class="sending-text">正在观察并思考…</span>
              </template>
              <template v-else-if="msg.status === 'done'">
                {{ msg.content }}
              </template>
              <template v-else-if="msg.status === 'error'">
                <div class="error-content">
                  <AlertCircle :size="14" class="error-icon-inline" />
                  <span>{{ msg.errorMessage || '发送失败' }}</span>
                </div>
                <button
                  class="btn-retry"
                  :disabled="store.isSending"
                  @click="handleRetry(msg.id)"
                >
                  <RefreshCw :size="14" />
                  <span>重试</span>
                </button>
              </template>
            </div>
          </div>
          <span
            v-if="msg.latencyMs && msg.status === 'done' && msg.role === 'assistant'"
            class="message-meta"
          >
            模型响应 {{ msg.latencyMs }}ms
          </span>
        </div>
      </div>
    </section>

    <!-- 性能指标面板 -->
    <section v-if="showMetrics && store.lastMetrics" class="metrics-section">
      <div class="metrics-header">
        <Gauge :size="16" />
        <span>性能指标</span>
        <span class="context-badge" style="margin-left:0.5rem">请求 #{{ store.messages.filter(m => m.role === 'user').length }}</span>
        <button class="btn-toggle-metrics" @click="showMetrics = false">
          <XCircle :size="14" />
        </button>
      </div>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">原始图片</span>
          <span class="metric-value">{{ formatBytes(store.lastMetrics.originalBytes) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">压缩后</span>
          <span class="metric-value">{{ formatBytes(store.lastMetrics.compressedBytes) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">压缩率</span>
          <span class="metric-value">{{ formatRatio(store.lastMetrics.compressionRatio) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">捕获耗时</span>
          <span class="metric-value">{{ formatMs(store.lastMetrics.captureDurationMs) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">模型耗时</span>
          <span class="metric-value">{{ formatMs(store.lastMetrics.modelLatencyMs) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">端到端总耗时</span>
          <span class="metric-value">{{ formatMs(store.lastMetrics.e2eLatencyMs) }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">上下文轮数</span>
          <span class="metric-value">{{ store.lastMetrics.contextRounds }} / {{ 4 }}</span>
        </div>
      </div>
    </section>

    <!-- 底部控制栏 -->
    <footer class="control-bar">
      <button
        class="btn btn-capture"
        :disabled="!isCameraReady()"
        @click="handleCapture"
      >
        <Camera :size="18" />
        <span>捕获关键帧</span>
      </button>

      <button
        v-if="store.isSending"
        class="btn btn-cancel"
        @click="handleCancelRequest"
      >
        <XCircle :size="16" />
        <span>取消请求</span>
      </button>

      <button
        v-if="isSpeaking"
        class="btn btn-stop"
        @click="handleStopSpeak"
      >
        <Square :size="16" />
        <span>停止播报</span>
      </button>

      <span class="control-hint">
        <template v-if="store.isSending">正在请求视觉模型…</template>
        <template v-else-if="isSpeaking">正在播报…</template>
        <template v-else-if="isCameraReady()">可以语音提问或手动截图</template>
        <template v-else>请先开启摄像头</template>
      </span>

      <span v-if="voiceError" class="speak-error">{{ voiceError }}</span>
    </footer>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 1.25rem 1.5rem 1.5rem;
  gap: 0.85rem;
  max-width: 1160px;
  margin: 0 auto;
  width: 100%;
}

/* ---- Main area ---- */
.main-area {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1rem;
  min-height: 0;
}

.camera-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0.4rem;
}

.panel-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-left: 0.25rem;
}

/* ---- Snapshot panel ---- */
.snapshot-panel {
  display: flex;
  flex-direction: column;
  background: #0f1420;
  border-radius: 12px;
  border: 1px solid #1e293b;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #1e293b;
  color: #64748b;
  background: #0c1019;
}

.panel-title { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin: 0; }

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  min-height: 200px;
}

.snapshot-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
}

.snapshot-image {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #334155;
  display: block;
}

.snapshot-image.snapshot-sending {
  opacity: 0.6;
  border-color: #6366f1;
}

.snapshot-sending-text {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.82rem; color: #818cf8; font-weight: 500;
}

.snapshot-placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem; text-align: center;
}

.snapshot-placeholder .placeholder-icon { color: #1e293b; }
.snapshot-placeholder .placeholder-text { color: #475569; font-size: 0.8rem; line-height: 1.5; }

.capture-error { color: #f87171; font-size: 0.78rem; text-align: center; margin-top: 0.4rem; }

/* ---- Voice ---- */
.voice-section {
  background: #0f1420;
  border-radius: 12px;
  border: 1px solid #1e293b;
}

/* ---- Messages ---- */
.messages-section {
  background: #0f1420;
  border-radius: 12px;
  border: 1px solid #1e293b;
  display: flex;
  flex-direction: column;
  max-height: 300px;
}

.messages-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #1e293b;
  font-size: 0.8rem;
  font-weight: 600;
  color: #94a3b8;
  flex-shrink: 0;
  background: #0c1019;
}

.context-badge {
  margin-left: auto;
  margin-right: 0.5rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.12);
  padding: 0.15rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.btn-clear-session {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: #94a3b8;
  background: none;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.18rem 0.5rem;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.btn-clear-session:hover {
  color: #f87171;
  border-color: #dc262644;
  background: rgba(220, 38, 38, 0.08);
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 88%;
}

.message-user { align-self: flex-end; }
.message-assistant { align-self: flex-start; }

.message-bubble {
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
}

.message-user .message-bubble {
  background: #1e3a5f;
  border: 1px solid #2563eb44;
  border-bottom-right-radius: 4px;
}

.message-assistant .message-bubble {
  background: #0d1a0d;
  border: 1px solid #16653444;
  border-bottom-left-radius: 4px;
}

.message-error .message-bubble {
  border-color: #dc262644 !important;
}

.message-role {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 0.2rem;
}
.message-user .message-role { color: #60a5fa; }
.message-assistant .message-role { color: #4ade80; }

.message-content {
  font-size: 0.88rem;
  line-height: 1.55;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.message-user .message-content {
  color: #dbeafe;
}

.message-assistant .message-content {
  color: #dcfce7;
}

.sending-text { color: #818cf8; font-size: 0.85rem; }
.message-meta {
  font-size: 0.65rem;
  color: #475569;
  align-self: flex-end;
  margin-top: 0.1rem;
}

.error-content { display: flex; align-items: flex-start; gap: 0.3rem; color: #fca5a5; font-size: 0.83rem; }
.error-icon-inline { flex-shrink: 0; margin-top: 0.12rem; color: #f87171; }

.btn-retry {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.25rem 0.65rem; border-radius: 6px; margin-top: 0.35rem;
  font-size: 0.78rem; font-weight: 600;
  background: #1e293b; color: #cbd5e1;
  border: 1px solid #334155; cursor: pointer; font-family: inherit;
  transition: background 0.2s, border-color 0.2s;
}
.btn-retry:hover:not(:disabled) { background: #334155; border-color: #475569; }
.btn-retry:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- Metrics ---- */
.metrics-section {
  background: #0f1420;
  border-radius: 12px;
  border: 1px solid #1e293b;
  overflow: hidden;
}

.metrics-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #1e293b;
  font-size: 0.8rem;
  font-weight: 600;
  color: #94a3b8;
  background: #0c1019;
}

.btn-toggle-metrics {
  margin-left: auto;
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  padding: 0.15rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}
.btn-toggle-metrics:hover { color: #94a3b8; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.65rem;
  padding: 0.85rem 1rem;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  background: #0c1019;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  border: 1px solid #1e293b;
}

.metric-label {
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-value {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
}

/* ---- Control bar ---- */
.control-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.15rem 0;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.btn {
  display: inline-flex; align-items: center; gap: 0.45rem;
  padding: 0.55rem 1.2rem; border-radius: 8px;
  font-size: 0.85rem; font-weight: 600;
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
  border: none; cursor: pointer; font-family: inherit;
}

.btn:active:not(:disabled) { transform: scale(0.97); }
.btn:disabled { cursor: not-allowed; opacity: 0.35; }

.btn-capture {
  background: linear-gradient(135deg, #818cf8, #6366f1);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}
.btn-capture:hover:not(:disabled) {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.btn-cancel { background: #d97706; color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; }
.btn-cancel:hover { background: #b45309; }

.btn-stop { background: #dc2626; color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; }
.btn-stop:hover { background: #b91c1c; }

.btn-sm { padding: 0.3rem 0.65rem; font-size: 0.78rem; border-radius: 6px; }

.btn-outline {
  background: transparent; border: 1px solid #334155; color: #94a3b8;
  transition: border-color 0.2s, color 0.2s;
}
.btn-outline:hover { border-color: #f87171; color: #f87171; }

.control-hint { color: #475569; font-size: 0.8rem; margin-left: auto; }
.speak-error { color: #f87171; font-size: 0.78rem; }

/* ---- Utilities ---- */
.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
