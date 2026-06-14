<script setup lang="ts">
import { watch } from 'vue'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { Mic, MicOff, AlertTriangle, VolumeX } from 'lucide-vue-next'

const emit = defineEmits<{
  'final-transcript': [text: string]
}>()

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
watch(status, (newStatus, oldStatus) => {
  if (
    newStatus === 'idle' &&
    (oldStatus === 'processing' || oldStatus === 'listening') &&
    finalTranscript.value.trim().length > 0
  ) {
    emit('final-transcript', finalTranscript.value.trim())
  }
})

function handleMicClick(): void {
  if (status.value === 'listening' || status.value === 'processing') {
    stopListening()
  } else {
    startListening()
  }
}

function handleClear(): void {
  resetTranscript()
}

// 判断按钮是否可交互
function isActionDisabled(): boolean {
  return (
    status.value === 'unsupported' ||
    status.value === 'denied' ||
    status.value === 'processing'
  )
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
    <!-- 不支持语音识别 -->
    <div v-if="status === 'unsupported'" class="voice-unsupported">
      <VolumeX :size="36" class="voice-error-icon" />
      <p class="voice-error-text">{{ errorMessage }}</p>
    </div>

    <!-- 权限拒绝 -->
    <div v-else-if="status === 'denied'" class="voice-denied">
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

    <!-- 其他错误 -->
    <div v-else-if="status === 'error'" class="voice-error">
      <AlertTriangle :size="36" class="voice-error-icon" />
      <p class="voice-error-text">{{ errorMessage }}</p>
    </div>

    <!-- 正常状态：麦克风按钮 + 文字 -->
    <div v-else class="voice-active">
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
        <!-- 动画波纹（仅 listening 时显示） -->
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

      <!-- 状态文案 -->
      <p v-if="statusLabel()" class="voice-status-text">
        {{ statusLabel() }}
      </p>

      <!-- 按钮提示 -->
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
    </div>
  </div>
</template>

<style scoped>
.voice-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
}

/* ---- 麦克风按钮 ---- */
.mic-button {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  color: #e2e8f0;
  border: 3px solid #475569;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s, transform 0.15s;
  flex-shrink: 0;
}

.mic-button:hover:not(:disabled) {
  background: #475569;
  border-color: #64748b;
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
  animation: mic-pulse-bg 1.5s ease-in-out infinite;
}

@keyframes mic-pulse-bg {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
  50% { box-shadow: 0 0 0 16px rgba(220, 38, 38, 0); }
}

.mic-icon-active {
  color: #fff;
}

/* 波纹动画 */
.mic-pulse-ring {
  position: absolute;
  inset: -8px;
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

/* 处理中 */
.mic-processing {
  background: #d97706;
  border-color: #f59e0b;
}

/* ---- 状态文字 ---- */
.voice-status-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.voice-hint {
  font-size: 0.82rem;
  color: #64748b;
}

/* ---- 临时识别文本 ---- */
.interim-box {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  background: #1e293b;
  border-radius: 8px;
  border: 1px dashed #475569;
  max-width: 420px;
  width: 100%;
}

.interim-label {
  font-size: 0.8rem;
  color: #f59e0b;
  white-space: nowrap;
  flex-shrink: 0;
}

.interim-text {
  font-size: 0.9rem;
  color: #94a3b8;
  font-style: italic;
}

/* ---- 最终识别结果 ---- */
.final-box {
  background: #1e3a5f;
  border: 1px solid #2563eb;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  max-width: 420px;
  width: 100%;
}

.final-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.3rem;
}

.final-label {
  font-size: 0.8rem;
  color: #60a5fa;
  font-weight: 600;
}

.btn-clear {
  font-size: 0.78rem;
  color: #94a3b8;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}

.btn-clear:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.final-text {
  font-size: 0.95rem;
  color: #e2e8f0;
  line-height: 1.5;
  word-break: break-word;
}

/* ---- 不支持 / 拒绝 / 错误 ---- */
.voice-unsupported,
.voice-denied,
.voice-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
  padding: 1rem;
}

.voice-error-icon {
  color: #f87171;
}

.voice-error-text {
  color: #fca5a5;
  font-size: 0.9rem;
  font-weight: 500;
  max-width: 360px;
  line-height: 1.5;
}

.voice-help-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  text-align: left;
  margin-top: 0.25rem;
}

.voice-help-title {
  font-size: 0.85rem;
  color: #cbd5e1;
  font-weight: 600;
  margin-bottom: 0.4rem;
}

.voice-help-steps {
  font-size: 0.82rem;
  color: #94a3b8;
  padding-left: 1.2rem;
  line-height: 1.7;
}

.voice-help-steps strong {
  color: #e2e8f0;
}
</style>
