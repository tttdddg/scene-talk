<script setup lang="ts">
import HomeView from './views/HomeView.vue'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>SceneTalk</h1>
      <p class="tagline">AI 视觉对话助手</p>
    </header>
    <HomeView />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
}

.app-header {
  padding: 1.25rem 1.5rem 0.5rem;
  text-align: center;
  flex-shrink: 0;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #818cf8;
  margin: 0;
}

.tagline {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0.15rem 0 0;
}
</style>
