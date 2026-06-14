<script setup lang="ts">
import { ref, watch } from 'vue'
import CameraStage from '../components/CameraStage.vue'
import VoiceControl from '../components/VoiceControl.vue'
import { useImageCapture } from '../composables/useImageCapture'
import { useSpeechSynthesis } from '../composables/useSpeechSynthesis'
import { Camera, Image, Trash2, Volume2, Square } from 'lucide-vue-next'

const cameraStageRef = ref<InstanceType<typeof CameraStage> | null>(null)
const voiceControlRef = ref<InstanceType<typeof VoiceControl> | null>(null)

const { snapshot, captureError, captureFrame, clearSnapshot } = useImageCapture()
const { isSpeaking, voiceError, speak, stop } = useSpeechSynthesis()

// 用于测试播报的最近一次识别文本
const lastTranscript = ref('')

function handleCapture(): void {
  const videoEl = cameraStageRef.value?.videoRef ?? null
  captureFrame(videoEl)
}

function handleClearSnapshot(): void {
  clearSnapshot()
}

function isCameraReady(): boolean {
  return cameraStageRef.value?.status === 'ready'
}

function handleCameraClose(): void {
  clearSnapshot()
}

// 收到最终识别文本
function handleFinalTranscript(text: string): void {
  lastTranscript.value = text
}

// 测试播报：使用固定测试文本验证 TTS
function handleTestSpeak(): void {
  const text = lastTranscript.value.trim()
  if (!text) return
  // 拼接一段测试回复来验证语音合成
  speak(`收到你的问题：${text}。这是中文语音播报测试。`)
}

// 停止播报
function handleStopSpeak(): void {
  stop()
}

// 用户开始说话时停止旧播报
watch(
  () => voiceControlRef.value?.status,
  (newStatus) => {
    if (newStatus === 'listening') {
      stop()
    }
  }
)
</script>

<template>
  <div class="home-view">
    <!-- 主区域：摄像头 + 快照面板 -->
    <section class="main-area">
      <!-- 左侧：摄像头工作区 -->
      <div class="camera-panel">
        <CameraStage
          ref="cameraStageRef"
          @close="handleCameraClose"
        />
      </div>

      <!-- 右侧：快照预览面板 -->
      <aside class="snapshot-panel">
        <div class="panel-header">
          <Image :size="18" />
          <h2 class="panel-title">关键帧快照</h2>
        </div>

        <div class="panel-body">
          <div v-if="snapshot" class="snapshot-display">
            <img
              :src="snapshot"
              alt="关键帧快照"
              class="snapshot-image"
            />
            <button
              class="btn btn-sm btn-outline"
              @click="handleClearSnapshot"
            >
              <Trash2 :size="14" />
              <span>清除</span>
            </button>
          </div>

          <div v-else class="snapshot-placeholder">
            <Camera :size="36" class="placeholder-icon" />
            <p class="placeholder-text">
              点击「捕获关键帧」按钮<br />获取当前摄像头画面
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

      <!-- 测试播报按钮（仅在有识别文本时可用） -->
      <button
        v-if="lastTranscript"
        class="btn btn-speak"
        :disabled="isSpeaking"
        @click="handleTestSpeak"
      >
        <Volume2 :size="20" />
        <span>测试播报</span>
      </button>

      <!-- 停止播报 -->
      <button
        v-if="isSpeaking"
        class="btn btn-stop"
        @click="handleStopSpeak"
      >
        <Square :size="18" />
        <span>停止播报</span>
      </button>

      <span class="control-hint">
        <template v-if="isSpeaking">正在播报…</template>
        <template v-else-if="isCameraReady()">点击按钮抓取当前画面</template>
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
  gap: 1.25rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* ---- 主区域 ---- */
.main-area {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  min-height: 0;
}

/* ---- 摄像头面板 ---- */
.camera-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ---- 快照面板 ---- */
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

/* ---- 语音区域 ---- */
.voice-section {
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid #334155;
}

/* ---- 底部控制栏 ---- */
.control-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  flex-wrap: wrap;
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

.btn-speak {
  background: #059669;
  color: #fff;
}

.btn-speak:hover:not(:disabled) {
  background: #047857;
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
</style>
