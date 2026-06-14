import { ref, computed } from 'vue'

export function useSpeechSynthesis() {
  const isSpeaking = ref(false)
  const voiceError = ref('')

  const isSupported = computed(() => {
    return typeof window !== 'undefined' && !!window.speechSynthesis
  })

  /**
   * 从可用声音列表中选取最匹配的中文声音。
   * 优先级：zh-CN > zh > 任意包含 CMN/Mandarin/Chinese 的声音
   */
  function pickZhVoice(): SpeechSynthesisVoice | null {
    if (!isSupported.value) return null

    const voices = window.speechSynthesis.getVoices()

    // 1. 精确匹配 zh-CN
    let match = voices.find((v) => v.lang === 'zh-CN')
    if (match) return match

    // 2. 前缀匹配 zh
    match = voices.find((v) => v.lang.startsWith('zh'))
    if (match) return match

    // 3. 名称包含中文相关关键词
    match = voices.find(
      (v) =>
        v.name.includes('Chinese') ||
        v.name.includes('Mandarin') ||
        v.name.includes('CMN') ||
        v.name.includes('中文')
    )
    if (match) return match

    return null
  }

  /**
   * 使用浏览器 TTS 播报中文文本。
   * 每次调用先 cancel 已有播报。
   */
  function speak(text: string): void {
    voiceError.value = ''

    if (!isSupported.value) {
      voiceError.value = '浏览器不支持语音合成。'
      return
    }

    if (!text || text.trim().length === 0) {
      voiceError.value = '播报文本为空。'
      return
    }

    // 先停止当前播报
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // 尝试匹配中文声音
    const voice = pickZhVoice()
    if (voice) {
      utterance.voice = voice
    }

    utterance.onstart = () => {
      isSpeaking.value = true
    }

    utterance.onend = () => {
      isSpeaking.value = false
    }

    utterance.onerror = (event) => {
      isSpeaking.value = false
      // SpeechSynthesisErrorEvent 类型不一定可用
      const err = event as SpeechSynthesisErrorEvent & { error?: string }
      voiceError.value = `语音播报失败：${err.error || '未知错误'}`
    }

    window.speechSynthesis.speak(utterance)
  }

  /**
   * 停止当前播报并清空队列。
   */
  function stop(): void {
    if (!isSupported.value) return
    window.speechSynthesis.cancel()
    isSpeaking.value = false
    voiceError.value = ''
  }

  return {
    isSpeaking,
    voiceError,
    isSupported,
    speak,
    stop,
  }
}
