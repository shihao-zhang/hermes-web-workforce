<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui'
import { fetchProfiles, type HermesProfile } from '@/api/hermes/profiles'
import { fetchSkills, type SkillCategory } from '@/api/hermes/skills'
import {
  fetchCustomers,
  fetchDashboardSummary,
  fetchDataSummary,
  fetchEvaluation,
  fetchEmployeeMemory,
  fetchEmployees,
  fetchEvaluations,
  fetchPromptSettings,
  createEmployeeProfile,
  commitLearningSuggestion,
  generateLearningSuggestion,
  removeCustomer,
  removeEmployee,
  removeEmployeeKnowledge,
  resetPromptSettings,
  rerunEvaluationAutoScore,
  runEvaluation,
  saveCustomer,
  saveEmployee,
  savePromptSettings,
  scoreEvaluation,
  saveTurnScore,
  revertLearningSuggestion,
  uploadEmployeeKnowledge,
  type EvaluationMessage,
  type EvaluationTraceEvent,
  type EmployeeMemoryData,
  type LearningSuggestion,
  type YooleeTurnScore,
  type YooleePromptSettings,
  type YooleeDashboardSummary,
  type YooleeDataSummary,
  type YooleeCustomer,
  type YooleeEmployee,
  type YooleeEvaluation,
} from '@/api/yoolee'

const message = useMessage()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const running = ref(false)
const employees = ref<YooleeEmployee[]>([])
const customers = ref<YooleeCustomer[]>([])
const evaluations = ref<YooleeEvaluation[]>([])
const profiles = ref<HermesProfile[]>([])
const skillCategories = ref<SkillCategory[]>([])
const selectedEvaluation = ref<YooleeEvaluation | null>(null)
const selectedTraceEvents = ref<EvaluationTraceEvent[]>([])
const selectedTurnScores = ref<YooleeTurnScore[]>([])
const learningSuggestion = ref<LearningSuggestion | null>(null)
const promptSettings = ref<YooleePromptSettings | null>(null)
const dashboardSummary = ref<YooleeDashboardSummary | null>(null)
const dataSummary = ref<YooleeDataSummary | null>(null)

const showEmployeeModal = ref(false)
const showCustomerModal = ref(false)
const showScoreModal = ref(false)
const showTurnScoreModal = ref(false)
const showPromptModal = ref(false)
const showEmployeeMemoryModal = ref(false)
const editingEmployeeId = ref('')
const editingCustomerId = ref('')
const scoringEvaluationId = ref('')
const scoringTurnEvaluationId = ref('')
const knowledgeInputRef = ref<HTMLInputElement | null>(null)
const uploadingKnowledge = ref(false)
const savingPromptSettings = ref(false)
const creatingProfile = ref(false)
const generatingLearning = ref(false)
const committingLearning = ref(false)
const runningAutoScore = ref(false)
const loadingEmployeeMemory = ref(false)
const employeeMemory = ref<EmployeeMemoryData | null>(null)

const employeeForm = reactive<Partial<YooleeEmployee>>({
  name: '',
  role: '',
  goal: '',
  system_prompt: '',
  provider: '',
  model: '',
  profile: 'default',
  profile_strategy: 'manual',
  profile_name: 'default',
  memory_mode: 'training_writable',
  profile_created_at: null,
  skills: [],
  knowledge_docs: [],
  status: 'active',
})

const customerForm = reactive<Partial<YooleeCustomer>>({
  name: '',
  industry: '',
  need: '',
  budget: '',
  concerns: '',
  stage: '',
  communication_style: '',
  opening_message: '',
  status: 'active',
})

const evaluationForm = reactive({
  employee_id: '',
  customer_id: '',
  max_rounds: 6,
  context: '',
  memory_mode: 'training_writable' as 'training_writable' | 'readonly',
  stop_keywords: '成交，不考虑，再联系，预算不够',
})

const filters = reactive({
  employee_id: '',
  customer_id: '',
  status: '',
})

const scoreForm = reactive({
  manual_score: null as number | null,
  manual_note: '',
  conclusion: '',
})

const turnScoreForm = reactive({
  round: 0,
  manual_score: null as number | null,
  manual_note: '',
})

const promptForm = reactive({
  employee_prompt_template: '',
  customer_prompt_template: '',
  learning_prompt_template: '',
  auto_score_prompt_template: '',
})

const promptVariables = [
  '{{employee_name}}',
  '{{employee_role}}',
  '{{employee_goal}}',
  '{{employee_skills}}',
  '{{employee_knowledge}}',
  '{{employee_system_prompt}}',
  '{{customer_name}}',
  '{{customer_profile}}',
  '{{round}}',
  '{{transcript}}',
  '{{manual_score}}',
  '{{manual_conclusion}}',
  '{{manual_note}}',
  '{{trace_events}}',
  '{{auto_score_review}}',
  '{{metadata}}',
  '{{dialog_history}}',
  '{{user_query}}',
  '{{actual_output}}',
]

const activeEmployees = computed(() => employees.value.filter(item => item.status === 'active'))
const activeCustomers = computed(() => customers.value.filter(item => item.status === 'active'))
const pageMode = computed(() => {
  const name = String(route.name || 'yoolee.workbench')
  if (name === 'yoolee.employeeDetail') return 'employee-detail'
  if (name === 'yoolee.customerDetail') return 'customer-detail'
  if (name === 'yoolee.evaluationDetail') return 'evaluation-detail'
  if (name === 'yoolee.employees') return 'employees'
  if (name === 'yoolee.customers') return 'customers'
  if (name === 'yoolee.evaluations') return 'evaluations'
  if (name === 'yoolee.learning') return 'learning'
  if (name === 'yoolee.data') return 'data'
  if (name === 'yoolee.settings') return 'settings'
  return 'workbench'
})
const routeId = computed(() => String(route.params.id || ''))
const currentEmployee = computed(() => employees.value.find(item => item.id === routeId.value) || null)
const currentCustomer = computed(() => customers.value.find(item => item.id === routeId.value) || null)
const pageTitle = computed(() => {
  if (pageMode.value === 'workbench') return '工作台'
  if (pageMode.value === 'employees') return '员工'
  if (pageMode.value === 'employee-detail') return currentEmployee.value?.name || '员工详情'
  if (pageMode.value === 'customers') return '模拟客户'
  if (pageMode.value === 'customer-detail') return currentCustomer.value?.name || '客户详情'
  if (pageMode.value === 'evaluations') return '测评'
  if (pageMode.value === 'evaluation-detail') return selectedEvaluation.value ? `${selectedEvaluation.value.employee_name} × ${selectedEvaluation.value.customer_name}` : '测评详情'
  if (pageMode.value === 'learning') return '学习'
  if (pageMode.value === 'data') return '数据'
  return '设置'
})
const pageDescription = computed(() => {
  if (pageMode.value === 'workbench') return '从这里进入员工运营、测评复盘、学习回流和异常处理。'
  if (pageMode.value === 'employees') return '管理数字员工身份、Profile、能力和记忆。'
  if (pageMode.value === 'employee-detail') return '集中维护该员工的身份、能力、记忆和测评记录。'
  if (pageMode.value === 'customers') return '管理用于测评的模拟客户画像。'
  if (pageMode.value === 'customer-detail') return '查看客户画像和该客户参与的测评记录。'
  if (pageMode.value === 'evaluations') return '创建测评任务，跟踪运行状态，定位失败原因。'
  if (pageMode.value === 'evaluation-detail') return '查看对话、能力轨迹、人工评分和学习回流。'
  if (pageMode.value === 'learning') return '集中处理人工评分后的学习建议和记忆写入审计。'
  if (pageMode.value === 'data') return '观察测评质量、失败分布、能力调用和学习回流。'
  return '收纳全局提示词框架、底层说明和 Hermes 高级功能入口。'
})
const backTarget = computed(() => {
  if (pageMode.value === 'employee-detail') return { label: '返回员工', name: 'yoolee.employees' }
  if (pageMode.value === 'customer-detail') return { label: '返回模拟客户', name: 'yoolee.customers' }
  if (pageMode.value === 'evaluation-detail') return { label: '返回测评', name: 'yoolee.evaluations' }
  return null
})
const recentEvaluations = computed(() => evaluations.value.slice(0, 6))
const runningEvaluations = computed(() => evaluations.value.filter(item => item.status === 'running'))
const failedEvaluations = computed(() => evaluations.value.filter(item => item.status === 'failed'))
const pendingScoreEvaluations = computed(() => evaluations.value.filter(item => item.status === 'completed' && item.manual_score == null))
const pendingLearningEvaluations = computed(() => evaluations.value.filter(item => item.manual_score != null && item.learning_status === 'none'))
const profileOptions = computed(() => profiles.value.map(item => ({ label: item.name, value: item.name })))
const employeeOptions = computed(() => activeEmployees.value.map(item => ({ label: item.name, value: item.id })))
const customerOptions = computed(() => activeCustomers.value.map(item => ({ label: item.name, value: item.id })))
const skillOptions = computed(() => skillCategories.value.flatMap(category =>
  category.skills.map(skill => ({ label: `${skill.name} (${category.name})`, value: skill.name })),
))
const boundEmployeeProfileName = computed(() => String(employeeForm.profile_name || employeeForm.profile || 'default'))
const selectedEmployeeProfileName = computed(() => String(employeeForm.profile || boundEmployeeProfileName.value || 'default'))
const dedicatedProfileCandidate = computed(() => (
  editingEmployeeId.value
    ? `yoolee-employee-${editingEmployeeId.value.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}`
    : '保存员工后自动生成'
))
const isDedicatedProfileBound = computed(() => employeeForm.profile_strategy === 'dedicated')
const isOwnDedicatedProfileBound = computed(() => (
  isDedicatedProfileBound.value
  && boundEmployeeProfileName.value === dedicatedProfileCandidate.value
))
const canBindSelectedProfile = computed(() => (
  Boolean(editingEmployeeId.value)
  && (!isDedicatedProfileBound.value || selectedEmployeeProfileName.value !== boundEmployeeProfileName.value)
))
const employeeProfileStateText = computed(() => {
  if (!editingEmployeeId.value) return '新员工保存后才能创建或绑定员工 profile。'
  if (isOwnDedicatedProfileBound.value) return '已创建并绑定员工专属 Hermes profile。'
  if (isDedicatedProfileBound.value) return '已将 Hermes profile 绑定为该员工身份；可切换到当前选择的 profile，或解绑回手动模式。'
  return '当前为手动 profile；测评会使用这里选择的 profile，但不会沉淀为员工专属身份。'
})
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '运行中', value: 'running' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
]

function resetEmployeeForm() {
  Object.assign(employeeForm, {
    id: undefined,
    name: '',
    role: '',
    goal: '',
    system_prompt: '',
    provider: '',
    model: '',
    profile: 'default',
    profile_strategy: 'manual',
    profile_name: 'default',
    memory_mode: 'training_writable',
    profile_created_at: null,
    skills: [],
    knowledge_docs: [],
    status: 'active',
  })
  editingEmployeeId.value = ''
}

