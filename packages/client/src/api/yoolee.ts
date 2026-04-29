import { request } from './client'

export type YooleeStatus = 'active' | 'inactive'
export type EvaluationStatus = 'running' | 'completed' | 'failed'

export interface YooleeEmployee {
  id: string
  name: string
  role: string
  goal: string
  system_prompt: string
  provider: string
  model: string
  profile: string
  profile_strategy: 'manual' | 'dedicated'
  profile_name: string
  memory_mode: 'training_writable' | 'readonly'
  profile_created_at: number | null
  skills: string[]
  knowledge_docs: KnowledgeDoc[]
  status: YooleeStatus
  created_at: number
  updated_at: number
}

export interface KnowledgeDoc {
  id: string
  name: string
  path: string
  size: number
  uploaded_at: number
}

export interface YooleeCustomer {
  id: string
  name: string
  industry: string
  need: string
  budget: string
  concerns: string
  stage: string
  communication_style: string
  opening_message: string
  status: YooleeStatus
  created_at: number
  updated_at: number
}

export interface EvaluationMessage {
  round: number
  speaker: 'employee' | 'customer' | 'system'
  content: string
  created_at: number
  error?: string
}

export interface EvaluationTraceEvent {
  id: string
  evaluation_id: string
  round: number
  type: string
  display_type?: string
  scope?: string
  resource_name?: string
  resource_path?: string
  is_employee_knowledge?: boolean
  allowed?: boolean
  blocked?: boolean
  resource_kind?: 'knowledge_md' | 'skill_file' | 'memory_file' | 'local_file' | 'tool' | 'session'
  dedupe_key?: string
  display_summary?: string
  risk_level?: 'none' | 'low' | 'medium' | 'high'
  title: string
  detail: string
  status: 'running' | 'completed' | 'failed' | 'warning' | 'info'
  created_at: number
  raw_event?: unknown
}

export interface LearningMemoryEntry {
  id: string
  type: string
  content: string
  selected: boolean
}

export interface LearningSuggestion {
  id: string
  evaluation_id: string
  summary: string
  score_reasoning: string
  memory_entries: LearningMemoryEntry[]
  risk: string
  status: 'draft' | 'approved' | 'written' | 'discarded'
  target_profile: string
  written_block: string
  written_at: number | null
  created_at: number
  updated_at: number
}

export interface YooleeTurnScore {
  id: string
  evaluation_id: string
  round: number
  auto_score: 0 | 1 | null
  auto_analysis: string
  auto_reason: string
  violated_rubric: string
  auto_error: string
  manual_score: 0 | 1 | null
  manual_note: string
  created_at: number
  updated_at: number
}

export interface YooleeEvaluation {
  id: string
  employee_id: string
  customer_id: string
  employee_name: string
  customer_name: string
  max_rounds: number
  context: string
  stop_keywords: string[]
  status: EvaluationStatus
  stage?: string
  failure_type?: string
  failure_action?: string
  messages: EvaluationMessage[]
  token_usage: string
  employee_session_id: string
  employee_profile: string
  runtime_profile: string
  capability_boundary_status: 'clean' | 'warning' | 'polluted'
  boundary_warnings: string[]
  memory_mode: 'training_writable' | 'readonly'
  learning_status: 'none' | 'draft' | 'written' | 'discarded'
  auto_score_status: 'none' | 'queued' | 'running' | 'completed' | 'failed'
  auto_score: number | null
  auto_score_pass_count: number
  auto_score_total: number
  auto_score_error_count: number
  auto_score_summary: string
  duration_ms: number
  manual_score: number | null
  manual_note: string
  conclusion: string
  error: string
  created_at: number
  updated_at: number
}

export interface YooleeDashboardSummary {
  stats: {
    employees: number
    active_employees: number
    customers: number
    active_customers: number
    running_evaluations: number
    failed_evaluations: number
    pending_scores: number
    pending_learning: number
  }
  recent_evaluations: YooleeEvaluation[]
  exceptions: YooleeEvaluation[]
  learning_queue: Array<{ evaluation: YooleeEvaluation; learning_suggestion: LearningSuggestion | null }>
}

