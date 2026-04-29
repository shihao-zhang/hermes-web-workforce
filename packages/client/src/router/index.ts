import { createRouter, createWebHashHistory } from 'vue-router'
import { hasApiKey } from '@/api/client'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/yoolee',
      name: 'yoolee.workbench',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/employees',
      name: 'yoolee.employees',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/employees/:id',
      name: 'yoolee.employeeDetail',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/customers',
      name: 'yoolee.customers',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/customers/:id',
      name: 'yoolee.customerDetail',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/evaluations',
      name: 'yoolee.evaluations',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/evaluations/:id',
      name: 'yoolee.evaluationDetail',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/learning',
      name: 'yoolee.learning',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/yoolee/data',
      name: 'yoolee.data',
      redirect: { name: 'yoolee.workbench', query: { section: 'data' } },
    },
    {
      path: '/yoolee/settings',
      name: 'yoolee.settings',
      component: () => import('@/views/yoolee/YooleeDashboardView.vue'),
    },
    {
      path: '/hermes/chat',
      name: 'hermes.chat',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/hermes/jobs',
      name: 'hermes.jobs',
      component: () => import('@/views/hermes/JobsView.vue'),
    },
    {
      path: '/hermes/models',
      name: 'hermes.models',
      component: () => import('@/views/hermes/ModelsView.vue'),
    },
    {
      path: '/hermes/profiles',
      name: 'hermes.profiles',
      component: () => import('@/views/hermes/ProfilesView.vue'),
    },
    {
      path: '/hermes/logs',
      name: 'hermes.logs',
      component: () => import('@/views/hermes/LogsView.vue'),
    },
    {
      path: '/hermes/usage',
      name: 'hermes.usage',
      component: () => import('@/views/hermes/UsageView.vue'),
    },
    {
      path: '/hermes/skills',
      name: 'hermes.skills',
      component: () => import('@/views/hermes/SkillsView.vue'),
    },
    {
      path: '/hermes/memory',
      name: 'hermes.memory',
      component: () => import('@/views/hermes/MemoryView.vue'),
    },
    {
      path: '/hermes/settings',
      name: 'hermes.settings',
      component: () => import('@/views/hermes/SettingsView.vue'),
    },
    {
      path: '/hermes/gateways',
      name: 'hermes.gateways',
      component: () => import('@/views/hermes/GatewaysView.vue'),
    },
    {
      path: '/hermes/channels',
      name: 'hermes.channels',
      component: () => import('@/views/hermes/ChannelsView.vue'),
    },
    {
      path: '/hermes/terminal',
      name: 'hermes.terminal',
      component: () => import('@/views/hermes/TerminalView.vue'),
    },
    {
      path: '/hermes/group-chat',
      name: 'hermes.groupChat',
      component: () => import('@/views/hermes/GroupChatView.vue'),
    },
    {
      path: '/hermes/files',
      name: 'hermes.files',
      component: () => import('@/views/hermes/FilesView.vue'),
    },
  ],
})

router.beforeEach((to, _from, next) => {
  // Public pages don't need auth
  if (to.meta.public) {
    // Already has key, skip login
    if (to.name === 'login' && hasApiKey()) {
      next({ name: 'yoolee.workbench' })
      return
    }
    next()
    return
  }

  // All other pages require token
  if (!hasApiKey()) {
    next({ name: 'login' })
    return
  }

  next()
})

export default router
