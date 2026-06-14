<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import CameraStage from '../components/CameraStage.vue'
import VoiceControl from '../components/VoiceControl.vue'
import { useImageCapture } from '../composables/useImageCapture'
import { useSpeechSynthesis } from '../composables/useSpeechSynthesis'
import { useConversation } from '../composables/useConversation'
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
} from 'lucide-vue-next'

// ---- Refs ----

const cameraStageRef = ref<InstanceType<typeof CameraStage> | null>(null)
const voiceControlRef = ref<InstanceType<typeof VoiceControl> | null>(null)
const messageListRef = ref<HTMLElement | null>(null)

// ---- Composables ----

const { snapshot, captureError, captureFrame, clearSnapshot } = useImageCapture()
const { isSpeaking, voiceError, speak, stop } = useSpeechSynthesis()
const {
  messages,
  isSending,
  sendMessage,
  retryMessage,
} = useConversation()

// ---- Camera helpers ----

function isCameraReady(): boolean {
  return cameraStageRef.value?.status === 'ready'
}

function handleCameraClose(): void {
  clearSnapshot()
}

// ---- Snapshot helpers ----

function handleCapture(): void {
  const videoEl = cameraStageRef.value?.videoRef ?? null
  captureFrame(videoEl)
}

function handleClearSnapshot(): void {
  clearSnapshot()
}

// ---- Voice → Capture → Send → Speak pipeline ----

async function handleFinalTranscript(question: string): Promise<void> {
  // Stop any ongoing speech when user asks a new question
  stop()

  if (!isCameraReady()) {
    // Camera not ready — can't send vision request
    // We'll still store the question for display, but inform the user
    return
  }

  // 1. Auto-capture current frame
  const videoEl = cameraStageRef.value?.videoRef ?? null
  const captureStart = performance.now()
  const captured = captureFrame(videoEl)
  const captureDurationMs = Math.round(performance.now() - captureStart)

  if (!captured || !snapshot.value) {
    // Frame capture failed — the captureError from useImageCapture has details
    return
  }

  const imageDataUrl = snapshot.value

  // 2. Build metrics
  const metrics: ClientMetrics = {
    original_bytes: imageDataUrl.length,
    compressed_bytes: imageDataUrl.length,
    capture_duration_ms: captureDurationMs,
  }

  // 3. Send to backend
  try {
    const assistantMsg = await sendMessage(question, imageDataUrl, metrics)

    // 4. Auto-speak the answer
    if (assistantMsg.content.trim()) {
      speak(assistantMsg.content)
    }

    // Clear snapshot after successful send
    clearSnapshot()
  } catch {
    // Error already stored on the user message by useConversation
    // Just clear the snapshot
  }
}

// ---- Retry ----

async function handleRetry(messageId: string): Promise<void> {
  stop()

  if (!isCameraReady()) return

  // Re-capture frame for retry
  const videoEl = cameraStageRef.value?.videoRef ?? null
  const captured = captureFrame(videoEl)
  if (!captured || !snapshot.value) return

  const imageDataUrl = snapshot.value

  try {
    const assistantMsg = await retryMessage(messageId, imageDataUrl)
    if (assistantMsg.content.trim()) {
      speak(assistantMsg.content)
    }
    clearSnapshot()
  } catch {
    // Error handled by composable
  }
}

// ---- Speech control ----

function handleStopSpeak(): void {
  stop()
}

// User starts speaking → stop current TTS
watch(
  () => voiceControlRef.value?.status,
  (newStatus) => {
    if (newStatus === 'listening') {
      stop()
    }
  },
)

// Auto-scroll message list when new messages arrive
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  },
)

</script>

