<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { NButton, NModal, useMessage } from "naive-ui";
import { useAppStore } from "@/stores/hermes/app";
import { useProfilesStore } from '@/stores/hermes/profiles'
import LanguageSwitch from "./LanguageSwitch.vue";
import ThemeSwitch from "./ThemeSwitch.vue";
import { useSessionSearch } from '@/composables/useSessionSearch'
import { changelog } from "@/data/changelog";
import logoImage from "@/assets/logo.png";

const { t } = useI18n();
const message = useMessage();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const profilesStore = useProfilesStore()
const { openSessionSearch } = useSessionSearch();
const selectedKey = computed(() => route.name as string);
const activeProfileName = computed(() => profilesStore.activeProfile?.name || '')
const isEmployeeWorkbenchProfile = computed(() => activeProfileName.value.startsWith('yoolee-employee-'))

const yooleeNavGroups: Array<Array<{ key: string; label: string; icon: string; suffix?: string }>> = [
  [
    { key: 'hermes.chat', label: '对话', icon: 'chat' },
    { key: 'hermes.groupChat', label: '群聊', icon: 'group', suffix: 'beta' },
    { key: 'hermes.jobs', label: '任务', icon: 'task', suffix: 'beta' },
  ],
  [
    { key: 'yoolee.employees', label: '员工', icon: 'person' },
    { key: 'yoolee.customers', label: '模拟客户', icon: 'group' },
  ],
  [
    { key: 'yoolee.evaluations', label: '测评', icon: 'spark' },
    { key: 'yoolee.learning', label: '学习', icon: 'memory' },
  ],
]

function isNavActive(key: string) {
  if (key === 'yoolee.employees') return selectedKey.value === key || selectedKey.value === 'yoolee.employeeDetail'
  if (key === 'yoolee.customers') return selectedKey.value === key || selectedKey.value === 'yoolee.customerDetail'
  if (key === 'yoolee.evaluations') return selectedKey.value === key || selectedKey.value === 'yoolee.evaluationDetail'
  if (key === 'yoolee.learning') return selectedKey.value === key
  return selectedKey.value === key
}

const collapsedGroups = reactive<Record<string, boolean>>({});

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key];
}

function isGroupCollapsed(key: string) {
  return !!collapsedGroups[key];
}

function handleNav(key: string) {
  router.push({ name: key });
}

function openWorkbenchSettings() {
  router.push({ name: 'yoolee.settings' });
}

async function handleUpdate() {
  const ok = await appStore.doUpdate();
  if (ok) {
    message.success(t('sidebar.updateSuccess'), { duration: 5000 });
  } else {
    message.error(t('sidebar.updateFailed'));
  }
}

function handleLogout() {
  localStorage.clear();
  router.replace({ name: 'login' });
}

// Changelog
const showChangelog = ref(false);

function openChangelog() {
  showChangelog.value = true;
}
</script>