function resetCustomerForm() {
  Object.assign(customerForm, {
    id: undefined,
    name: '',
    industry: '',
    need: '',
    budget: '',
    concerns: '',
    stage: '',
    communication_style: '',
    opening_message: '',
    status: 'active',
  })
  editingCustomerId.value = ''
}

async function loadAll() {
  loading.value = true
  try {
    const [employeeList, customerList, evaluationList, profileList, categories, promptConfig, dashboard, data] = await Promise.all([
      fetchEmployees(),
      fetchCustomers(),
      fetchEvaluations(filters),
      fetchProfiles(),
      fetchSkills(),
      fetchPromptSettings(),
      fetchDashboardSummary().catch(() => null),
      fetchDataSummary().catch(() => null),
    ])
    employees.value = employeeList
    customers.value = customerList
    evaluations.value = evaluationList
    profiles.value = profileList
    skillCategories.value = categories
    promptSettings.value = promptConfig.settings
    dashboardSummary.value = dashboard
    dataSummary.value = data
    if (!showPromptModal.value) {
      promptForm.employee_prompt_template = promptConfig.settings.employee_prompt_template
      promptForm.customer_prompt_template = promptConfig.settings.customer_prompt_template
      promptForm.learning_prompt_template = promptConfig.settings.learning_prompt_template
      promptForm.auto_score_prompt_template = promptConfig.settings.auto_score_prompt_template
    }
    if (!evaluationForm.employee_id && activeEmployees.value[0]) evaluationForm.employee_id = activeEmployees.value[0].id
    if (!evaluationForm.customer_id && activeCustomers.value[0]) evaluationForm.customer_id = activeCustomers.value[0].id
    await syncRouteSelection()
  } catch (err: any) {
    message.error(err.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadEvaluationsOnly() {
  try {
    evaluations.value = await fetchEvaluations(filters)
    if (selectedEvaluation.value) {
      const fresh = evaluations.value.find(item => item.id === selectedEvaluation.value?.id)
      if (fresh) selectedEvaluation.value = { ...selectedEvaluation.value, ...fresh }
    }
  } catch (err: any) {
    message.error(err.message || '加载测评记录失败')
  }
}

async function selectEvaluation(evaluation: YooleeEvaluation) {
  selectedEvaluation.value = evaluation
  selectedTraceEvents.value = []
  selectedTurnScores.value = []
  learningSuggestion.value = null
  try {
    const detail = await fetchEvaluation(evaluation.id)
    selectedEvaluation.value = detail.evaluation
    selectedTraceEvents.value = detail.trace_events || []
    selectedTurnScores.value = detail.turn_scores || []
    learningSuggestion.value = detail.learning_suggestion
  } catch (err: any) {
    message.error(err.message || '加载测评详情失败')
  }
}

function openEmployeeModal(employee?: YooleeEmployee) {
  resetEmployeeForm()
  if (employee) {
    editingEmployeeId.value = employee.id
    Object.assign(employeeForm, {
      ...employee,
      skills: [...employee.skills],
      knowledge_docs: [...(employee.knowledge_docs || [])],
    })
  }
  showEmployeeModal.value = true
}

function openCustomerModal(customer?: YooleeCustomer) {
  resetCustomerForm()
  if (customer) {
    editingCustomerId.value = customer.id
    Object.assign(customerForm, customer)
  }
  showCustomerModal.value = true
}

async function submitEmployee() {
  if (!employeeForm.name?.trim()) {
    message.warning('请填写员工名称')
    return
  }
  try {
    const profile = String(employeeForm.profile || 'default')
    await saveEmployee({
      ...employeeForm,
      id: editingEmployeeId.value || undefined,
      profile,
      profile_name: employeeForm.profile_strategy === 'dedicated'
        ? String(employeeForm.profile_name || profile)
        : profile,
    })
    message.success('员工配置已保存')
    showEmployeeModal.value = false
    await loadAll()
  } catch (err: any) {
    message.error(err.message || '保存失败')
  }
}

async function createDedicatedProfileForEmployee() {
  if (!editingEmployeeId.value) {
    message.info('请先保存员工，再创建独立 profile')
    return
  }
  if (isOwnDedicatedProfileBound.value) {
    message.info('该员工已绑定专属 profile')
    return
  }
  creatingProfile.value = true
  try {
    const updated = await createEmployeeProfile(editingEmployeeId.value, employeeForm.profile || 'default')
    Object.assign(employeeForm, { ...updated, skills: [...updated.skills], knowledge_docs: [...updated.knowledge_docs] })
    const index = employees.value.findIndex(item => item.id === updated.id)
    if (index !== -1) employees.value[index] = updated
    await loadAll()
    message.success(`已创建员工独立 profile：${updated.profile_name || updated.profile}`)
  } catch (err: any) {
    message.error(err.message || '创建 profile 失败')
  } finally {
    creatingProfile.value = false
  }
}

async function bindSelectedProfileForEmployee() {
  if (!editingEmployeeId.value) {
    message.info('请先保存员工，再绑定 profile')
    return
  }
  const profile = selectedEmployeeProfileName.value
  if (!profile) {
    message.warning('请选择 Hermes profile')
    return
  }
  try {
    const updated = await saveEmployee({
      ...employeeForm,
      id: editingEmployeeId.value,
      profile,
      profile_name: profile,
      profile_strategy: 'dedicated',
    })
    Object.assign(employeeForm, { ...updated, skills: [...updated.skills], knowledge_docs: [...updated.knowledge_docs] })
    const index = employees.value.findIndex(item => item.id === updated.id)
    if (index !== -1) employees.value[index] = updated
    message.success(`已绑定 profile：${profile}`)
  } catch (err: any) {
    message.error(err.message || '绑定 profile 失败')
  }
}

async function unbindEmployeeProfile() {
  if (!editingEmployeeId.value) return
  const profile = selectedEmployeeProfileName.value || 'default'
  try {
    const updated = await saveEmployee({
      ...employeeForm,
      id: editingEmployeeId.value,
      profile,
      profile_name: profile,
      profile_strategy: 'manual',
    })
    Object.assign(employeeForm, { ...updated, skills: [...updated.skills], knowledge_docs: [...updated.knowledge_docs] })
    const index = employees.value.findIndex(item => item.id === updated.id)
    if (index !== -1) employees.value[index] = updated
    message.success('已解绑为手动 profile')
  } catch (err: any) {
    message.error(err.message || '解绑 profile 失败')
  }
}

function openHermesProfileManager() {
  showEmployeeModal.value = false
  router.push({ name: 'hermes.profiles' })
}

function openHermesAdvanced(name: string) {
  router.push({ name, query: { from: 'yoolee-settings' } })
}

async function openEmployeeMemory(employee: YooleeEmployee) {
  showEmployeeMemoryModal.value = true
  loadingEmployeeMemory.value = true
  employeeMemory.value = null
  try {
    employeeMemory.value = await fetchEmployeeMemory(employee.id)
  } catch (err: any) {
    message.error(err.message || '加载员工记忆失败')
  } finally {
    loadingEmployeeMemory.value = false
  }
}

async function submitCustomer() {
  if (!customerForm.name?.trim()) {
    message.warning('请填写客户称呼')
    return
  }
  try {
    await saveCustomer({ ...customerForm, id: editingCustomerId.value || undefined })
    message.success('客户画像已保存')
    showCustomerModal.value = false
    await loadAll()
  } catch (err: any) {
    message.error(err.message || '保存失败')
  }
}

async function toggleEmployee(employee: YooleeEmployee) {
  await saveEmployee({ ...employee, status: employee.status === 'active' ? 'inactive' : 'active' })
  await loadAll()
}

async function toggleCustomer(customer: YooleeCustomer) {
  await saveCustomer({ ...customer, status: customer.status === 'active' ? 'inactive' : 'active' })
  await loadAll()
}

async function deleteEmployee(employee: YooleeEmployee) {
  await removeEmployee(employee.id)
  message.success('员工已删除')
  await loadAll()
}

async function deleteCustomer(customer: YooleeCustomer) {
  await removeCustomer(customer.id)
  message.success('客户已删除')
  await loadAll()
}

async function startEvaluation() {
  if (!evaluationForm.employee_id || !evaluationForm.customer_id) {
    message.warning('请选择 AI员工和 AI客户')
    return
  }
  running.value = true
  try {
    const evaluation = await runEvaluation({
      employee_id: evaluationForm.employee_id,
      customer_id: evaluationForm.customer_id,
      max_rounds: evaluationForm.max_rounds,
      context: evaluationForm.context,
      memory_mode: evaluationForm.memory_mode,
      stop_keywords: evaluationForm.stop_keywords.split(/[,，\n]/).map(v => v.trim()).filter(Boolean),
    })
    await selectEvaluation(evaluation)
    openEvaluationDetail(evaluation)
    await loadEvaluationsOnly()
    message.success(evaluation.status === 'completed' ? '测评已完成' : '测评已结束，请查看记录')
  } catch (err: any) {
    message.error(err.message || '测评启动失败')
  } finally {
    running.value = false
  }
}

function openScoreModal(evaluation: YooleeEvaluation) {
  scoringEvaluationId.value = evaluation.id
  scoreForm.manual_score = evaluation.manual_score
  scoreForm.manual_note = evaluation.manual_note || ''
  scoreForm.conclusion = evaluation.conclusion || ''
  showScoreModal.value = true
}

function turnScoreForRound(round: number) {
  return selectedTurnScores.value.find(item => item.round === round) || null
}

function autoScoreStatusLabel(status?: string) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '评分中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  return '未评分'
}

function binaryScoreLabel(score: 0 | 1 | null | undefined) {
  if (score === 1) return '通过'
  if (score === 0) return '不通过'
  return '未评分'
}

function binaryScoreTagType(score: 0 | 1 | null | undefined) {
  if (score === 1) return 'success'
  if (score === 0) return 'error'
  return 'default'
}

function openTurnScoreModal(round: number) {
  if (!selectedEvaluation.value) return
  const score = turnScoreForRound(round)
  scoringTurnEvaluationId.value = selectedEvaluation.value.id
  turnScoreForm.round = round
  turnScoreForm.manual_score = score?.manual_score ?? null
  turnScoreForm.manual_note = score?.manual_note || ''
  showTurnScoreModal.value = true
}

async function submitScore() {
  if (!scoringEvaluationId.value) return
  try {
    const evaluation = await scoreEvaluation(scoringEvaluationId.value, { ...scoreForm })
    await selectEvaluation(evaluation)
    message.success('人工评分已保存')
    showScoreModal.value = false
    await loadEvaluationsOnly()
  } catch (err: any) {
    message.error(err.message || '保存评分失败')
  }
}

async function submitTurnScore() {
  if (!scoringTurnEvaluationId.value) return
  const manualScore = turnScoreForm.manual_score == null
    ? null
    : Number(turnScoreForm.manual_score) === 1 ? 1 : 0
  try {
    const result = await saveTurnScore(scoringTurnEvaluationId.value, turnScoreForm.round, {
      manual_score: manualScore,
      manual_note: turnScoreForm.manual_note,
    })
    selectedTurnScores.value = result.turn_scores
    selectedEvaluation.value = result.evaluation
    showTurnScoreModal.value = false
    message.success('逐轮人工评分已保存')
  } catch (err: any) {
    message.error(err.message || '保存逐轮评分失败')
  }
}

async function handleRerunAutoScore() {
  if (!selectedEvaluation.value) return
  runningAutoScore.value = true
  try {
    const result = await rerunEvaluationAutoScore(selectedEvaluation.value.id)
    selectedEvaluation.value = result.evaluation
    selectedTurnScores.value = result.turn_scores
    await loadEvaluationsOnly()
    message.success('自动打分已完成')
  } catch (err: any) {
    message.error(err.message || '自动打分失败')
  } finally {
    runningAutoScore.value = false
  }
}

async function handleGenerateLearning() {
  if (!selectedEvaluation.value) return
  generatingLearning.value = true
  try {
    const result = await generateLearningSuggestion(selectedEvaluation.value.id)
    learningSuggestion.value = result.learning_suggestion
    selectedEvaluation.value.learning_status = 'draft'
    message.success('学习建议已生成')
  } catch (err: any) {
    message.error(err.message || '生成学习建议失败')
  } finally {
    generatingLearning.value = false
  }
}

async function handleCommitLearning() {
  if (!selectedEvaluation.value || !learningSuggestion.value) return
  committingLearning.value = true
  try {
    const result = await commitLearningSuggestion(selectedEvaluation.value.id, learningSuggestion.value)
    learningSuggestion.value = result.learning_suggestion
    selectedEvaluation.value = result.evaluation
    message.success('学习建议已写入员工 MEMORY.md')
    await loadEvaluationsOnly()
  } catch (err: any) {
    message.error(err.message || '写入记忆失败')
  } finally {
    committingLearning.value = false
  }
}

async function handleRevertLearning() {
  if (!selectedEvaluation.value) return
  committingLearning.value = true
  try {
    const result = await revertLearningSuggestion(selectedEvaluation.value.id)
    learningSuggestion.value = result.learning_suggestion
    selectedEvaluation.value = result.evaluation
    message.success('已撤销本次学习写入')
    await loadEvaluationsOnly()
  } catch (err: any) {
    message.error(err.message || '撤销失败')
  } finally {
    committingLearning.value = false
  }
}

function openPromptModal() {
  promptForm.employee_prompt_template = promptSettings.value?.employee_prompt_template || ''
  promptForm.customer_prompt_template = promptSettings.value?.customer_prompt_template || ''
  promptForm.learning_prompt_template = promptSettings.value?.learning_prompt_template || ''
  promptForm.auto_score_prompt_template = promptSettings.value?.auto_score_prompt_template || ''
  showPromptModal.value = true
}

async function submitPromptSettings() {
  if (!promptForm.employee_prompt_template.trim()) {
    message.warning('请填写 AI员工全局框架')
    return
  }
  if (!promptForm.customer_prompt_template.trim()) {
    message.warning('请填写 AI客户全局框架')
    return
  }
  if (!promptForm.learning_prompt_template.trim()) {
    message.warning('请填写学习建议全局框架')
    return
  }
  if (!promptForm.auto_score_prompt_template.trim()) {
    message.warning('请填写自动打分全局框架')
    return
  }
  savingPromptSettings.value = true
  try {
    const result = await savePromptSettings({ ...promptForm })
    promptSettings.value = result.settings
    showPromptModal.value = false
    message.success('全局提示词框架已保存')
  } catch (err: any) {
    message.error(err.message || '保存提示词框架失败')
  } finally {
    savingPromptSettings.value = false
  }
}

async function restorePromptDefaults() {
  savingPromptSettings.value = true
  try {
    const result = await resetPromptSettings()
    promptSettings.value = result.settings
    promptForm.employee_prompt_template = result.settings.employee_prompt_template
    promptForm.customer_prompt_template = result.settings.customer_prompt_template
    promptForm.learning_prompt_template = result.settings.learning_prompt_template
    promptForm.auto_score_prompt_template = result.settings.auto_score_prompt_template
    message.success('已恢复默认提示词框架')
  } catch (err: any) {
    message.error(err.message || '恢复默认框架失败')
  } finally {
    savingPromptSettings.value = false
  }
}

function statusType(status: string) {
  if (status === 'completed' || status === 'active') return 'success'
  if (status === 'failed' || status === 'inactive') return 'error'
  return 'warning'
}

function fmtTime(value: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function duration(ms: number) {
  if (!ms) return '-'
  return `${Math.round(ms / 1000)}s`
}

function speakerLabel(message: EvaluationMessage) {
  if (message.speaker === 'employee') return 'AI员工'
  if (message.speaker === 'customer') return 'AI客户'
  return '系统'
}

function triggerKnowledgeUpload() {
  if (!editingEmployeeId.value) {
    message.info('请先保存员工，再上传知识库文档')
    return
  }
  knowledgeInputRef.value?.click()
}

async function handleKnowledgeFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !editingEmployeeId.value) return
  const name = file.name.toLowerCase()
  if (!name.endsWith('.md') && !name.endsWith('.markdown')) {
    message.warning('仅支持 Markdown 文档')
    return
  }
  uploadingKnowledge.value = true
  try {
    const updated = await uploadEmployeeKnowledge(editingEmployeeId.value, file)
    Object.assign(employeeForm, { ...updated, skills: [...updated.skills], knowledge_docs: [...updated.knowledge_docs] })
    const index = employees.value.findIndex(item => item.id === updated.id)
    if (index !== -1) employees.value[index] = updated
    message.success('知识库文档已上传')
  } catch (err: any) {
    message.error(err.message || '上传失败')
  } finally {
    uploadingKnowledge.value = false
  }
}

async function deleteKnowledgeDoc(docId: string) {
  if (!editingEmployeeId.value) return
  try {
    const updated = await removeEmployeeKnowledge(editingEmployeeId.value, docId)
    Object.assign(employeeForm, { ...updated, skills: [...updated.skills], knowledge_docs: [...updated.knowledge_docs] })
    const index = employees.value.findIndex(item => item.id === updated.id)
    if (index !== -1) employees.value[index] = updated
    message.success('知识库文档已删除')
  } catch (err: any) {
    message.error(err.message || '删除失败')
  }
}

function fmtSize(size: number) {
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightedTemplate(value?: string) {
  const safe = escapeHtml(value || '加载中...')
  return safe.replace(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g, '<span class="prompt-var-highlight">$1</span>')
}

async function syncRouteSelection() {
  if (pageMode.value === 'evaluation-detail' && routeId.value) {
    const evaluation = evaluations.value.find(item => item.id === routeId.value)
    if (evaluation && selectedEvaluation.value?.id !== evaluation.id) {
      await selectEvaluation(evaluation)
    }
  }
}

function go(name: string, params: Record<string, string> = {}) {
  router.push({ name, params })
}

function openEvaluationDetail(evaluation: YooleeEvaluation) {
  router.push({ name: 'yoolee.evaluationDetail', params: { id: evaluation.id } })
  selectEvaluation(evaluation)
}

function openEmployeeDetail(employee: YooleeEmployee) {
  router.push({ name: 'yoolee.employeeDetail', params: { id: employee.id } })
}

function openCustomerDetail(customer: YooleeCustomer) {
  router.push({ name: 'yoolee.customerDetail', params: { id: customer.id } })
}

function statusLabel(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'running') return '运行中'
  if (status === 'active') return '启用'
  if (status === 'inactive') return '停用'
  return status || '-'
}

function evaluationStage(evaluation: YooleeEvaluation) {
  return evaluation.stage || statusLabel(evaluation.status)
}

function failureAction(evaluation: YooleeEvaluation) {
  return evaluation.failure_action || (evaluation.status === 'failed' ? '查看原始日志' : '')
}

function displayError(error?: string) {
  const value = String(error || '')
  if (!value) return ''
  if (/ENOENT|not found|HERMES_BIN/i.test(value)) return 'Hermes CLI 未找到，请检查 HERMES_BIN 或服务启动 PATH。'
  if (/Command failed: hermes -z/i.test(value)) return '模型调用失败。完整命令已隐藏，请查看服务端日志定位。'
  return value.length > 280 ? `${value.slice(0, 280)}...` : value
}

function isNoisySkillInspectionTrace(trace: EvaluationTraceEvent) {
  const text = `${trace.title}\n${trace.detail}\n${trace.resource_name || ''}`.toLowerCase()
  return text.includes('skills_list') || text.includes('skill_view')
}

const displayTraceEvents = computed(() => {
  const counts = new Map<string, number>()
  const compact = new Map<string, EvaluationTraceEvent>()
  for (const trace of selectedTraceEvents.value.filter(trace => !isNoisySkillInspectionTrace(trace) || trace.display_summary)) {
    const key = trace.dedupe_key || `${trace.round}|${trace.display_type || trace.type}|${trace.scope || ''}|${trace.resource_name || ''}|${trace.title}`
    counts.set(key, (counts.get(key) || 0) + 1)
    if (!compact.has(key)) compact.set(key, trace)
  }
  return [...compact.entries()].map(([key, trace]) => ({
    ...trace,
    display_summary: counts.get(key)! > 1 ? `${trace.display_summary || trace.title} ×${counts.get(key)}` : (trace.display_summary || trace.title),
  }))
})

function traceSummary(events = displayTraceEvents.value) {
  const skillCount = events.filter(item => item.scope === 'bound_skill' || item.display_type === 'Skill 触发' || item.display_type === 'Skill 指南读取').length
  const knowledge = events.filter(item => item.is_employee_knowledge)
  const memoryCount = events.filter(item => item.display_type === 'Memory 读取/写入').length
  const toolCount = events.filter(item => item.display_type === '工具调用' || item.type === 'tool').length
  const blocked = events.filter(item => item.blocked || item.allowed === false || item.scope === 'external_file' || item.scope === 'unbound_skill')
  return {
    skillCount,
    knowledgeCount: knowledge.length,
    knowledgeNames: [...new Set(knowledge.map(item => item.resource_name || item.title).filter(Boolean))],
    memoryCount,
    toolCount,
    blockedCount: blocked.length,
    blockedNames: [...new Set(blocked.map(item => item.resource_name || item.title).filter(Boolean))],
  }
}

function tracesByRound(round: number) {
  return displayTraceEvents.value.filter(trace => trace.round === round)
}

function traceTypeLabel(trace: EvaluationTraceEvent) {
  return trace.display_type || trace.type
}

function traceScopeText(trace: EvaluationTraceEvent) {
  const scopeMap: Record<string, string> = {
    employee_knowledge: '员工私有知识库',
    bound_skill: '绑定 Skill',
    unbound_skill: '未绑定 Skill',
    memory: '员工记忆',
    session: 'Hermes Session',
    external_file: '非员工资源',
    unknown: '未分类',
  }
  const scope = scopeMap[String(trace.scope || '')] || trace.scope || '未分类'
  const resource = trace.resource_name ? ` · ${trace.resource_name}` : ''
  const allowed = trace.blocked || trace.allowed === false ? ' · 越界/污染风险' : ''
  return `${scope}${resource}${allowed}`
}

function traceTagType(trace: EvaluationTraceEvent) {
  if (trace.blocked || trace.allowed === false || trace.risk_level === 'high') return 'error'
  if (trace.status === 'failed' || trace.risk_level === 'medium') return 'error'
  if (trace.status === 'warning' || trace.risk_level === 'low') return 'warning'
  if (trace.allowed) return 'success'
  return 'info'
}

function employeeEvaluations(employeeId: string) {
  return evaluations.value.filter(item => item.employee_id === employeeId)
}

function customerEvaluations(customerId: string) {
  return evaluations.value.filter(item => item.customer_id === customerId)
}

function employeeLatestEvaluation(employeeId: string) {
  return employeeEvaluations(employeeId)[0] || null
}

function canGenerateNormalLearning(evaluation: YooleeEvaluation) {
  return evaluation.status === 'completed'
    && evaluation.capability_boundary_status !== 'polluted'
    && evaluation.messages.some(item => item.speaker === 'employee')
}

function canReviewUnsafeEvaluation(evaluation: YooleeEvaluation) {
  return evaluation.status === 'failed' || evaluation.capability_boundary_status === 'polluted'
}

function canCommitLearning() {
  return Boolean(selectedEvaluation.value
    && selectedEvaluation.value.status === 'completed'
    && selectedEvaluation.value.capability_boundary_status !== 'polluted'
    && learningSuggestion.value?.status !== 'written')
}

function dataPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

onMounted(loadAll)
</script>

<template>
  <div class="yoolee-view">
    <header class="yoolee-header">
      <div>
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </div>
      <NSpace size="small">
        <NButton v-if="backTarget" size="small" @click="go(backTarget.name)">{{ backTarget.label }}</NButton>
        <NButton size="small" @click="loadAll">刷新</NButton>
      </NSpace>
    </header>

    <NSpin :show="loading">
      <main class="yoolee-page">
        <section v-if="pageMode === 'workbench'" class="page-stack">
          <div class="metric-grid">
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.employees ?? employees.length }}</div><div class="metric-label">员工配置</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.active_employees ?? activeEmployees.length }}</div><div class="metric-label">启用员工</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.running_evaluations ?? runningEvaluations.length }}</div><div class="metric-label">运行中测评</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.failed_evaluations ?? failedEvaluations.length }}</div><div class="metric-label">失败测评</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.pending_scores ?? pendingScoreEvaluations.length }}</div><div class="metric-label">待评分</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dashboardSummary?.stats.pending_learning ?? pendingLearningEvaluations.length }}</div><div class="metric-label">待学习</div></NCard>
          </div>
          <div class="action-strip">
            <NButton type="primary" @click="openEmployeeModal()">新建员工</NButton>
            <NButton @click="go('yoolee.evaluations')">创建测评</NButton>
            <NButton @click="filters.status = 'failed'; go('yoolee.evaluations')">查看失败记录</NButton>
            <NButton @click="go('yoolee.learning')">处理学习建议</NButton>
          </div>
          <div class="dashboard-grid">
            <NCard size="small" title="最近测评">
              <div class="compact-list">
                <button v-for="evaluation in recentEvaluations" :key="evaluation.id" class="compact-row" @click="openEvaluationDetail(evaluation)">
                  <span>{{ evaluation.employee_name }} × {{ evaluation.customer_name }}</span>
                  <NTag :type="statusType(evaluation.status)" size="small">{{ statusLabel(evaluation.status) }}</NTag>
                </button>
              </div>
              <NEmpty v-if="!recentEvaluations.length" description="暂无测评记录" />
            </NCard>
            <NCard size="small" title="异常中心">
              <div class="compact-list">
                <button v-for="evaluation in failedEvaluations.slice(0, 6)" :key="evaluation.id" class="compact-row danger" @click="openEvaluationDetail(evaluation)">
                  <span>{{ evaluation.employee_name }} × {{ evaluation.customer_name }}</span>
                  <small>{{ evaluation.failure_type || '失败' }}</small>
                </button>
              </div>
              <NEmpty v-if="!failedEvaluations.length" description="当前没有失败测评" />
            </NCard>
            <NCard size="small" title="待办学习回流">
              <div class="compact-list">
                <button v-for="evaluation in pendingLearningEvaluations.slice(0, 6)" :key="evaluation.id" class="compact-row" @click="openEvaluationDetail(evaluation)">
                  <span>{{ evaluation.employee_name }} × {{ evaluation.customer_name }}</span>
                  <small>评分 {{ evaluation.manual_score }}</small>
                </button>
              </div>
              <NEmpty v-if="!pendingLearningEvaluations.length" description="暂无待处理学习建议" />
            </NCard>
          </div>
          <div class="section-toolbar">
            <div><h2>数据概览</h2><span>测评质量、失败分布、能力调用和学习回流</span></div>
          </div>
          <div class="metric-grid">
            <NCard size="small"><div class="metric-value">{{ dataSummary?.total_evaluations ?? evaluations.length }}</div><div class="metric-label">总测评</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dataPercent(dataSummary?.success_rate ?? 0) }}</div><div class="metric-label">成功率</div></NCard>
            <NCard size="small"><div class="metric-value">{{ Math.round((dataSummary?.average_duration_ms ?? 0) / 1000) }}s</div><div class="metric-label">平均耗时</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dataSummary?.learning_writes ?? evaluations.filter(e => e.learning_status === 'written').length }}</div><div class="metric-label">学习写入</div></NCard>
          </div>
          <div class="dashboard-grid">
            <NCard size="small" title="失败原因分布"><div class="compact-list"><div v-for="item in dataSummary?.failure_reasons || []" :key="item.type" class="compact-row static"><span>{{ item.type }}</span><strong>{{ item.count }}</strong></div></div><NEmpty v-if="!dataSummary?.failure_reasons.length" description="暂无失败记录" /></NCard>
            <NCard size="small" title="员工趋势"><div class="compact-list"><div v-for="item in dataSummary?.employee_trends || []" :key="item.employee_id" class="compact-row static"><span>{{ item.employee_name }}</span><small>{{ item.completed }}/{{ item.total }} 完成 · 均分 {{ item.average_score == null ? '-' : Math.round(item.average_score) }}</small></div></div></NCard>
            <NCard size="small" title="知识库读取"><div class="compact-list"><div v-for="item in dataSummary?.knowledge_usage || []" :key="item.name" class="compact-row static"><span>{{ item.name }}</span><strong>{{ item.count }}</strong></div></div><NEmpty v-if="!dataSummary?.knowledge_usage.length" description="暂无员工知识库读取记录" /></NCard>
          </div>
        </section>

        <section v-if="pageMode === 'employees'" class="page-stack">
          <div class="section-toolbar">
            <div><h2>员工</h2><span>{{ employees.length }} 个配置，{{ activeEmployees.length }} 个启用</span></div>
            <NButton type="primary" @click="openEmployeeModal()">新建员工</NButton>
          </div>
          <div v-if="employees.length" class="grid-list">
            <NCard v-for="employee in employees" :key="employee.id" size="small" class="entity-card" @click="openEmployeeDetail(employee)">
              <div class="entity-head">
                <div><h3>{{ employee.name }}</h3><p>{{ employee.role || '未设置岗位' }}</p></div>
                <NTag :type="statusType(employee.status)" size="small">{{ statusLabel(employee.status) }}</NTag>
              </div>
              <p class="entity-summary">{{ employee.goal || '未设置业务目标' }}</p>
              <div class="status-grid">
                <span>Profile：{{ employee.profile_strategy === 'dedicated' ? '独立' : '手动' }}</span>
                <span>记忆：{{ employee.memory_mode === 'readonly' ? '只读' : '可写' }}</span>
                <span>知识库：{{ employee.knowledge_docs?.length || 0 }}</span>
                <span>Skills：{{ employee.skills.length }}</span>
              </div>
              <div class="meta-line">最近测评：{{ employeeLatestEvaluation(employee.id)?.stage || employeeLatestEvaluation(employee.id)?.status || '暂无' }}</div>
              <NSpace size="small" class="card-actions" @click.stop>
                <NButton size="tiny" @click="openEmployeeModal(employee)">编辑</NButton>
                <NButton size="tiny" @click="toggleEmployee(employee)">{{ employee.status === 'active' ? '停用' : '启用' }}</NButton>
                <NButton size="tiny" type="error" ghost @click="deleteEmployee(employee)">删除</NButton>
              </NSpace>
            </NCard>
          </div>
          <NEmpty v-else description="还没有员工配置" />
        </section>

        <section v-if="pageMode === 'employee-detail'" class="page-stack">
          <template v-if="currentEmployee">
            <div class="detail-hero">
              <div><h2>{{ currentEmployee.name }}</h2><p>{{ currentEmployee.role || '未设置岗位' }}</p></div>
              <NSpace><NButton type="primary" @click="openEmployeeModal(currentEmployee)">编辑员工</NButton></NSpace>
            </div>
            <div class="detail-grid">
              <NCard size="small" title="概览">
                <p class="entity-summary">{{ currentEmployee.goal || '未设置业务目标' }}</p>
                <div class="status-grid">
                  <span>状态：{{ statusLabel(currentEmployee.status) }}</span>
                  <span>模型：{{ currentEmployee.provider || 'profile 默认' }} / {{ currentEmployee.model || 'profile 默认' }}</span>
                  <span>最近测评：{{ employeeLatestEvaluation(currentEmployee.id)?.stage || '暂无' }}</span>
                  <span>人工评分：{{ employeeLatestEvaluation(currentEmployee.id)?.manual_score ?? '未评分' }}</span>
                </div>
              </NCard>
              <NCard size="small" title="身份与 Profile">
                <div class="profile-panel compact">
                  <div>
                    <strong>{{ currentEmployee.profile_name || currentEmployee.profile || 'default' }}</strong>
                    <span>{{ currentEmployee.profile_strategy === 'dedicated' ? '员工独立 Profile' : '手动 Profile' }}</span>
                    <span>Profile 创建时间：{{ currentEmployee.profile_created_at ? fmtTime(currentEmployee.profile_created_at) : '未创建' }}</span>
                  </div>
                  <NButton size="small" @click="openHermesProfileManager">管理 Profiles</NButton>
                </div>
              </NCard>
              <NCard size="small" title="能力">
                <div class="tag-row"><NTag v-for="skill in currentEmployee.skills" :key="skill" size="small">{{ skill }}</NTag></div>
                <div class="meta-line">知识库：{{ currentEmployee.knowledge_docs.length }} 个 md 文档</div>
                <div v-for="doc in currentEmployee.knowledge_docs" :key="doc.id" class="meta-line">{{ doc.name }} · {{ fmtSize(doc.size) }}</div>
                <NButton size="small" class="card-actions" @click="openEmployeeModal(currentEmployee)">管理能力</NButton>
              </NCard>
              <NCard size="small" title="记忆">
                <p>记忆模式：{{ currentEmployee.memory_mode === 'readonly' ? '基准只读' : '训练可写' }}</p>
                <p class="meta-line">学习建议写入记录会在“学习”页集中审计；员工详情保留当前模式和最近测评入口。</p>
                <NSpace size="small" class="card-actions">
                  <NButton size="small" @click="openEmployeeMemory(currentEmployee)">查看 Profile 记忆</NButton>
                  <NButton size="small" @click="go('yoolee.learning')">查看学习记录</NButton>
                </NSpace>
              </NCard>
            </div>
            <NCard size="small" title="该员工测评记录">
              <div class="compact-list">
                <button v-for="evaluation in employeeEvaluations(currentEmployee.id)" :key="evaluation.id" class="compact-row" @click="openEvaluationDetail(evaluation)">
                  <span>{{ evaluation.customer_name }} · {{ fmtTime(evaluation.created_at) }}</span>
                  <NTag :type="statusType(evaluation.status)" size="small">{{ statusLabel(evaluation.status) }}</NTag>
                </button>
              </div>
            </NCard>
          </template>
          <NEmpty v-else description="没有找到该员工" />
        </section>

        <section v-if="pageMode === 'customers'" class="page-stack">
          <div class="section-toolbar">
            <div><h2>模拟客户</h2><span>{{ customers.length }} 个画像，{{ activeCustomers.length }} 个启用</span></div>
            <NButton type="primary" @click="openCustomerModal()">新建客户</NButton>
          </div>
          <div v-if="customers.length" class="grid-list">
            <NCard v-for="customer in customers" :key="customer.id" size="small" class="entity-card" @click="openCustomerDetail(customer)">
              <div class="entity-head">
                <div><h3>{{ customer.name }}</h3><p>{{ customer.industry || '未设置行业' }}</p></div>
                <NTag :type="statusType(customer.status)" size="small">{{ statusLabel(customer.status) }}</NTag>
              </div>
              <p class="entity-summary">{{ customer.need || '未设置需求' }}</p>
              <div class="meta-line">预算：{{ customer.budget || '-' }}</div>
              <div class="meta-line">阶段：{{ customer.stage || '-' }}</div>
              <div class="meta-line">顾虑：{{ customer.concerns || '-' }}</div>
              <NSpace size="small" class="card-actions" @click.stop>
                <NButton size="tiny" @click="openCustomerModal(customer)">编辑</NButton>
                <NButton size="tiny" @click="toggleCustomer(customer)">{{ customer.status === 'active' ? '停用' : '启用' }}</NButton>
                <NButton size="tiny" type="error" ghost @click="deleteCustomer(customer)">删除</NButton>
              </NSpace>
            </NCard>
          </div>
          <NEmpty v-else description="还没有模拟客户画像" />
        </section>

        <section v-if="pageMode === 'customer-detail'" class="page-stack">
          <template v-if="currentCustomer">
            <div class="detail-hero">
              <div><h2>{{ currentCustomer.name }}</h2><p>{{ currentCustomer.industry || '未设置行业' }}</p></div>
              <NSpace><NButton type="primary" @click="openCustomerModal(currentCustomer)">编辑客户</NButton></NSpace>
            </div>
            <div class="detail-grid">
              <NCard size="small" title="画像"><p>{{ currentCustomer.need || '未设置需求' }}</p><p class="meta-line">沟通风格：{{ currentCustomer.communication_style || '-' }}</p></NCard>
              <NCard size="small" title="交易条件"><p>预算：{{ currentCustomer.budget || '-' }}</p><p>阶段：{{ currentCustomer.stage || '-' }}</p><p>顾虑：{{ currentCustomer.concerns || '-' }}</p></NCard>
              <NCard size="small" title="开场白"><p>{{ currentCustomer.opening_message || '未设置开场白' }}</p></NCard>
            </div>
            <NCard size="small" title="该客户测评记录">
              <div class="compact-list">
                <button v-for="evaluation in customerEvaluations(currentCustomer.id)" :key="evaluation.id" class="compact-row" @click="openEvaluationDetail(evaluation)">
                  <span>{{ evaluation.employee_name }} · {{ fmtTime(evaluation.created_at) }}</span>
                  <NTag :type="statusType(evaluation.status)" size="small">{{ statusLabel(evaluation.status) }}</NTag>
                </button>
              </div>
            </NCard>
          </template>
          <NEmpty v-else description="没有找到该客户" />
        </section>

        <section v-if="pageMode === 'evaluations'" class="page-stack">
          <div class="run-layout">
            <NCard size="small" title="创建测评">
              <NForm label-placement="top">
                <NFormItem label="1. 选择员工"><NSelect v-model:value="evaluationForm.employee_id" :options="employeeOptions" placeholder="选择启用中的员工" /></NFormItem>
                <NFormItem label="2. 选择模拟客户"><NSelect v-model:value="evaluationForm.customer_id" :options="customerOptions" placeholder="选择启用中的客户" /></NFormItem>
                <div class="form-grid">
                  <NFormItem label="3. 最大轮次"><NInputNumber v-model:value="evaluationForm.max_rounds" :min="2" :max="20" /></NFormItem>
                  <NFormItem label="记忆模式"><NSelect v-model:value="evaluationForm.memory_mode" :options="[{ label: '训练可写', value: 'training_writable' }, { label: '基准只读', value: 'readonly' }]" /></NFormItem>
                </div>
                <NFormItem label="提前结束关键词"><NInput v-model:value="evaluationForm.stop_keywords" /></NFormItem>
                <NFormItem label="对话前情"><NInput v-model:value="evaluationForm.context" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" /></NFormItem>
                <NButton type="primary" :loading="running" :disabled="running" @click="startEvaluation">开始测评</NButton>
              </NForm>
            </NCard>
            <NCard size="small" title="运行反馈">
              <div class="note-list">
                <p>员工侧使用独立 Hermes session，测评间隔离。</p>
                <p>运行中会展示阶段：启动员工 Session、客户回合、员工回合、工具调用中。</p>
                <p>失败记录会标记失败类型，并给出重试、检查 Gateway、查看日志等动作。</p>
              </div>
            </NCard>
          </div>
          <div class="section-toolbar">
            <div><h2>测评记录</h2><span>{{ evaluations.length }} 条记录</span></div>
            <NSpace size="small">
              <NSelect v-model:value="filters.employee_id" :options="[{ label: '全部员工', value: '' }, ...employees.map(e => ({ label: e.name, value: e.id }))]" class="filter-select" @update:value="loadEvaluationsOnly" />
              <NSelect v-model:value="filters.customer_id" :options="[{ label: '全部客户', value: '' }, ...customers.map(c => ({ label: c.name, value: c.id }))]" class="filter-select" @update:value="loadEvaluationsOnly" />
              <NSelect v-model:value="filters.status" :options="statusOptions" class="filter-select" @update:value="loadEvaluationsOnly" />
            </NSpace>
          </div>
          <div class="evaluation-record-grid">
            <NCard v-for="evaluation in evaluations" :key="evaluation.id" size="small" class="evaluation-card" @click="openEvaluationDetail(evaluation)">
              <div class="entity-head">
                <div><h3>{{ evaluation.employee_name }} × {{ evaluation.customer_name }}</h3><p>{{ fmtTime(evaluation.created_at) }}</p></div>
                <NTag :type="statusType(evaluation.status)" size="small">{{ statusLabel(evaluation.status) }}</NTag>
              </div>
              <div class="meta-line">阶段：{{ evaluationStage(evaluation) }}</div>
              <div class="meta-line">轮次：{{ evaluation.max_rounds }} / 耗时：{{ duration(evaluation.duration_ms) }}</div>
              <div class="meta-line">人工评分：{{ evaluation.manual_score ?? '未评分' }}</div>
              <NAlert v-if="evaluation.status === 'failed'" type="error" class="inline-alert">{{ evaluation.failure_type || '未知失败' }} · {{ failureAction(evaluation) }}</NAlert>
            </NCard>
          </div>
        </section>

        <section v-if="pageMode === 'evaluation-detail'" class="page-stack">
          <template v-if="selectedEvaluation">
            <div class="detail-head detail-hero">
              <div><h2>{{ selectedEvaluation.employee_name }} × {{ selectedEvaluation.customer_name }}</h2><p>{{ selectedEvaluation.conclusion || '暂无结论' }}</p></div>
              <NSpace size="small">
                <NButton v-if="canGenerateNormalLearning(selectedEvaluation)" size="small" :loading="generatingLearning" @click="handleGenerateLearning">生成学习建议</NButton>
                <NButton v-else-if="canReviewUnsafeEvaluation(selectedEvaluation)" size="small" tertiary :loading="generatingLearning" @click="handleGenerateLearning">复盘失败/污染记录</NButton>
                <NButton v-if="selectedEvaluation.status === 'completed'" size="small" :loading="runningAutoScore" @click="handleRerunAutoScore">重新自动打分</NButton>
                <NButton size="small" @click="openScoreModal(selectedEvaluation)">人工评分</NButton>
              </NSpace>
            </div>
            <div class="score-line">
              <span>状态：{{ evaluationStage(selectedEvaluation) }}</span>
              <span>评分：{{ selectedEvaluation.manual_score ?? '未评分' }}</span>
              <span>自动分：{{ selectedEvaluation.auto_score == null ? '未评分' : `${selectedEvaluation.auto_score}/100` }}</span>
              <span>自动评分：{{ autoScoreStatusLabel(selectedEvaluation.auto_score_status) }}</span>
              <span>通过轮次：{{ selectedEvaluation.auto_score_pass_count }}/{{ selectedEvaluation.auto_score_total }}</span>
              <span>员工 Session：{{ selectedEvaluation.employee_session_id || '-' }}</span>
              <span>Profile：{{ selectedEvaluation.employee_profile || '-' }}</span>
              <span>Runtime：{{ selectedEvaluation.runtime_profile || '-' }}</span>
              <span>记忆：{{ selectedEvaluation.memory_mode === 'readonly' ? '基准只读' : '训练可写' }}</span>
            </div>
            <NAlert v-if="selectedEvaluation.auto_score_status === 'failed' || selectedEvaluation.auto_score_error_count" type="warning" class="inline-alert">
              {{ selectedEvaluation.auto_score_summary || `自动评分有 ${selectedEvaluation.auto_score_error_count} 个轮次失败，可重新自动打分。` }}
            </NAlert>
            <NAlert v-if="selectedEvaluation.status === 'failed'" type="error" class="inline-alert">
              {{ selectedEvaluation.failure_type || '测评失败' }}。建议：{{ failureAction(selectedEvaluation) }}
            </NAlert>
            <NAlert v-if="selectedEvaluation.capability_boundary_status === 'polluted'" type="warning" class="inline-alert">
              检测到非配置范围能力调用，结果可能受污染：{{ selectedEvaluation.boundary_warnings?.join('；') || '请查看能力轨迹中的越界资源。' }}
            </NAlert>
            <div class="trace-summary-grid">
              <NCard size="small"><div class="metric-value">{{ traceSummary().skillCount }}</div><div class="metric-label">绑定 Skill 读取</div></NCard>
              <NCard size="small"><div class="metric-value">{{ traceSummary().knowledgeCount }}</div><div class="metric-label">员工知识库读取</div></NCard>
              <NCard size="small"><div class="metric-value">{{ traceSummary().memoryCount }}</div><div class="metric-label">Memory 事件</div></NCard>
              <NCard size="small"><div class="metric-value">{{ traceSummary().toolCount }}</div><div class="metric-label">工具调用</div></NCard>
              <NCard size="small" :class="{ 'risk-card': traceSummary().blockedCount > 0 }"><div class="metric-value">{{ traceSummary().blockedCount }}</div><div class="metric-label">越界资源</div></NCard>
            </div>
            <div v-if="learningSuggestion" class="learning-card">
              <div class="learning-head">
                <div><strong>学习建议</strong><span>{{ learningSuggestion.status }}</span></div>
                <NSpace size="small">
                  <NButton v-if="canCommitLearning()" size="tiny" type="primary" :loading="committingLearning" @click="handleCommitLearning">确认写入 MEMORY.md</NButton>
                  <NButton v-if="learningSuggestion.status === 'written'" size="tiny" :loading="committingLearning" @click="handleRevertLearning">撤销写入</NButton>
                </NSpace>
              </div>
              <NForm label-placement="top" size="small">
                <NFormItem label="复盘摘要"><NInput v-model:value="learningSuggestion.summary" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></NFormItem>
                <NFormItem label="评分原因"><NInput v-model:value="learningSuggestion.score_reasoning" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" /></NFormItem>
                <NFormItem label="写入员工记忆的条目">
                  <div class="learning-entry-list">
                    <div v-for="entry in learningSuggestion.memory_entries" :key="entry.id" class="learning-entry">
                      <NCheckbox v-model:checked="entry.selected" />
                      <NInput v-model:value="entry.content" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" />
                    </div>
                  </div>
                </NFormItem>
                <NFormItem label="风险提示"><NInput v-model:value="learningSuggestion.risk" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></NFormItem>
              </NForm>
            </div>
            <div class="message-list">
              <template v-for="(item, index) in selectedEvaluation.messages" :key="`${item.created_at}-${index}`">
                <div class="message-row" :class="item.speaker">
                  <div class="message-meta">第 {{ item.round }} 轮 · {{ speakerLabel(item) }} · {{ fmtTime(item.created_at) }}</div>
                  <div class="message-content">{{ item.content }}</div>
                  <div v-if="item.error" class="message-error">{{ displayError(item.error) }}</div>
                  <div v-if="item.speaker === 'employee'" class="turn-score-panel">
                    <div class="turn-score-tags">
                      <NTag size="tiny" :type="binaryScoreTagType(turnScoreForRound(item.round)?.auto_score)">自动：{{ binaryScoreLabel(turnScoreForRound(item.round)?.auto_score) }}</NTag>
                      <NTag size="tiny" :type="binaryScoreTagType(turnScoreForRound(item.round)?.manual_score)">人工：{{ binaryScoreLabel(turnScoreForRound(item.round)?.manual_score) }}</NTag>
                      <NButton size="tiny" text @click="openTurnScoreModal(item.round)">人工逐轮评分</NButton>
                    </div>
                    <div v-if="turnScoreForRound(item.round)?.auto_reason" class="meta-line">自动原因：{{ turnScoreForRound(item.round)?.auto_reason }}</div>
                    <div v-if="turnScoreForRound(item.round)?.violated_rubric" class="meta-line">违反标准：{{ turnScoreForRound(item.round)?.violated_rubric }}</div>
                    <div v-if="turnScoreForRound(item.round)?.auto_analysis" class="meta-line">分析：{{ turnScoreForRound(item.round)?.auto_analysis }}</div>
                    <div v-if="turnScoreForRound(item.round)?.manual_note" class="meta-line">人工备注：{{ turnScoreForRound(item.round)?.manual_note }}</div>
                    <div v-if="turnScoreForRound(item.round)?.auto_error" class="message-error">{{ turnScoreForRound(item.round)?.auto_error }}</div>
                    <div v-if="!turnScoreForRound(item.round)" class="meta-line">自动评分状态：{{ autoScoreStatusLabel(selectedEvaluation.auto_score_status) }}</div>
                  </div>
                </div>
                <NCollapse v-if="item.speaker === 'employee'" class="trace-collapse">
                  <NCollapseItem :title="tracesByRound(item.round).length ? `第 ${item.round} 轮能力轨迹 · ${tracesByRound(item.round).length} 条` : `第 ${item.round} 轮能力轨迹 · 未读取知识库`" :name="String(item.round)">
                    <div v-if="tracesByRound(item.round).length" class="trace-stack">
                      <div v-for="trace in tracesByRound(item.round)" :key="trace.id" class="trace-row" :class="trace.status">
                        <div class="trace-title">
                          <span>{{ trace.display_summary || trace.title }}</span>
                          <NTag size="tiny" :type="traceTagType(trace)">{{ traceTypeLabel(trace) }}</NTag>
                        </div>
                        <div class="meta-line">{{ traceScopeText(trace) }}</div>
                        <div v-if="trace.detail" class="trace-detail">{{ trace.detail }}</div>
                      </div>
                    </div>
                    <NEmpty v-else description="本轮未读取知识库，也没有工具轨迹" />
                  </NCollapseItem>
                </NCollapse>
              </template>
            </div>
            <NCollapse v-if="selectedTraceEvents.length" class="trace-collapse raw-trace-collapse">
              <NCollapseItem :title="`原始 trace 事件 · ${selectedTraceEvents.length} 条`" name="raw-trace">
                <div class="trace-stack">
                  <div v-for="trace in selectedTraceEvents" :key="`raw-${trace.id}`" class="trace-row">
                    <div class="trace-title"><span>{{ trace.title }}</span><NTag size="tiny" :type="traceTagType(trace)">{{ traceTypeLabel(trace) }}</NTag></div>
                    <div class="meta-line">{{ traceScopeText(trace) }}</div>
                    <div v-if="trace.detail" class="trace-detail">{{ trace.detail }}</div>
                  </div>
                </div>
              </NCollapseItem>
            </NCollapse>
          </template>
          <NEmpty v-else description="选择一条测评记录查看完整对话" />
        </section>

        <section v-if="pageMode === 'learning'" class="page-stack">
          <div class="section-toolbar"><div><h2>学习建议</h2><span>集中处理评分后的学习回流</span></div></div>
          <div class="evaluation-record-grid">
            <NCard v-for="evaluation in evaluations.filter(item => item.manual_score != null || item.learning_status !== 'none')" :key="evaluation.id" size="small" class="evaluation-card" @click="openEvaluationDetail(evaluation)">
              <div class="entity-head">
                <div><h3>{{ evaluation.employee_name }} × {{ evaluation.customer_name }}</h3><p>{{ fmtTime(evaluation.created_at) }}</p></div>
                <NTag size="small" :type="evaluation.learning_status === 'written' ? 'success' : evaluation.learning_status === 'discarded' ? 'warning' : 'info'">{{ evaluation.learning_status === 'none' ? '待生成' : evaluation.learning_status }}</NTag>
              </div>
              <div class="meta-line">人工评分：{{ evaluation.manual_score ?? '未评分' }}</div>
              <div class="meta-line">状态：{{ statusLabel(evaluation.status) }}</div>
            </NCard>
          </div>
        </section>

        <section v-if="pageMode === 'data'" class="page-stack">
          <div class="metric-grid">
            <NCard size="small"><div class="metric-value">{{ dataSummary?.total_evaluations ?? evaluations.length }}</div><div class="metric-label">总测评</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dataPercent(dataSummary?.success_rate ?? 0) }}</div><div class="metric-label">成功率</div></NCard>
            <NCard size="small"><div class="metric-value">{{ Math.round((dataSummary?.average_duration_ms ?? 0) / 1000) }}s</div><div class="metric-label">平均耗时</div></NCard>
            <NCard size="small"><div class="metric-value">{{ dataSummary?.learning_writes ?? evaluations.filter(e => e.learning_status === 'written').length }}</div><div class="metric-label">学习写入</div></NCard>
          </div>
          <div class="dashboard-grid">
            <NCard size="small" title="失败原因分布"><div class="compact-list"><div v-for="item in dataSummary?.failure_reasons || []" :key="item.type" class="compact-row static"><span>{{ item.type }}</span><strong>{{ item.count }}</strong></div></div></NCard>
            <NCard size="small" title="员工趋势"><div class="compact-list"><div v-for="item in dataSummary?.employee_trends || []" :key="item.employee_id" class="compact-row static"><span>{{ item.employee_name }}</span><small>{{ item.completed }}/{{ item.total }} 完成 · 均分 {{ item.average_score == null ? '-' : Math.round(item.average_score) }}</small></div></div></NCard>
            <NCard size="small" title="知识库读取"><div class="compact-list"><div v-for="item in dataSummary?.knowledge_usage || []" :key="item.name" class="compact-row static"><span>{{ item.name }}</span><strong>{{ item.count }}</strong></div></div><NEmpty v-if="!dataSummary?.knowledge_usage.length" description="暂无员工知识库读取记录" /></NCard>
          </div>
        </section>

        <section v-if="pageMode === 'settings'" class="page-stack">
          <NCollapse :default-expanded-names="['advanced']">
            <NCollapseItem title="全局提示词框架" name="prompt">
              <div class="prompt-framework-head">
                <div><p>数字员工、AI客户、学习建议和自动打分都有默认框架；运行时会替换变量。</p></div>
                <NButton size="small" type="primary" @click="openPromptModal">编辑框架</NButton>
              </div>
              <div class="prompt-preview-grid">
                <div class="prompt-preview"><h3>AI员工框架</h3><div class="prompt-template-html" v-html="highlightedTemplate(promptSettings?.employee_prompt_template)" /></div>
                <div class="prompt-preview"><h3>AI客户框架</h3><div class="prompt-template-html" v-html="highlightedTemplate(promptSettings?.customer_prompt_template)" /></div>
                <div class="prompt-preview"><h3>学习建议框架</h3><div class="prompt-template-html" v-html="highlightedTemplate(promptSettings?.learning_prompt_template)" /></div>
                <div class="prompt-preview"><h3>自动打分框架</h3><div class="prompt-template-html" v-html="highlightedTemplate(promptSettings?.auto_score_prompt_template)" /></div>
              </div>
              <div class="prompt-variable-row"><NTag v-for="item in promptVariables" :key="item" size="small">{{ item }}</NTag></div>
            </NCollapseItem>
            <NCollapseItem title="底层引擎与隔离机制" name="engine">
              <div class="engine-grid">
                <div><h3>已有机制</h3><p>数字员工测评侧由 Hermes Gateway session 驱动；每次测评创建独立员工 session，测评间隔离。</p><p>员工使用独立/手动 Hermes Profile、绑定 skills 与知识库目录；客户默认 --ignore-rules。</p></div>
                <div><h3>学习回流</h3><p>人工评分可生成学习建议，经人类确认后追加写入员工 MEMORY.md；不自动污染记忆，也不写 SOUL.md。</p></div>
              </div>
            </NCollapseItem>
            <NCollapseItem title="Hermes 底座高级功能" name="advanced">
              <div class="advanced-link-grid">
                <NButton @click="openHermesAdvanced('hermes.profiles')">Profiles</NButton>
                <NButton @click="openHermesAdvanced('hermes.skills')">Skills</NButton>
                <NButton @click="openHermesAdvanced('hermes.memory')">Memory</NButton>
                <NButton @click="openHermesAdvanced('hermes.models')">Models</NButton>
                <NButton @click="openHermesAdvanced('hermes.gateways')">Gateway</NButton>
                <NButton @click="openHermesAdvanced('hermes.logs')">Logs</NButton>
                <NButton @click="openHermesAdvanced('hermes.usage')">Usage</NButton>
                <NButton @click="openHermesAdvanced('hermes.terminal')">Terminal</NButton>
                <NButton @click="openHermesAdvanced('hermes.files')">Files</NButton>
              </div>
            </NCollapseItem>
          </NCollapse>
        </section>
      </main>
    </NSpin>

    <NModal v-model:show="showEmployeeModal" preset="dialog" :title="editingEmployeeId ? '编辑 AI员工' : '新建 AI员工'" style="width: 720px;">
      <NForm label-placement="top">
        <div class="form-grid">
          <NFormItem label="员工名称" required>
            <NInput v-model:value="employeeForm.name" placeholder="如：销售顾问 Yoolee" />
          </NFormItem>
          <NFormItem label="岗位">
            <NInput v-model:value="employeeForm.role" placeholder="如：企业软件销售" />
          </NFormItem>
          <NFormItem label="运行 Hermes Profile">
            <NSelect v-model:value="employeeForm.profile" :options="profileOptions" />
          </NFormItem>
          <NFormItem label="绑定策略">
            <NSelect
              v-model:value="employeeForm.profile_strategy"
              :options="[
                { label: '手动使用所选 profile', value: 'manual' },
                { label: '绑定为员工身份 profile', value: 'dedicated' },
              ]"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="employeeForm.status" :options="[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]" />
          </NFormItem>
          <NFormItem label="记忆模式">
            <NSelect
              v-model:value="employeeForm.memory_mode"
              :options="[
                { label: '训练可写', value: 'training_writable' },
                { label: '基准只读', value: 'readonly' },
              ]"
            />
          </NFormItem>
          <NFormItem label="Provider">
            <NInput v-model:value="employeeForm.provider" placeholder="留空则使用 profile 默认配置" />
          </NFormItem>
          <NFormItem label="Model">
            <NInput v-model:value="employeeForm.model" placeholder="留空则使用 profile 默认模型" />
          </NFormItem>
        </div>
        <NFormItem label="业务目标">
          <NInput v-model:value="employeeForm.goal" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
        <NFormItem label="系统提示词">
          <NInput v-model:value="employeeForm.system_prompt" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" />
        </NFormItem>
        <NFormItem label="绑定 Skills">
          <NSelect v-model:value="employeeForm.skills" multiple filterable :options="skillOptions" placeholder="选择已安装 Hermes skills" />
        </NFormItem>
        <NFormItem label="员工独立 Profile">
          <div class="profile-panel">
            <div>
              <strong>{{ boundEmployeeProfileName }}</strong>
              <span>{{ employeeProfileStateText }}</span>
              <span>当前选择：{{ selectedEmployeeProfileName }}</span>
              <span>专属 profile 名：{{ dedicatedProfileCandidate }}</span>
              <span>说明：左侧“用户”下拉是人工工作台的当前 profile；这里绑定的是数字员工测评时固定使用的身份 profile，不会跟随左侧下拉自动变化。</span>
            </div>
            <div class="profile-actions">
              <NButton
                size="small"
                :loading="creatingProfile"
                :disabled="!editingEmployeeId || isOwnDedicatedProfileBound"
                @click="createDedicatedProfileForEmployee"
              >
                {{ isOwnDedicatedProfileBound ? '已创建并绑定' : '创建专属 Profile' }}
              </NButton>
              <NButton
                size="small"
                :disabled="!canBindSelectedProfile"
                @click="bindSelectedProfileForEmployee"
              >
                {{ isDedicatedProfileBound ? '切换到当前选择' : '绑定当前选择' }}
              </NButton>
              <NButton
                size="small"
                :disabled="!editingEmployeeId || !isDedicatedProfileBound"
                @click="unbindEmployeeProfile"
              >
                解绑为手动
              </NButton>
              <NButton size="small" tertiary @click="openHermesProfileManager">
                管理 Profiles
              </NButton>
            </div>
          </div>
        </NFormItem>
        <NFormItem label="知识库（仅 md 文档）">
          <div class="knowledge-panel">
            <input ref="knowledgeInputRef" type="file" accept=".md,.markdown" class="hidden-file-input" @change="handleKnowledgeFileChange" />
            <div class="knowledge-actions">
              <NButton size="small" :loading="uploadingKnowledge" :disabled="!editingEmployeeId" @click="triggerKnowledgeUpload">
                上传 md 文档
              </NButton>
              <span>{{ editingEmployeeId ? '上传后保存为员工私有知识库目录，测评时由 Hermes 按需读取。' : '请先保存员工，再上传知识库文档。' }}</span>
            </div>
            <div v-if="employeeForm.knowledge_docs?.length" class="knowledge-list">
              <div v-for="doc in employeeForm.knowledge_docs" :key="doc.id" class="knowledge-item">
                <div>
                  <strong>{{ doc.name }}</strong>
                  <span>{{ fmtSize(doc.size) }} · {{ doc.path }}</span>
                </div>
                <NPopconfirm @positive-click="deleteKnowledgeDoc(doc.id)">
                  <template #trigger>
                    <NButton size="tiny" type="error" ghost>删除</NButton>
                  </template>
                  删除这个知识库文档？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </NFormItem>
        <NSpace justify="end">
          <NButton @click="showEmployeeModal = false">取消</NButton>
          <NButton type="primary" @click="submitEmployee">保存</NButton>
        </NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="showCustomerModal" preset="dialog" :title="editingCustomerId ? '编辑 AI客户' : '新建 AI客户'" style="width: 720px;">
      <NForm label-placement="top">
        <div class="form-grid">
          <NFormItem label="客户称呼" required>
            <NInput v-model:value="customerForm.name" placeholder="如：王总" />
          </NFormItem>
          <NFormItem label="行业">
            <NInput v-model:value="customerForm.industry" placeholder="如：制造业" />
          </NFormItem>
          <NFormItem label="预算">
            <NInput v-model:value="customerForm.budget" placeholder="如：20万以内" />
          </NFormItem>
          <NFormItem label="购买阶段">
            <NInput v-model:value="customerForm.stage" placeholder="如：初步了解 / 比价 / 决策中" />
          </NFormItem>
          <NFormItem label="沟通风格">
            <NInput v-model:value="customerForm.communication_style" placeholder="如：谨慎、追问细节、重视 ROI" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="customerForm.status" :options="[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]" />
          </NFormItem>
        </div>
        <NFormItem label="需求">
          <NInput v-model:value="customerForm.need" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
        <NFormItem label="顾虑">
          <NInput v-model:value="customerForm.concerns" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
        <NFormItem label="开场白">
          <NInput v-model:value="customerForm.opening_message" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
        <NSpace justify="end">
          <NButton @click="showCustomerModal = false">取消</NButton>
          <NButton type="primary" @click="submitCustomer">保存</NButton>
        </NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="showEmployeeMemoryModal" preset="dialog" title="员工 Profile 记忆" style="width: 760px;">
      <NSpin :show="loadingEmployeeMemory">
        <div v-if="employeeMemory" class="employee-memory-panel">
          <div class="memory-meta">
            <strong>{{ employeeMemory.profile }}</strong>
            <span>{{ employeeMemory.memory_path }}</span>
            <span>更新时间：{{ employeeMemory.memory_mtime ? fmtTime(employeeMemory.memory_mtime) : '暂无' }}</span>
          </div>
          <NCard size="small" title="MEMORY.md">
            <pre class="memory-readonly">{{ employeeMemory.memory || '暂无员工记忆。' }}</pre>
          </NCard>
          <NCard size="small" title="最近学习写入">
            <div v-if="employeeMemory.learning_records.length" class="compact-list">
              <button v-for="record in employeeMemory.learning_records" :key="record.learning_suggestion.id" class="compact-row" @click="openEvaluationDetail(record.evaluation); showEmployeeMemoryModal = false">
                <span>{{ record.evaluation.employee_name }} × {{ record.evaluation.customer_name }}</span>
                <small>{{ record.learning_suggestion.status }} · {{ fmtTime(record.learning_suggestion.updated_at) }}</small>
              </button>
            </div>
            <NEmpty v-else description="暂无学习写入记录" />
          </NCard>
        </div>
        <NEmpty v-else-if="!loadingEmployeeMemory" description="没有读取到员工记忆" />
      </NSpin>
    </NModal>

    <NModal v-model:show="showScoreModal" preset="dialog" title="人工评分" style="width: 560px;">
      <NForm label-placement="top">
        <NFormItem label="总分">
          <NInputNumber v-model:value="scoreForm.manual_score" :min="0" :max="100" placeholder="0-100" />
        </NFormItem>
        <NFormItem label="结论">
          <NInput v-model:value="scoreForm.conclusion" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="scoreForm.manual_note" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" />
        </NFormItem>
        <NSpace justify="end">
          <NButton @click="showScoreModal = false">取消</NButton>
          <NButton type="primary" @click="submitScore">保存评分</NButton>
        </NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="showTurnScoreModal" preset="dialog" title="人工逐轮评分" style="width: 520px;">
      <NForm label-placement="top">
        <NFormItem label="轮次">
          <NInputNumber v-model:value="turnScoreForm.round" disabled />
        </NFormItem>
        <NFormItem label="本轮结论">
          <NInputNumber v-model:value="turnScoreForm.manual_score" :min="0" :max="1" clearable placeholder="0 不通过，1 通过，留空未评分" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="turnScoreForm.manual_note" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="记录人工修正理由，供学习建议参考" />
        </NFormItem>
        <NSpace justify="end">
          <NButton @click="showTurnScoreModal = false">取消</NButton>
          <NButton type="primary" @click="submitTurnScore">保存逐轮评分</NButton>
        </NSpace>
      </NForm>
    </NModal>

    <NModal v-model:show="showPromptModal" preset="dialog" title="编辑全局提示词框架" style="width: 860px;">
      <NForm label-placement="top">
        <NFormItem label="AI员工全局框架">
          <div class="prompt-editor-stack">
            <NInput
              v-model:value="promptForm.employee_prompt_template"
              type="textarea"
              :autosize="{ minRows: 10, maxRows: 18 }"
              placeholder="定义数字员工默认提示词框架"
            />
            <div class="prompt-live-preview" v-html="highlightedTemplate(promptForm.employee_prompt_template)" />
          </div>
        </NFormItem>
        <NFormItem label="AI客户全局框架">
          <div class="prompt-editor-stack">
            <NInput
              v-model:value="promptForm.customer_prompt_template"
              type="textarea"
              :autosize="{ minRows: 10, maxRows: 18 }"
              placeholder="定义 AI客户默认提示词框架"
            />
            <div class="prompt-live-preview" v-html="highlightedTemplate(promptForm.customer_prompt_template)" />
          </div>
        </NFormItem>
        <NFormItem label="学习建议全局框架">
          <div class="prompt-editor-stack">
            <NInput
              v-model:value="promptForm.learning_prompt_template"
              type="textarea"
              :autosize="{ minRows: 10, maxRows: 18 }"
              placeholder="定义人工评分后生成学习建议的复盘提示词框架"
            />
            <div class="prompt-live-preview" v-html="highlightedTemplate(promptForm.learning_prompt_template)" />
          </div>
        </NFormItem>
        <NFormItem label="自动打分全局框架">
          <div class="prompt-editor-stack">
            <NInput
              v-model:value="promptForm.auto_score_prompt_template"
              type="textarea"
              :autosize="{ minRows: 10, maxRows: 18 }"
              placeholder="定义测评完成后的逐轮自动质检评分框架"
            />
            <div class="prompt-live-preview" v-html="highlightedTemplate(promptForm.auto_score_prompt_template)" />
          </div>
        </NFormItem>
        <NFormItem label="可用变量">
          <div class="prompt-editor-help">
            <NTag v-for="item in promptVariables" :key="item" size="small">{{ item }}</NTag>
          </div>
        </NFormItem>
        <NSpace justify="space-between">
          <NButton :loading="savingPromptSettings" @click="restorePromptDefaults">恢复默认</NButton>
          <NSpace>
            <NButton @click="showPromptModal = false">取消</NButton>
            <NButton type="primary" :loading="savingPromptSettings" @click="submitPromptSettings">保存</NButton>
          </NSpace>
        </NSpace>
      </NForm>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.yoolee-view {
  min-height: calc(100 * var(--vh));
  background: $bg-primary;
}