export interface YooleeDataSummary {
  total_evaluations: number
  completed_evaluations: number
  failed_evaluations: number
  running_evaluations: number
  success_rate: number
  average_rounds: number
  average_duration_ms: number
  failure_reasons: Array<{ type: string; count: number }>
  employee_trends: Array<{ employee_id: string; employee_name: string; total: number; completed: number; failed: number; average_score: number | null }>
  skill_usage: Array<{ name: string; count: number }>
  knowledge_usage: Array<{ name: string; count: number }>
  learning_writes: number
}

export interface EmployeeMemoryData {
  profile: string
  memory: string
  memory_path: string
  memory_mtime: number | null
  learning_records: Array<{ evaluation: YooleeEvaluation; learning_suggestion: LearningSuggestion }>
}

export interface CapabilityRoundSummary {
  round: number
  bound_skills: string[]
  unbound_skills: string[]
  employee_knowledge: string[]
  external_files: string[]
  memory_events: number
  tool_count: number
  duplicate_count: number
  blocked_count: number
}

export interface CapabilitySummary {
  evaluation_id: string
  status: 'clean' | 'warning' | 'polluted'
  warnings: string[]
  rounds: CapabilityRoundSummary[]
}

export async function fetchDashboardSummary() {
  return request<YooleeDashboardSummary>('/api/yoolee/dashboard')
}

export async function fetchDataSummary() {
  return request<YooleeDataSummary>('/api/yoolee/data/summary')
}

export interface YooleePromptSettings {
  employee_prompt_template: string
  customer_prompt_template: string
  learning_prompt_template: string
  auto_score_prompt_template: string
  updated_at: number
}

export async function fetchPromptSettings() {
  return request<{ settings: YooleePromptSettings; defaults: YooleePromptSettings }>('/api/yoolee/prompt-settings')
}

