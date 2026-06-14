<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { Mic, MicOff, AlertTriangle, VolumeX } from 'lucide-vue-next'

const emit = defineEmits<{
  'final-transcript': [text: string]
}>()

const textInput = ref('')

function handleTextSubmit(): void {
  const text = textInput.value.trim()
  if (!text) return
  emit('final-transcript', text)
  textInput.value = ''
}

const {
  status,
  interimTranscript,
  finalTranscript,
  errorMessage,
  startListening,
  stopListening,
  resetTranscript,
} = useSpeechRecognition()

// 暴露 status 给父组件，用于在用户开始说话时停止 TTS 播报
defineExpose({ status })

// 当 status 从 processing 变为 idle 且有 finalTranscript 时，触发 emit
// （Demo 模式跳过——由 handleMicClick 直接 emit）
watch(status, (newStatus, oldStatus) => {
  if (DEMO_MODE) return
  if (
    newStatus === 'idle' &&
    (oldStatus === 'processing' || oldStatus === 'listening') &&
    finalTranscript.value.trim().length > 0
  ) {
    emit('final-transcript', finalTranscript.value.trim())
  }
})

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

function handleMicClick(): void {
  if (status.value === 'listening' || status.value === 'processing') {
    stopListening()
    return
  }

  // Demo 模式：点击即触发，模拟"正在听"后直接发送问题
  if (DEMO_MODE) {
    if (status.value === 'error') {
      // 从 error 恢复，让 UI 可用
      resetTranscript()
    }
    status.value = 'listening'
    setTimeout(() => {
      status.value = 'processing'
      setTimeout(() => {
        const question = '图片里有什么？'
        finalTranscript.value = question
        status.value = 'idle'
        emit('final-transcript', question)
      }, 400)
    }, 600)
    return
  }

  startListening()
}

function handleClear(): void {
  resetTranscript()
}

// 判断按钮是否可交互
function isActionDisabled(): boolean {
  return status.value === 'processing'
}

function buttonLabel(): string {
  switch (status.value) {
    case 'listening':
      return '点击结束'
    case 'processing':
      return '识别中…'
    default:
      return '点击说话'
  }
}

function statusLabel(): string {
  switch (status.value) {
    case 'listening':
      return '正在聆听…'
    case 'processing':
      return '正在识别…'
    case 'idle':
      return finalTranscript.value ? '识别完成' : ''
    default:
      return ''
  }
}
</script>

<template>
  <div class="voice-control">
    <!-- 不支持语音识别：轻量提示 -->
    <div v-if="status === 'unsupported'" class="voice-warning-banner">
      <VolumeX :size="16" />
      <span>浏览器不支持语音识别，请使用文字输入</span>
    </div>

    <!-- 权限拒绝 -->
    <div v-if="status === 'denied'" class="voice-denied">
      <MicOff :size="36" class="voice-error-icon" />
      <p class="voice-error-text">{{ errorMessage }}</p>
      <div class="voice-help-box">
        <p class="voice-help-title">恢复麦克风权限：</p>
        <ol class="voice-help-steps">
          <li>点击地址栏左侧的 <strong>锁定图标</strong></li>
          <li>找到 <strong>麦克风</strong> 权限</li>
          <li>改为 <strong>允许</strong></li>
          <li>刷新页面后重试</li>
        </ol>
      </div>
    </div>

    <!-- 网络错误：不阻塞，文本输入仍可用 -->
    <div v-if="status === 'error'" class="voice-warning-banner">
      <AlertTriangle :size="16" />
      <span>语音识别不可用（网络限制），请使用下方文字输入</span>
    </div>

    <!-- 麦克风按钮 + 文字输入（始终可见，除 denied 外） -->
    <div v-if="status !== 'denied'" class="voice-active">
      <!-- 麦克风按钮 -->
      <button
        class="mic-button"
        :class="{
          'mic-listening': status === 'listening',
          'mic-processing': status === 'processing',
        }"
        :disabled="isActionDisabled()"
        :aria-label="buttonLabel()"
        @click="handleMicClick"
      >
        <span v-if="status === 'listening'" class="mic-pulse-ring" />
        <Mic
          v-if="status !== 'listening'"
          :size="32"
          class="mic-icon"
        />
        <Mic
          v-else
          :size="32"
          class="mic-icon mic-icon-active"
        />
      </button>

      <p v-if="statusLabel()" class="voice-status-text">{{ statusLabel() }}</p>
      <p v-if="status === 'idle' && !finalTranscript" class="voice-hint">
        点击麦克风开始语音提问
      </p>

      <!-- 实时临时文本 -->
      <div v-if="interimTranscript" class="interim-box">
        <span class="interim-label">识别中：</span>
        <span class="interim-text">{{ interimTranscript }}</span>
      </div>

      <!-- 最终识别结果 -->
      <div v-if="finalTranscript" class="final-box">
        <div class="final-header">
          <span class="final-label">你说：</span>
          <button class="btn-clear" @click="handleClear">清除</button>
        </div>
        <p class="final-text">{{ finalTranscript }}</p>
      </div>

      <!-- 文字输入：始终可用 -->
      <form class="text-fallback" @submit.prevent="handleTextSubmit">
        <input
          v-model="textInput"
          type="text"
          class="text-input"
          placeholder="输入问题，按回车发送…"
        />
      </form>
    </div>
  </div>