<template>
  <aside class="sidebar" :class="{ open: appStore.sidebarOpen }">
    <div class="sidebar-logo" @click="router.push('/yoolee')">
      <img class="logo-mark" :src="logoImage" alt="Yoolee" />
      <!-- <video class="logo-dance" :src="isDark ? danceVideoDark : danceVideoLight" autoplay loop muted playsinline /> -->
    </div>

    <nav class="sidebar-nav">
      <div v-for="(group, index) in yooleeNavGroups" :key="index" class="nav-group primary-nav-group">
        <button
          v-for="item in group"
          :key="item.key"
          class="nav-item"
          :class="{ active: isNavActive(item.key) }"
          @click="handleNav(item.key)"
        >
          <span class="nav-icon" :class="`icon-${item.icon}`"></span>
          <span>{{ item.label }}<span v-if="item.suffix" class="beta-tag">({{ item.suffix }})</span></span>
        </button>
      </div>

      <div v-if="false">
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('yoolee')">
          <span>Yoolee 平台</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('yoolee') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('yoolee')">
          <button class="nav-item" :class="{ active: selectedKey === 'yoolee.dashboard' }" @click="handleNav('yoolee.dashboard')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>配置&测试平台</span>
          </button>
        </div>
      </div>

      <!-- Conversation -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('conversation')">
          <span>{{ t("sidebar.groupConversation") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('conversation') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('conversation')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.chat' }" @click="handleNav('hermes.chat')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{{ t("sidebar.chat") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.groupChat' }" @click="handleNav('hermes.groupChat')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{{ t("sidebar.groupChat") }}<span class="beta-tag">(beta)</span></span>
          </button>
          <button class="nav-item" @click="openSessionSearch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>{{ t("sidebar.search") }}</span>
          </button>
        </div>
      </div>

      <!-- Agent -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('agent')">
          <span>{{ t("sidebar.groupAgent") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('agent') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('agent')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.jobs' }" @click="handleNav('hermes.jobs')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{{ t("sidebar.jobs") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.channels' }" @click="handleNav('hermes.channels')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span>{{ t("sidebar.channels") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.skills' }" @click="handleNav('hermes.skills')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>{{ t("sidebar.skills") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.memory' }" @click="handleNav('hermes.memory')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            <span>{{ t("sidebar.memory") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.models' }" @click="handleNav('hermes.models')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4" />
              <path d="M12 19v4" />
              <path d="M1 12h4" />
              <path d="M19 12h4" />
              <path d="M4.22 4.22l2.83 2.83" />
              <path d="M16.95 16.95l2.83 2.83" />
              <path d="M4.22 19.78l2.83-2.83" />
              <path d="M16.95 7.05l2.83-2.83" />
            </svg>
            <span>{{ t("sidebar.models") }}</span>
          </button>
        </div>
      </div>

      <!-- Monitoring -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('monitoring')">
          <span>{{ t("sidebar.groupMonitoring") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('monitoring') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('monitoring')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.logs' }" @click="handleNav('hermes.logs')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>{{ t("sidebar.logs") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.usage' }" @click="handleNav('hermes.usage')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
            <span>{{ t("sidebar.usage") }}</span>
          </button>
        </div>
      </div>

      <!-- Tools -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('tools')">
          <span>{{ t("sidebar.groupTools") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('tools') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('tools')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.terminal' }" @click="handleNav('hermes.terminal')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>{{ t("sidebar.terminal") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.files' }" @click="handleNav('hermes.files')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>{{ t("sidebar.files") }}</span>
          </button>
        </div>
      </div>

      <!-- System -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('system')">
          <span>{{ t("sidebar.groupSystem") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('system') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('system')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.gateways' }" @click="handleNav('hermes.gateways')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span>{{ t("sidebar.gateways") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.profiles' }" @click="handleNav('hermes.profiles')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{{ t("sidebar.profiles") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.settings' }" @click="handleNav('hermes.settings')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>{{ t("sidebar.settings") }}</span>
          </button>
        </div>
      </div>
      </div>
    </nav>

    <div class="workbench-config">
      <button class="nav-item config-entry" :class="{ active: selectedKey === 'yoolee.settings' }" @click="openWorkbenchSettings">
        <span class="nav-icon icon-settings"></span>
        <span>工作台配置</span>
      </button>
      <div v-if="isEmployeeWorkbenchProfile" class="profile-warning">
        当前正在使用员工 Profile，可能影响人工对话和调试上下文
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="nav-item logout-item" @click="handleLogout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{{ t("sidebar.logout") }}</span>
      </button>
      <div class="status-row">
        <div
          class="status-indicator"
          :class="{
            connected: appStore.connected,
            disconnected: !appStore.connected,
          }"
        >
          <span class="status-dot"></span>
          <span class="status-text">{{
            appStore.connected
              ? t("sidebar.connected")
              : t("sidebar.disconnected")
          }}</span>
        </div>
        <LanguageSwitch />
      </div>
      <div class="version-info">
        <div class="version-text" @click="openChangelog">
          <span>Yoolee 开发版 v0.5</span>
          <span>Hermes 底座 v{{ appStore.serverVersion || "0.1.0" }}</span>
        </div>
        <ThemeSwitch />
      </div>
      <NButton v-if="appStore.updateAvailable" type="primary" size="tiny" block class="update-btn" :loading="appStore.updating" @click="handleUpdate">
        {{ appStore.updating ? t('sidebar.updating') : t('sidebar.updateVersion', { version: appStore.latestVersion }) }}
      </NButton>
    </div>

    <!-- Changelog modal -->
    <NModal v-model:show="showChangelog" preset="dialog" :title="t('sidebar.changelog')" style="width: 520px;">
      <div class="changelog-list">
        <div v-for="entry in changelog" :key="entry.version" class="changelog-version-block">
          <div class="changelog-version-header">
            <span class="changelog-version-tag">v{{ entry.version }}</span>
            <span class="changelog-date">{{ entry.date }}</span>
          </div>
          <ul class="changelog-changes">
            <li v-for="(change, idx) in entry.changes" :key="idx">{{ t(change) }}</li>
          </ul>
        </div>
      </div>
    </NModal>
  </aside>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.sidebar {
  width: $sidebar-width;
  height: calc(100 * var(--vh));
  background-color: $bg-sidebar;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  padding: 0 12px 20px;
  flex-shrink: 0;
  transition: width $transition-normal;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  padding: 20px 12px;
  margin: 0 -12px;
  color: $text-primary;
  cursor: pointer;
  background-color: $bg-card;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  .dark & {
    background-color: #393939;
  }
  position: relative;
  overflow: hidden;

  .logo-mark {
    display: block;
    width: 128px;
    height: auto;
    object-fit: contain;

    .dark & {
      filter: invert(1);
    }
  }

  .logo-dance {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    height: 100px;
    border-radius: $radius-md;
    object-fit: contain;
    flex-shrink: 0;
    width: auto;
    pointer-events: none;
  }
}

.sidebar-nav {
  flex: 1;
  display: flex;
  padding-top: 12px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.primary-nav-group + &.primary-nav-group {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid $border-color;
  }

  &.nav-group-bottom {
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid $border-color;
  }
}

.nav-group-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  border-radius: $radius-sm;
  transition: color $transition-fast;

  &:hover {
    color: $text-secondary;
  }

  .nav-group:first-child & {
    padding-top: 0;
  }
}

.nav-group-arrow {
  transition: transform $transition-fast;
  flex-shrink: 0;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: none;
  background: none;
  color: $text-secondary;
  font-size: 14px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  width: 100%;
  text-align: left;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  &.active {
    background-color: rgba(var(--accent-primary-rgb), 0.12);
    color: $accent-primary;
  }

  .beta-tag {
    font-size: 10px;
    color: $text-muted;
    margin-left: 2px;
  }
}

.nav-icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  position: relative;
  flex: 0 0 16px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }

  &.icon-chat::before {
    border-radius: 4px;
  }

  &.icon-chat::after {
    inset: auto 3px 1px auto;
    width: 5px;
    height: 5px;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }

  &.icon-group::before {
    inset: 3px 7px 7px 2px;
    border-radius: 50%;
  }

  &.icon-group::after {
    inset: 7px 2px 3px 7px;
    border-radius: 50%;
  }

  &.icon-person::before {
    inset: 2px 5px 8px;
    border-radius: 50%;
  }

  &.icon-person::after {
    inset: 9px 3px 2px;
    border-radius: 8px 8px 2px 2px;
  }

  &.icon-spark::before {
    inset: 2px 7px;
    border-width: 0 1.5px;
    border-radius: 0;
    transform: rotate(45deg);
  }

  &.icon-spark::after {
    inset: 7px 2px;
    border-width: 1.5px 0;
    border-radius: 0;
    transform: rotate(45deg);
  }

  &.icon-memory::before {
    inset: 2px 5px 7px;
    border-radius: 8px 8px 2px 2px;
  }

  &.icon-memory::after {
    inset: auto 6px 2px;
    height: 4px;
    border-width: 1.5px 0 0;
    border-radius: 0;
  }

  &.icon-task::before {
    inset: 2px 3px 2px 3px;
    border-radius: 3px;
  }

  &.icon-task::after {
    inset: 5px 6px auto 6px;
    height: 6px;
    border-width: 0 0 1.5px 0;
    border-radius: 0;
    box-shadow: 0 5px 0 currentColor;
  }

  &.icon-chart::before {
    inset: 3px 10px 2px 2px;
  }

  &.icon-chart::after {
    inset: 7px 2px 2px 8px;
  }

  &.icon-search::before {
    inset: 2px 5px 5px 2px;
    border-radius: 50%;
  }

  &.icon-search::after {
    inset: auto 2px 2px auto;
    width: 6px;
    height: 1.5px;
    border: none;
    border-radius: 0;
    background: currentColor;
    transform: rotate(45deg);
  }
}

.workbench-config {
  padding-top: 8px;
  border-top: 1px solid $border-color;

  .config-entry {
    margin: 0 -12px;
    padding: 10px 12px;
  }
}

.workbench-title {
  padding: 0 12px 8px;
  color: $text-muted;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.profile-warning {
  margin: 0 12px 8px;
  padding: 8px;
  border: 1px solid rgba(var(--warning-rgb), 0.32);
  border-radius: $radius-sm;
  background: rgba(var(--warning-rgb), 0.08);
  color: $warning;
  font-size: 11px;
  line-height: 1.5;
}

.sidebar-footer {
  padding-top: 8px;
  border-top: 1px solid $border-color;
}

.logout-item {
  margin: 0 -12px;
  padding: 10px 12px;
  border-radius: 0;
  font-size: 13px;
  color: $text-muted;

  &:hover {
    color: $error;
    background: rgba(var(--error-rgb, 239, 68, 68), 0.06);
  }
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &.connected .status-dot {
    background-color: $success;
    box-shadow: 0 0 6px rgba(var(--success-rgb), 0.5);
  }

  &.disconnected .status-dot {
    background-color: $error;
  }

  .status-text {
    color: $text-secondary;
  }
}

.version-info {
  padding: 2px 12px 8px;
  font-size: 11px;
  color: $text-muted;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.update-btn {
  margin: 4px 0 0;
  border-radius: 4px;
}

.version-text {
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;

  &:hover {
    color: $accent-primary;
  }
}

.changelog-list {
  max-height: 400px;
  overflow-y: auto;
}

.changelog-version-block {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.changelog-version-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.changelog-version-tag {
  font-weight: 600;
  font-size: 14px;
  color: $text-primary;
  font-family: $font-code;
}

.changelog-changes {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    font-size: 13px;
    color: $text-secondary;
    padding: 4px 0 4px 16px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 12px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $text-muted;
    }
  }
}

@media (max-width: $breakpoint-mobile) {
  .logo-dance {
    display: none;
  }

  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform $transition-normal;

    &.open {
      transform: translateX(0);
    }

    // Override global utility — sidebar is always 240px wide
    .input-sm {
      width: 90px;
    }
  }
}
</style>