export async function savePromptSettings(input: Partial<YooleePromptSettings>) {
  return request<{ settings: YooleePromptSettings; defaults: YooleePromptSettings }>('/api/yoolee/prompt-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function resetPromptSettings() {
  return request<{ settings: YooleePromptSettings; defaults: YooleePromptSettings }>('/api/yoolee/prompt-settings/reset', {
    method: 'POST',
  })
}

export async function fetchEmployees() {
  const res = await request<{ employees: YooleeEmployee[] }>('/api/yoolee/employees')
  return res.employees
}

export async function saveEmployee(employee: Partial<YooleeEmployee>) {
  const res = await request<{ employee: YooleeEmployee }>(
    employee.id ? `/api/yoolee/employees/${employee.id}` : '/api/yoolee/employees',
    {
      method: employee.id ? 'PUT' : 'POST',
      body: JSON.stringify(employee),
    },
  )
  return res.employee
}

export async function createEmployeeProfile(id: string, baseProfile?: string) {
  const res = await request<{ employee: YooleeEmployee }>(`/api/yoolee/employees/${id}/profile`, {
    method: 'POST',
    body: JSON.stringify({ base_profile: baseProfile }),
  })
  return res.employee
}

export async function fetchEmployeeMemory(id: string) {
  return request<EmployeeMemoryData>(`/api/yoolee/employees/${id}/memory`)
}

export async function removeEmployee(id: string) {
  await request(`/api/yoolee/employees/${id}`, { method: 'DELETE' })
}

export async function uploadEmployeeKnowledge(employeeId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const res = await request<{ employee: YooleeEmployee }>(`/api/yoolee/employees/${employeeId}/knowledge`, {
    method: 'POST',
    body: formData,
  })
  return res.employee
}

export async function removeEmployeeKnowledge(employeeId: string, docId: string) {
  const res = await request<{ employee: YooleeEmployee }>(`/api/yoolee/employees/${employeeId}/knowledge/${docId}`, {
    method: 'DELETE',
  })
  return res.employee
}

export async function fetchCustomers() {
  const res = await request<{ customers: YooleeCustomer[] }>('/api/yoolee/customers')
  return res.customers
}

export async function saveCustomer(customer: Partial<YooleeCustomer>) {
  const res = await request<{ customer: YooleeCustomer }>(
    customer.id ? `/api/yoolee/customers/${customer.id}` : '/api/yoolee/customers',
    {
      method: customer.id ? 'PUT' : 'POST',
      body: JSON.stringify(customer),
    },
  )
  return res.customer
}

export async function removeCustomer(id: string) {
  await request(`/api/yoolee/customers/${id}`, { method: 'DELETE' })
}

export async function fetchEvaluations(filters: { employee_id?: string; customer_id?: string; status?: string } = {}) {
  const params = new URLSearchParams()
  if (filters.employee_id) params.set('employee_id', filters.employee_id)
  if (filters.customer_id) params.set('customer_id', filters.customer_id)
  if (filters.status) params.set('status', filters.status)
  const res = await request<{ evaluations: YooleeEvaluation[] }>(`/api/yoolee/evaluations${params.toString() ? `?${params}` : ''}`)
  return res.evaluations
}

export async function fetchEvaluation(id: string) {
  return request<{
    evaluation: YooleeEvaluation
    trace_events: EvaluationTraceEvent[]
    turn_scores: YooleeTurnScore[]
    learning_suggestion: LearningSuggestion | null
  }>(`/api/yoolee/evaluations/${id}`)
}

export async function fetchEvaluationTrace(id: string) {
  const res = await request<{ trace_events: EvaluationTraceEvent[] }>(`/api/yoolee/evaluations/${id}/trace`)
  return res.trace_events
}

export async function fetchEvaluationCapabilitySummary(id: string) {
  const res = await request<{ capability_summary: CapabilitySummary }>(`/api/yoolee/evaluations/${id}/capability-summary`)
  return res.capability_summary
}

export async function fetchEvaluationAutoScore(id: string) {
  return request<{ evaluation: YooleeEvaluation; turn_scores: YooleeTurnScore[] }>(`/api/yoolee/evaluations/${id}/auto-score`)
}

export async function rerunEvaluationAutoScore(id: string) {
  return request<{ evaluation: YooleeEvaluation; turn_scores: YooleeTurnScore[] }>(`/api/yoolee/evaluations/${id}/auto-score`, {
    method: 'POST',
  })
}

export async function saveTurnScore(id: string, round: number, input: {
  manual_score: 0 | 1 | null
  manual_note: string
}) {
  return request<{ evaluation: YooleeEvaluation; turn_score: YooleeTurnScore; turn_scores: YooleeTurnScore[] }>(`/api/yoolee/evaluations/${id}/turn-scores/${round}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function runEvaluation(input: {
  employee_id: string
  customer_id: string
  max_rounds: number
  context?: string
  memory_mode?: 'training_writable' | 'readonly'
  stop_keywords: string[]
}) {
  const res = await request<{ evaluation: YooleeEvaluation }>('/api/yoolee/evaluations/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.evaluation
}

export async function scoreEvaluation(id: string, input: {
  manual_score: number | null
  manual_note: string
  conclusion: string
}) {
  const res = await request<{ evaluation: YooleeEvaluation }>(`/api/yoolee/evaluations/${id}/score`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return res.evaluation
}

export async function generateLearningSuggestion(id: string) {
  return request<{ learning_suggestion: LearningSuggestion; raw?: string }>(`/api/yoolee/evaluations/${id}/learning-suggestion`, {
    method: 'POST',
  })
}

export async function commitLearningSuggestion(id: string, input: Partial<LearningSuggestion>) {
  return request<{ learning_suggestion: LearningSuggestion; evaluation: YooleeEvaluation }>(`/api/yoolee/evaluations/${id}/learning-suggestion/commit`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function revertLearningSuggestion(id: string) {
  return request<{ learning_suggestion: LearningSuggestion; evaluation: YooleeEvaluation }>(`/api/yoolee/evaluations/${id}/learning-suggestion/revert`, {
    method: 'POST',
  })
}