.yoolee-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid $border-color;

  h1 {
    font-size: 20px;
    line-height: 1.3;
    color: $text-primary;
  }

  p {
    margin-top: 4px;
    color: $text-secondary;
  }
}

.yoolee-page {
  padding: 20px 24px 28px;
}

.page-stack {
  display: grid;
  gap: 18px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 12px;
}

.metric-value {
  color: $text-primary;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.metric-label {
  margin-top: 4px;
  color: $text-secondary;
  font-size: 12px;
}

.action-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-grid,
.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-hero {
  padding: 16px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card;

  h2 {
    color: $text-primary;
    font-size: 20px;
  }

  p {
    margin-top: 4px;
    color: $text-secondary;
  }
}

.compact-list {
  display: grid;
  gap: 8px;
}

.compact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card-hover;
  color: $text-primary;
  text-align: left;
  cursor: pointer;

  &.static {
    cursor: default;
  }

  &.danger {
    border-color: rgba(var(--error-rgb), 0.25);
  }

  small {
    color: $text-secondary;
  }
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
  margin-top: 10px;
  color: $text-secondary;
  font-size: 12px;
}

.evaluation-record-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.inline-alert {
  margin-top: 10px;
}

.trace-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.risk-card {
  border-color: rgba(var(--warning-rgb), 0.45);
}

