<script setup lang="ts">
import HomeView from './views/HomeView.vue'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <div class="header-brand">
          <span class="brand-dot"></span>
          <h1>AI 视觉对话助手</h1>
        </div>
        <p class="tagline">SceneTalk — 看你所看，答你所问</p>
      </div>
    </header>
    <HomeView />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0e1a;
  color: #e2e8f0;
}

.app-header {
  padding: 1rem 2rem;
  flex-shrink: 0;
  border-bottom: 1px solid #1e293b;
  background: #0f172a;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #818cf8, #6366f1);
  box-shadow: 0 0 10px rgba(129, 140, 248, 0.5);
  flex-shrink: 0;
}

.app-header h1 {
  font-size: 1.35rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: 0.02em;
}

.tagline {
  font-size: 0.78rem;
  color: #64748b;
  margin: 0.2rem 0 0 1.2rem;
}
</style>
