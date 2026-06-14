<script setup lang="ts">
import { ref } from 'vue'
import CameraStage from '../components/CameraStage.vue'
import { useImageCapture } from '../composables/useImageCapture'
import { Camera, Image, Trash2 } from 'lucide-vue-next'

const cameraStageRef = ref<InstanceType<typeof CameraStage> | null>(null)
const { snapshot, captureError, captureFrame, clearSnapshot } = useImageCapture()

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
          <!-- 有快照时显示 -->
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

          <!-- 无快照时显示占位 -->
          <div v-else class="snapshot-placeholder">
            <Camera :size="36" class="placeholder-icon" />
            <p class="placeholder-text">
              点击「捕获关键帧」按钮<br />获取当前摄像头画面
            </p>
          </div>

          <!-- 截图错误提示 -->
          <p v-if="captureError" class="capture-error">{{ captureError }}</p>
        </div>
      </aside>
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
      <span class="control-hint">
        {{ isCameraReady() ? '点击按钮抓取当前画面' : '请先开启摄像头' }}
      </span>
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
  gap: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* ---- 主区域 ---- */
.main-area {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  flex: 1;
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

/* ---- 快照显示 ---- */
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

/* ---- 快照占位 ---- */
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

/* ---- 截图错误 ---- */
.capture-error {
  color: #f87171;
  font-size: 0.82rem;
  text-align: center;
  margin-top: 0.5rem;
}

/* ---- 底部控制栏 ---- */
.control-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
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
}
</style>