</template>

<style scoped>
.voice-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.25rem 1.5rem;
  width: 100%;
}

/* 核心改动：voice-active 内部全部水平居中、垂直排布 */
.voice-active {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 0.6rem;
}

/* ---- 麦克风按钮 ---- */
.mic-button {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  color: #cbd5e1;
  border: 2px solid #334155;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s, transform 0.15s, box-shadow 0.25s;
  flex-shrink: 0;
  margin: 0;
}

.mic-button:hover:not(:disabled) {
  background: #334155;
  border-color: #475569;
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.15);
}

.mic-button:active:not(:disabled) {
  transform: scale(0.95);
}

.mic-button:disabled {
  cursor: not-allowed;
}

/* 监听中 */
.mic-listening {
  background: #dc2626;
  border-color: #ef4444;
  color: #fff;
  box-shadow: 0 0 20px rgba(220, 38, 38, 0.3);
  animation: mic-pulse-bg 1.5s ease-in-out infinite;
}

@keyframes mic-pulse-bg {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
  50% { box-shadow: 0 0 0 18px rgba(220, 38, 38, 0); }
}

.mic-icon-active {
  color: #fff;
}

/* 波纹动画 */
.mic-pulse-ring {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid rgba(239, 68, 68, 0.4);
  animation: pulse-ring 1.2s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}

/* ---- 状态文字 ---- */
.voice-status-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
  text-align: center;
  margin: 0;
}

.voice-hint {
  font-size: 0.78rem;
  color: #475569;
  text-align: center;
  margin: 0;
}

/* ---- 临时识别文本 ---- */
.interim-box {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: #0c1019;
  border-radius: 8px;
  border: 1px dashed #334155;
  max-width: 420px;
  width: 100%;
}

.interim-label {
  font-size: 0.78rem;
  color: #f59e0b;
  white-space: nowrap;
  flex-shrink: 0;
}

.interim-text {
  font-size: 0.88rem;
  color: #94a3b8;
  font-style: italic;
}

/* ---- 最终识别结果 ---- */
.final-box {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  padding: 0.65rem 0.9rem;
  max-width: 420px;
  width: 100%;
}

.final-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.final-label {
  font-size: 0.78rem;
  color: #60a5fa;
  font-weight: 600;
}

.btn-clear {
  font-size: 0.75rem;
  color: #64748b;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}

.btn-clear:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.final-text {
  font-size: 0.92rem;
  color: #e2e8f0;
  line-height: 1.5;
  word-break: break-word;
}

/* ---- 轻量警告条 ---- */
.voice-warning-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 8px;
  margin-left: 0;
  color: #fbbf24;
  font-size: 0.8rem;
  max-width: 360px;
  width: 100%;
}

/* ---- 权限拒绝（仍为全屏遮挡） ---- */
.voice-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
  padding: 1rem;
  width: 100%;
}

.voice-error-icon {
  color: #f87171;
}

.voice-error-text {
  color: #fca5a5;
  font-size: 0.88rem;
  font-weight: 500;
  max-width: 360px;
  line-height: 1.5;
  text-align: center;
}

.voice-help-box {
  background: #0a0e1a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  text-align: left;
  margin-top: 0.25rem;
  width: 100%;
  max-width: 360px;
}

.voice-help-title {
  font-size: 0.82rem;
  color: #cbd5e1;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.voice-help-steps {
  font-size: 0.78rem;
  color: #94a3b8;
  padding-left: 1.2rem;
  line-height: 1.7;
}

.voice-help-steps strong {
  color: #e2e8f0;
}

/* ---- 文字输入兜底 ---- */
.text-fallback {
  width: 100%;
  max-width: 340px;
}

.text-input {
  width: 100%;
  padding: 0.55rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #0c1019;
  color: #e2e8f0;
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.text-input::placeholder {
  color: #475569;
}

.text-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.text-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>