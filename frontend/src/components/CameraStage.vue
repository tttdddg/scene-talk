<script setup lang="ts">
import { ref, watch } from 'vue'
import { useCamera } from '../composables/useCamera'
import { Camera, CameraOff, X } from 'lucide-vue-next'

const emit = defineEmits<{
  close: []
}>()

const { status, stream, errorMessage, requestCamera, closeCamera } = useCamera()

const videoRef = ref<HTMLVideoElement | null>(null)

// 当 stream 就绪后绑定到 video 元素
// flush: 'post' 确保 DOM 已更新（video 元素已挂载）再绑定
watch(stream, (newStream) => {
  if (newStream && videoRef.value) {
    videoRef.value.srcObject = newStream
  } else if (newStream && !videoRef.value) {
    // DOM 尚未就绪的极端情况，在下一帧重试
    requestAnimationFrame(() => {
      if (videoRef.value && newStream) {
        videoRef.value.srcObject = newStream
      }
    })
  }
}, { flush: 'post' })

function handleStartCamera(): void {
  requestCamera()
}

function handleClose(): void {
  closeCamera()
  emit('close')
}

// 暴露 videoRef 和 status 给父组件用于截图和状态判断
defineExpose({ videoRef, status })
</script>

<template>
  <div class="camera-stage">
    <!-- 状态：idle（初始） -->
    <div v-if="status === 'idle'" class="stage-placeholder">
      <Camera :size="48" class="placeholder-icon" />
      <p class="placeholder-text">点击下方按钮开启摄像头</p>
      <button class="btn btn-primary" @click="handleStartCamera">
        <Camera :size="18" />
        <span>开启摄像头</span>
      </button>
    </div>

    <!-- 状态：requesting（请求中） -->
    <div v-else-if="status === 'requesting'" class="stage-placeholder">
      <div class="spinner" />
      <p class="placeholder-text">正在请求摄像头权限…</p>
    </div>

    <!-- 状态：ready（摄像头就绪） -->
    <div v-else-if="status === 'ready'" class="stage-ready">
      <video
        ref="videoRef"
        class="camera-video"
        autoplay
        playsinline
        muted
      />
      <div class="stage-controls">
        <button
          class="btn btn-icon btn-close"
          title="关闭摄像头"
          @click="handleClose"
        >
          <CameraOff :size="20" />
        </button>
      </div>
    </div>

    <!-- 状态：denied（权限拒绝） -->
    <div v-else-if="status === 'denied'" class="stage-placeholder stage-error">
      <CameraOff :size="48" class="placeholder-icon error-icon" />
      <p class="placeholder-text error-text">{{ errorMessage }}</p>
      <div class="help-box">
        <p class="help-title">如何开启权限：</p>
        <ol class="help-steps">
          <li>点击地址栏左侧的 <strong>锁定/设置图标</strong></li>
          <li>找到 <strong>摄像头</strong> 权限选项</li>
          <li>将权限改为 <strong>允许</strong></li>
          <li>刷新页面后重新点击「开启摄像头」</li>
        </ol>
      </div>
      <button class="btn btn-secondary" @click="handleStartCamera">
        重试
      </button>
    </div>

    <!-- 状态：unavailable（设备不存在） -->
    <div v-else-if="status === 'unavailable'" class="stage-placeholder stage-error">
      <CameraOff :size="48" class="placeholder-icon error-icon" />
      <p class="placeholder-text error-text">{{ errorMessage }}</p>
      <div class="help-box">
        <p class="help-title">请检查：</p>
        <ul class="help-steps">
          <li>摄像头是否正确连接到电脑</li>
          <li>设备管理器中摄像头驱动是否正常</li>
          <li>外接摄像头请尝试重新插拔 USB 线</li>
        </ul>
      </div>
      <button class="btn btn-secondary" @click="handleStartCamera">
        重试
      </button>
    </div>

    <!-- 状态：error（其他错误） -->
    <div v-else-if="status === 'error'" class="stage-placeholder stage-error">
      <X :size="48" class="placeholder-icon error-icon" />
      <p class="placeholder-text error-text">{{ errorMessage }}</p>
      <button class="btn btn-secondary" @click="handleStartCamera">
        重试
      </button>
    </div>

  </div>
</template>

<style scoped>
.camera-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  max-height: 480px;
  background: #0f1420;
  border-radius: 12px;
  border: 1px solid #1e293b;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- 占位 / 状态提示 ---- */
.stage-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.placeholder-icon {
  color: #334155;
}

.placeholder-text {
  color: #64748b;
  font-size: 0.9rem;
  max-width: 280px;
  line-height: 1.5;
}

/* ---- 就绪：视频画面 ---- */
.stage-ready {
  width: 100%;
  height: 100%;
  position: relative;
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.stage-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
  z-index: 10;
}

/* ---- 错误状态 ---- */
.stage-error {
  gap: 0.6rem;
}

.error-icon {
  color: #f87171;
}

.error-text {
  color: #fca5a5;
  font-weight: 500;
  font-size: 0.88rem;
}

/* ---- 帮助提示 ---- */
.help-box {
  background: #0a0e1a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  text-align: left;
  width: 100%;
  max-width: 340px;
}

.help-title {
  font-size: 0.82rem;
  color: #cbd5e1;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.help-steps {
  font-size: 0.78rem;
  color: #94a3b8;
  padding-left: 1.2rem;
  line-height: 1.7;
}

.help-steps strong {
  color: #e2e8f0;
}

/* ---- 按钮 ---- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 1.2rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
}

.btn:active {
  transform: scale(0.97);
}

.btn-primary {
  background: linear-gradient(135deg, #818cf8, #6366f1);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.btn-secondary {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
}

.btn-secondary:hover {
  background: #334155;
  color: #e2e8f0;
}

.btn-icon {
  padding: 0.45rem;
  border-radius: 8px;
  background: rgba(10, 14, 26, 0.75);
  color: #e2e8f0;
  backdrop-filter: blur(6px);
  border: 1px solid rgba(51, 65, 85, 0.5);
}

.btn-icon:hover {
  background: rgba(10, 14, 26, 0.9);
  border-color: rgba(100, 116, 139, 0.6);
}

.btn-close {
  color: #f87171;
}

/* ---- Spinner ---- */
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #1e293b;
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