.trace-collapse {
  width: min(82%, 720px);
  margin-top: -4px;
  margin-left: 18px;
  align-self: flex-start;
}

.raw-trace-collapse {
  width: 100%;
  margin-left: 0;
  margin-top: 12px;
}

.advanced-link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.prompt-framework-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  p {
    margin: 0 0 4px;
    color: $text-secondary;
    font-size: 13px;
    line-height: 1.6;
  }
}

.prompt-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.prompt-preview {
  padding: 10px 12px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card-hover;

  h3 {
    margin: 0 0 8px;
    color: $text-primary;
    font-size: 13px;
  }

  .prompt-template-html {
    max-height: 220px;
    margin: 0;
    overflow: auto;
    color: $text-secondary;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.prompt-template-html,
.prompt-live-preview {
  :deep(.prompt-var-highlight) {
    display: inline-block;
    padding: 0 4px;
    color: var(--accent-info);
    background: rgba(var(--accent-info-rgb), 0.1);
    border: 1px solid rgba(var(--accent-info-rgb), 0.22);
    border-radius: 4px;
    font-weight: 600;
  }
}

.prompt-editor-stack {
  width: 100%;
  display: grid;
  gap: 8px;
}

.prompt-live-preview {
  max-height: 180px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card-hover;
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-variable-row,
.prompt-editor-help {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-variable-row {
  margin-top: 12px;
}

.engine-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;

  h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: $text-primary;
  }

  p {
    margin: 6px 0 0;
    color: $text-secondary;
    font-size: 13px;
    line-height: 1.6;
  }
}

.advanced-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0;

  h2 {
    font-size: 16px;
    color: $text-primary;
  }

  span {
    color: $text-secondary;
    font-size: 13px;
  }
}

.grid-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.entity-card,
.evaluation-card,
.evaluation-detail {
  border-radius: $radius-sm;
}

.entity-card,
.evaluation-card {
  cursor: pointer;
}

.entity-head,
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h3 {
    font-size: 15px;
    color: $text-primary;
  }

  p {
    margin-top: 2px;
    color: $text-secondary;
    font-size: 13px;
  }
}