<template>
  <div class="home-view">
    <!-- 主区域：摄像头 + 快照面板 -->
    <section class="main-area">
      <div class="camera-panel">
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
          <div v-if="snapshot && isSending" class="snapshot-display">
            <img :src="snapshot" alt="正在发送的关键帧" class="snapshot-image snapshot-sending" />
            <p class="snapshot-sending-text">
              <Loader2 :size="14" class="spin-icon" />
              正在观察并思考…
            </p>
          </div>
          <div v-else-if="snapshot" class="snapshot-display">
            <img :src="snapshot" alt="关键帧快照" class="snapshot-image" />
            <button class="btn btn-sm btn-outline" @click="handleClearSnapshot">
              <Trash2 :size="14" />
              <span>清除</span>
            </button>
          </div>
          <div v-else class="snapshot-placeholder">
            <Camera :size="36" class="placeholder-icon" />
            <p class="placeholder-text">
              点击「捕获关键帧」获取画面<br />或直接语音提问自动捕获
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

    <!-- 消息列表（对话展示） -->
    <section class="messages-section" v-if="messages.length > 0">
      <div class="messages-header">
        <MessageSquare :size="16" />
        <span>对话记录</span>
      </div>
      <div ref="messageListRef" class="messages-list">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-item"
          :class="`message-${msg.role} message-${msg.status}`"
        >
          <div class="message-role">
            {{ msg.role === 'user' ? '你' : 'SceneTalk' }}
          </div>
          <div class="message-content">
            <!-- Sending -->
            <template v-if="msg.status === 'sending'">
              <Loader2 :size="16" class="spin-icon" />
              <span class="sending-text">正在观察并思考…</span>
            </template>

            <!-- Done -->
            <template v-else-if="msg.status === 'done'">
              {{ msg.content }}
            </template>

            <!-- Error -->
            <template v-else-if="msg.status === 'error'">
              <div class="error-content">
                <AlertCircle :size="14" class="error-icon-inline" />
                <span>{{ msg.errorMessage || '发送失败' }}</span>
              </div>
              <button
                class="btn-retry"
                :disabled="isSending"
                @click="handleRetry(msg.id)"
              >
                <RefreshCw :size="14" />
                <span>重试</span>
              </button>
            </template>
          </div>
          <span v-if="msg.latencyMs && msg.status === 'done'" class="message-meta">
            {{ msg.latencyMs }}ms
          </span>
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
        <Camera :size="20" />
        <span>捕获关键帧</span>
      </button>

      <button
        v-if="isSpeaking"
        class="btn btn-stop"
        @click="handleStopSpeak"
      >
        <Square :size="18" />
        <span>停止播报</span>
      </button>

      <span class="control-hint">
        <template v-if="isSending">正在请求视觉模型…</template>
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
  padding: 1.5rem;
  gap: 1rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* ---- Main area ---- */
.main-area {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  min-height: 0;
}

.camera-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ---- Snapshot panel ---- */
.snapshot-panel {
  display: flex;
  flex-direction: column;
  background: #1e293b;
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #334155;
  color: #94a3b8;
}

.panel-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  min-height: 200px;
}

.snapshot-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.snapshot-image {
  width: 100%;
  border-radius: 8px;
  border: 2px solid #475569;
  display: block;
}

.snapshot-image.snapshot-sending {
  opacity: 0.6;
  border-color: #818cf8;
}

.snapshot-sending-text {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #818cf8;
  font-weight: 500;
}

.snapshot-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
}

.snapshot-placeholder .placeholder-icon {
  color: #334155;
}

.snapshot-placeholder .placeholder-text {
  color: #475569;
  font-size: 0.85rem;
  line-height: 1.5;
}

.capture-error {
  color: #f87171;
  font-size: 0.82rem;
  text-align: center;
  margin-top: 0.5rem;
}

/* ---- Voice section ---- */
.voice-section {
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid #334155;
}

/* ---- Messages section ---- */
.messages-section {
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid #334155;
  display: flex;
  flex-direction: column;
  max-height: 320px;
}

.messages-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #334155;
  font-size: 0.82rem;
  font-weight: 600;
  color: #94a3b8;
  flex-shrink: 0;
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
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  max-width: 85%;
}

.message-user {
  align-self: flex-end;
  background: #1e3a5f;
  border: 1px solid #2563eb;
}

.message-assistant {
  align-self: flex-start;
  background: #1a2e1a;
  border: 1px solid #166534;
}

.message-role {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.message-user .message-role {
  color: #60a5fa;
}

.message-assistant .message-role {
  color: #4ade80;
}

.message-content {
  font-size: 0.9rem;
  line-height: 1.55;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sending-text {
  color: #818cf8;
}

.message-meta {
  font-size: 0.7rem;
  color: #475569;
  align-self: flex-end;
}

/* Error state */
.message-error {
  border-color: #dc2626 !important;
}

.error-content {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  color: #fca5a5;
  font-size: 0.85rem;
}

.error-icon-inline {
  flex-shrink: 0;
  margin-top: 0.15rem;
  color: #f87171;
}

.btn-retry {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  cursor: pointer;
  align-self: flex-start;
  font-family: inherit;
}

.btn-retry:hover:not(:disabled) {
  background: #475569;
}

.btn-retry:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ---- Control bar ---- */
.control-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.4rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.2s, transform 0.1s;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.btn-capture {
  background: #818cf8;
  color: #0f172a;
}

.btn-capture:hover:not(:disabled) {
  background: #6366f1;
}

.btn-stop {
  background: #dc2626;
  color: #fff;
  padding: 0.5rem 0.9rem;
}

.btn-stop:hover {
  background: #b91c1c;
}

.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.82rem;
  border-radius: 6px;
}

.btn-outline {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
}

.btn-outline:hover {
  border-color: #f87171;
  color: #f87171;
}

.control-hint {
  color: #64748b;
  font-size: 0.85rem;
  margin-left: auto;
}

.speak-error {
  color: #f87171;
  font-size: 0.82rem;
}

/* ---- Utilities ---- */
.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
