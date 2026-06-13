<script setup lang="ts">
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>SceneTalk</h1>
      <p class="tagline">AI 视觉对话助手</p>
    </header>
    <main class="app-main">
      <p class="status">系统就绪，等待开发...</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #0f172a;
  color: #e2e8f0;
}

.app-header {
  padding: 2rem 1rem 1rem;
  text-align: center;
}

.app-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  color: #818cf8;
  margin: 0;
}

.tagline {
  font-size: 0.95rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}

.app-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status {
  font-size: 1.1rem;
  color: #64748b;
}
</style>