.entity-summary {
  margin: 12px 0;
  color: $text-primary;
  min-height: 42px;
}

.meta-line {
  color: $text-secondary;
  font-size: 12px;
  margin-top: 4px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
  margin-top: 10px;
}

.card-actions {
  margin-top: 12px;
}

.run-layout {
  display: grid;
  grid-template-columns: minmax(320px, 520px) minmax(260px, 1fr);
  gap: 16px;
  margin-top: 18px;
}

.note-list {
  display: grid;
  gap: 10px;
  color: $text-secondary;
}

.filter-select {
  width: 160px;
}

.knowledge-panel {
  width: 100%;
  display: grid;
  gap: 10px;
}

.hidden-file-input {
  display: none;
}

.knowledge-actions {
  display: flex;
  align-items: center;
  gap: 10px;

  span {
    color: $text-secondary;
    font-size: 12px;
  }
}

.knowledge-list {
  display: grid;
  gap: 8px;
}

.knowledge-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;

  strong {
    display: block;
    color: $text-primary;
    font-size: 13px;
  }

  span {
    display: block;
    margin-top: 3px;
    color: $text-muted;
    font-size: 12px;
    word-break: break-all;
  }
}

.evaluation-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 16px;
}

.evaluation-list {
  display: grid;
  align-content: start;
  gap: 10px;
  max-height: calc(100vh - 210px);
  overflow: auto;
}

