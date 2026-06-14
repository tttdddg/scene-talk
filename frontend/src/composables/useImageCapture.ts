import { ref } from 'vue'

export function useImageCapture() {
  const snapshot = ref<string | null>(null)
  const captureError = ref('')

  /**
   * 从 video 元素捕获当前帧，返回 JPEG data URL。
   * 摄像头未就绪时拒绝捕获。
   */
  function captureFrame(videoEl: HTMLVideoElement | null): boolean {
    captureError.value = ''

    if (!videoEl) {
      captureError.value = '视频元素未就绪，请先开启摄像头。'
      return false
    }

    if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      captureError.value = '摄像头画面尚未就绪，请稍候再试。'
      return false
    }

    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      captureError.value = '无法读取摄像头画面尺寸，请检查摄像头连接。'
      return false
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth
      canvas.height = videoEl.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        captureError.value = '浏览器不支持 Canvas 2D 上下文，无法截图。'
        return false
      }

      // 如果摄像头是前置，画面是镜像的；截图时水平翻转以还原真实画面
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

      // JPEG 压缩输出，限制质量 85%
      snapshot.value = canvas.toDataURL('image/jpeg', 0.85)
      return true
    } catch (e: unknown) {
      const err = e as Error
      captureError.value = `截图失败：${err.message || '未知错误'}`
      return false
    }
  }

  function clearSnapshot(): void {
    snapshot.value = null
    captureError.value = ''
  }

  return {
    snapshot,
    captureError,
    captureFrame,
    clearSnapshot,
  }
}