.evaluation-card {
  cursor: pointer;

  &.active {
    outline: 2px solid $accent-primary;
  }
}

.evaluation-detail {
  min-height: 480px;
}

.score-line {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 12px 0;
  color: $text-secondary;
  font-size: 13px;
}

.learning-card {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid rgba(var(--accent-info-rgb), 0.28);
  border-radius: $radius-sm;
  background: rgba(var(--accent-info-rgb), 0.06);
}

.learning-head,
.profile-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.profile-panel.compact {
  padding: 0;
  border: none;
  background: transparent;
}

.learning-head {
  margin-bottom: 10px;

  strong {
    display: block;
    color: $text-primary;
  }

  span {
    color: $text-muted;
    font-size: 12px;
  }
}

.learning-entry-list {
  width: 100%;
  display: grid;
  gap: 8px;
}

.learning-entry {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: flex-start;
}

.employee-memory-panel {
  display: grid;
  gap: 12px;
}

.memory-meta {
  display: grid;
  gap: 4px;
  color: $text-secondary;
  font-size: 12px;

  strong {
    color: $text-primary;
    font-size: 14px;
  }

  span {
    word-break: break-all;
  }
}

.memory-readonly {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  color: $text-primary;
}

.error-box {
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(var(--error-rgb), 0.4);
  color: $error;
  background: rgba(var(--error-rgb), 0.08);
  border-radius: $radius-sm;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-row {
  width: min(82%, 720px);
  padding: 12px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card-hover;

  &.customer {
    align-self: flex-end;
    border-left: 3px solid var(--accent-info);
    border-right: 3px solid var(--accent-info);
    border-left-width: 1px;
  }

  &.employee {
    align-self: flex-start;
    border-left: 3px solid $success;
  }

  &.system {
    align-self: center;
    width: 100%;
    border-left: 3px solid $warning;
  }
}

.message-meta {
  color: $text-muted;
  font-size: 12px;
  margin-bottom: 6px;
}

.message-content {
  white-space: pre-wrap;
  color: $text-primary;
}

.turn-score-panel {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid $border-light;
}

.turn-score-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.message-error {
  margin-top: 8px;
  color: $error;
  font-size: 12px;
}

.trace-stack {
  width: min(82%, 720px);
  align-self: flex-start;
  display: grid;
  gap: 6px;
  margin-top: -4px;
  margin-left: 18px;
}

.trace-row {
  padding: 8px 10px;
  border: 1px dashed $border-color;
  border-radius: $radius-sm;
  background: $bg-secondary;
  color: $text-secondary;
  font-size: 12px;

  &.failed {
    border-color: rgba(var(--error-rgb), 0.45);
    color: $error;
  }

  &.warning {
    border-color: rgba(var(--warning-rgb), 0.45);
  }
}

.trace-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: $text-primary;
}

.trace-detail {
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.profile-panel {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-card-hover;

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 4px;
    color: $text-secondary;
    font-size: 12px;
  }
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  min-width: 220px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

@media (max-width: $breakpoint-mobile) {
  .yoolee-header,
  .section-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .run-layout,
  .evaluation-layout,
  .metric-grid,
  .dashboard-grid,
  .detail-grid,
  .trace-summary-grid,
  .engine-grid,
  .prompt-preview-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .filter-select {
    width: 100%;
  }
}
</style>
