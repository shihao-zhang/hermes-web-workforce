import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { appendFile, copyFile, mkdir, readFile, rm, unlink, writeFile } from 'fs/promises'
import { basename, extname, join, relative, resolve } from 'path'
import { homedir } from 'os'
import { HERMES_BASE, profileDirExists, resolveProfileDir } from '../hermes/hermes-profile'

const DB_DIR = resolve(homedir(), '.hermes-web-ui')
const DB_PATH = resolve(DB_DIR, 'yoolee.db')
const KNOWLEDGE_ROOT = resolve(DB_DIR, 'yoolee', 'knowledge')

let db: DatabaseSync | null = null

export type Status = 'active' | 'inactive'
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
  status: Status
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
  status: Status
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

export type AutoScoreStatus = 'none' | 'queued' | 'running' | 'completed' | 'failed'

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
  auto_score_status: AutoScoreStatus
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

export interface YooleePromptSettings {
  employee_prompt_template: string
  customer_prompt_template: string
  learning_prompt_template: string
  auto_score_prompt_template: string
  updated_at: number
}

export interface EvaluationFilters {
  employee_id?: string
  customer_id?: string
  status?: string
}

export const DEFAULT_EMPLOYEE_PROMPT_TEMPLATE = [
  '你是 Yoolee 数字员工测评中的 AI员工，请只输出你对客户说的一段话，不要输出分析、标题或 Markdown。',
  '',
  '员工名称：{{employee_name}}',
  '岗位：{{employee_role}}',
  '业务目标：{{employee_goal}}',
  '绑定技能：{{employee_skills}}',
  '',
  '员工知识库：',
  '{{employee_knowledge}}',
  '',
  '员工系统提示词：',
  '{{employee_system_prompt}}',
  '',
  '客户画像：',
  '{{customer_profile}}',
  '',
  '当前轮次：{{round}}',
  '历史对话：',
  '{{transcript}}',
].join('\n')

export const DEFAULT_CUSTOMER_PROMPT_TEMPLATE = [
  '你是 Yoolee 数字员工测评中的 AI客户，请严格扮演客户，只输出你对销售/服务人员说的一段话，不要输出分析、标题或 Markdown。',
  '',
  '客户画像：',
  '{{customer_profile}}',
  '',
  '你正在与岗位为「{{employee_role}}」的 AI员工「{{employee_name}}」沟通。',
  '请根据你的需求、预算、顾虑、购买阶段和沟通风格自然回应。',
  '如果对方已经解决你的关键顾虑，可以表达“成交”或“再联系”；如果明显不合适，可以表达“不考虑”或“预算不够”。',
  '',
  '当前轮次：{{round}}',
  '历史对话：',
  '{{transcript}}',
].join('\n')

export const DEFAULT_LEARNING_PROMPT_TEMPLATE = [
  '你是 Yoolee 数字员工测评的中立复盘教练。请基于测评记录和人工评分，生成可由人类确认后写入员工 MEMORY.md 的学习建议。',
  '不要替被测员工辩护，不要输出完整对话，不要写入 SOUL.md 级别人格设定。只提炼可复用、可执行、低污染的经验。',
  '请严格输出 JSON，不要 Markdown，不要代码块。',
  '',
  'JSON schema:',
  '{"summary":"string","score_reasoning":"string","memory_entries":[{"id":"string","type":"success_pattern|avoidance|improvement","content":"string","selected":true}],"risk":"string"}',
  '',
  '员工：{{employee_name}}',
  '岗位：{{employee_role}}',
  '业务目标：{{employee_goal}}',
  '客户：{{customer_name}}',
  '客户画像：{{customer_profile}}',
  '人工评分：{{manual_score}}',
  '人工结论：{{manual_conclusion}}',
  '人工备注：{{manual_note}}',
  '自动评分：{{auto_score_review}}',
  '',
  '能力轨迹：',
  '{{trace_events}}',
  '',
  '对话记录：',
  '{{transcript}}',
].join('\n')

export const DEFAULT_AUTO_SCORE_PROMPT_TEMPLATE = [
  '# Role',
  'role: 资深业务质检专家 (Senior Business Auditor)',
  'goal: 模拟“结果导向”的人工质检逻辑，审核 AI员工的当前回复是否符合高标准业务规范。',
  'core_philosophy: High Signal-to-Noise Ratio（高信噪比）。严格执行以下 5 条核心标准。',
  '',
  '# Task',
  'primary_task: 依据 [Metadata]（业务约束）、[Dialog_History]（上下文）和 [User_Query]（当前客户意图），判定 [actual_output] 是否合格。不要对 dialog_history 中的历史回复作判定，只评价 actual_output。',
  'output: 严格 JSON，包含 `score` (0/1), `analysis` (逻辑推演，不超过80字), `reason` (简短结论，不超过20字), `violated_rubric` (未违反则为空字符串)。不要输出 Markdown 或代码块。',
  '',
  '# Input Data',
  'type: Business Constraints',
  'data: {{metadata}}',
  '',
  'type: Conversation Context',
  'data: {{dialog_history}}',
  '',
  'type: User Current Input',
  'data: {{user_query}}',
  '',
  'type: Assistant Response',
  'data: {{actual_output}}',
  '',
  '# Evaluation Rubrics',
  '请严格依据以下 5 条原则进行判定。违反任意一条原则的核心精神，即视为 Fail (0分)。',
  '',
  '<Rubrics_Block>',
  '1. **[零重复]**: 除确认复杂条款外，不需要客户反复回答同一个需求。若当前回复仅重复询问 metadata 或历史中已明确的信息，判 Fail。',
  '2. **[正面解决]**: 对客户提出的关键问题给出正面、直接回复，提供的回答可以处理客户疑虑，并且没有过度展开。用户处于挑选/比较阶段时，不得未展示选项就转人工。',
  '3. **[逻辑闭环]**: 提供的信息没有关键事实性错误，不承诺无法履行的服务，不存在阻碍业务推进的逻辑硬伤。价格、酒店、机票等具体实时信息不作为事实性校验对象，除非与上下文显著冲突。',
  '4. **[销售推进]**: 通过提问使客户需求从模糊变清晰，或完成销售关键确认动作。客户提出模糊需求或现方案有问题时，应主动给方案，而不是只问“要不要我帮您找/推荐”。',
  '5. **[职业素养]**: 沟通过程中没有没必要的评价、批评、过度赞美或废话。沟通情绪稳定、专业冷静。',
  '</Rubrics_Block>',
  '',
  '# Scoring Output',
  '- Score 0: 违反上述任意一条。',
  '- Score 1: 同时满足所有标准。',
].join('\n')

function now() {
  return Date.now()
}

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some(row => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function getDb(): DatabaseSync {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true })
    db = new DatabaseSync(DB_PATH)
    db.exec('PRAGMA journal_mode=WAL')
    db.exec('PRAGMA foreign_keys=ON')
    db.exec(`
      CREATE TABLE IF NOT EXISTS yoolee_employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        goal TEXT DEFAULT '',
        system_prompt TEXT DEFAULT '',
        provider TEXT DEFAULT '',
        model TEXT DEFAULT '',
        profile TEXT DEFAULT 'default',
        profile_strategy TEXT DEFAULT 'manual',
        profile_name TEXT DEFAULT '',
        memory_mode TEXT DEFAULT 'training_writable',
        profile_created_at INTEGER,
        skills TEXT DEFAULT '[]',
        knowledge_docs TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS yoolee_customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        industry TEXT DEFAULT '',
        need TEXT DEFAULT '',
        budget TEXT DEFAULT '',
        concerns TEXT DEFAULT '',
        stage TEXT DEFAULT '',
        communication_style TEXT DEFAULT '',
        opening_message TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS yoolee_evaluations (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        max_rounds INTEGER NOT NULL,
        context TEXT DEFAULT '',
        stop_keywords TEXT DEFAULT '[]',
        status TEXT NOT NULL,
        messages TEXT DEFAULT '[]',
        token_usage TEXT DEFAULT '',
        employee_session_id TEXT DEFAULT '',
        employee_profile TEXT DEFAULT '',
        runtime_profile TEXT DEFAULT '',
        capability_boundary_status TEXT DEFAULT 'clean',
        boundary_warnings TEXT DEFAULT '[]',
        memory_mode TEXT DEFAULT 'training_writable',
        learning_status TEXT DEFAULT 'none',
        auto_score_status TEXT DEFAULT 'none',
        auto_score REAL,
        auto_score_pass_count INTEGER DEFAULT 0,
        auto_score_total INTEGER DEFAULT 0,
        auto_score_error_count INTEGER DEFAULT 0,
        auto_score_summary TEXT DEFAULT '',
        duration_ms INTEGER DEFAULT 0,
        manual_score REAL,
        manual_note TEXT DEFAULT '',
        conclusion TEXT DEFAULT '',
        error TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_yoolee_evaluations_created
        ON yoolee_evaluations(created_at DESC);

      CREATE TABLE IF NOT EXISTS yoolee_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS yoolee_trace_events (
        id TEXT PRIMARY KEY,
        evaluation_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT DEFAULT 'info',
        raw_event TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_yoolee_trace_events_eval
        ON yoolee_trace_events(evaluation_id, created_at);

      CREATE TABLE IF NOT EXISTS yoolee_learning_suggestions (
        id TEXT PRIMARY KEY,
        evaluation_id TEXT NOT NULL,
        summary TEXT DEFAULT '',
        score_reasoning TEXT DEFAULT '',
        memory_entries TEXT DEFAULT '[]',
        risk TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        target_profile TEXT DEFAULT '',
        written_block TEXT DEFAULT '',
        written_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_yoolee_learning_eval
        ON yoolee_learning_suggestions(evaluation_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS yoolee_turn_scores (
        id TEXT PRIMARY KEY,
        evaluation_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        auto_score INTEGER,
        auto_analysis TEXT DEFAULT '',
        auto_reason TEXT DEFAULT '',
        violated_rubric TEXT DEFAULT '',
        auto_error TEXT DEFAULT '',
        manual_score INTEGER,
        manual_note TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(evaluation_id, round)
      );

      CREATE INDEX IF NOT EXISTS idx_yoolee_turn_scores_eval
        ON yoolee_turn_scores(evaluation_id, round);
    `)
    ensureColumn(db, 'yoolee_employees', 'profile_strategy', "TEXT DEFAULT 'manual'")
    ensureColumn(db, 'yoolee_employees', 'profile_name', "TEXT DEFAULT ''")
    ensureColumn(db, 'yoolee_employees', 'memory_mode', "TEXT DEFAULT 'training_writable'")
    ensureColumn(db, 'yoolee_employees', 'profile_created_at', 'INTEGER')
    ensureColumn(db, 'yoolee_employees', 'knowledge_docs', "TEXT DEFAULT '[]'")
    ensureColumn(db, 'yoolee_evaluations', 'context', "TEXT DEFAULT ''")
    ensureColumn(db, 'yoolee_evaluations', 'employee_session_id', "TEXT DEFAULT ''")
    ensureColumn(db, 'yoolee_evaluations', 'employee_profile', "TEXT DEFAULT ''")
    ensureColumn(db, 'yoolee_evaluations', 'runtime_profile', "TEXT DEFAULT ''")
    ensureColumn(db, 'yoolee_evaluations', 'capability_boundary_status', "TEXT DEFAULT 'clean'")
    ensureColumn(db, 'yoolee_evaluations', 'boundary_warnings', "TEXT DEFAULT '[]'")
    ensureColumn(db, 'yoolee_evaluations', 'memory_mode', "TEXT DEFAULT 'training_writable'")
    ensureColumn(db, 'yoolee_evaluations', 'learning_status', "TEXT DEFAULT 'none'")
    ensureColumn(db, 'yoolee_evaluations', 'auto_score_status', "TEXT DEFAULT 'none'")
    ensureColumn(db, 'yoolee_evaluations', 'auto_score', 'REAL')
    ensureColumn(db, 'yoolee_evaluations', 'auto_score_pass_count', 'INTEGER DEFAULT 0')
    ensureColumn(db, 'yoolee_evaluations', 'auto_score_total', 'INTEGER DEFAULT 0')
    ensureColumn(db, 'yoolee_evaluations', 'auto_score_error_count', 'INTEGER DEFAULT 0')
    ensureColumn(db, 'yoolee_evaluations', 'auto_score_summary', "TEXT DEFAULT ''")
  }
  return db
}

function employeeFromRow(row: any): YooleeEmployee {
  return {
    ...row,
    skills: parseJson<string[]>(row.skills, []),
    knowledge_docs: parseJson<KnowledgeDoc[]>(row.knowledge_docs, []),
    profile_strategy: row.profile_strategy === 'dedicated' ? 'dedicated' : 'manual',
    profile_name: String(row.profile_name || row.profile || 'default'),
    memory_mode: row.memory_mode === 'readonly' ? 'readonly' : 'training_writable',
    profile_created_at: row.profile_created_at == null ? null : Number(row.profile_created_at),
  }
}

function customerFromRow(row: any): YooleeCustomer {
  return row
}

function evaluationFromRow(row: any): YooleeEvaluation {
  const evaluation: YooleeEvaluation = {
    ...row,
    context: String(row.context || ''),
    stop_keywords: parseJson<string[]>(row.stop_keywords, []),
    messages: parseJson<EvaluationMessage[]>(row.messages, []),
    manual_score: row.manual_score === null || row.manual_score === undefined ? null : Number(row.manual_score),
    employee_session_id: String(row.employee_session_id || ''),
    employee_profile: String(row.employee_profile || ''),
    runtime_profile: String(row.runtime_profile || ''),
    capability_boundary_status: ['warning', 'polluted'].includes(row.capability_boundary_status) ? row.capability_boundary_status : 'clean',
    boundary_warnings: parseJson<string[]>(row.boundary_warnings, []),
    memory_mode: row.memory_mode === 'readonly' ? 'readonly' : 'training_writable',
    learning_status: ['draft', 'written', 'discarded'].includes(row.learning_status) ? row.learning_status : 'none',
    auto_score_status: ['queued', 'running', 'completed', 'failed'].includes(row.auto_score_status) ? row.auto_score_status : 'none',
    auto_score: row.auto_score === null || row.auto_score === undefined ? null : Number(row.auto_score),
    auto_score_pass_count: Number(row.auto_score_pass_count || 0),
    auto_score_total: Number(row.auto_score_total || 0),
    auto_score_error_count: Number(row.auto_score_error_count || 0),
    auto_score_summary: String(row.auto_score_summary || ''),
  }
  return enrichEvaluationStatus(evaluation)
}

function turnScoreFromRow(row: any): YooleeTurnScore {
  const normalizeBinaryScore = (value: unknown): 0 | 1 | null => {
    if (value === null || value === undefined || value === '') return null
    return Number(value) === 1 ? 1 : 0
  }
  return {
    id: row.id,
    evaluation_id: row.evaluation_id,
    round: Number(row.round || 0),
    auto_score: normalizeBinaryScore(row.auto_score),
    auto_analysis: String(row.auto_analysis || ''),
    auto_reason: String(row.auto_reason || ''),
    violated_rubric: String(row.violated_rubric || ''),
    auto_error: String(row.auto_error || ''),
    manual_score: normalizeBinaryScore(row.manual_score),
    manual_note: String(row.manual_note || ''),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
  }
}

function enrichEvaluationStatus(evaluation: YooleeEvaluation): YooleeEvaluation {
  if (evaluation.status === 'completed') {
    return { ...evaluation, stage: '已完成', failure_type: '', failure_action: '' }
  }
  if (evaluation.status === 'running') {
    const last = evaluation.messages[evaluation.messages.length - 1]
    const stage = last?.speaker === 'employee'
      ? '客户回合'
      : last?.speaker === 'customer'
        ? '员工回合'
        : evaluation.employee_session_id ? '启动员工 Session' : '排队中'
    return { ...evaluation, stage, failure_type: '', failure_action: '等待当前测评完成' }
  }
  const error = evaluation.error || ''
  let failureType = '模型调用失败'
  let action = '查看原始日志'
  if (/ENOENT|not found|Hermes CLI was not found|HERMES_BIN/i.test(error)) {
    failureType = 'Hermes CLI 未找到'
    action = '检查 HERMES_BIN 或服务启动 PATH 后重试'
  } else if (/Gateway health check timed out|timeout|timed out/i.test(error)) {
    failureType = 'Gateway 超时'
    action = '检查 Gateway 后重试测评'
  } else if (/customer/i.test(error)) {
    failureType = '客户侧失败'
    action = '检查客户画像或模型配置'
  } else if (/tool/i.test(error)) {
    failureType = '工具调用失败'
    action = '查看能力轨迹和原始日志'
  } else if (/parse|trace/i.test(error)) {
    failureType = '能力轨迹解析失败'
    action = '查看原始 trace'
  }
  return { ...evaluation, stage: '失败', failure_type: failureType, failure_action: action }
}

export function listEmployees(): YooleeEmployee[] {
  return getDb().prepare('SELECT * FROM yoolee_employees ORDER BY updated_at DESC').all().map(employeeFromRow)
}

export function getEmployee(employeeId: string): YooleeEmployee | null {
  const row = getDb().prepare('SELECT * FROM yoolee_employees WHERE id = ?').get(employeeId)
  return row ? employeeFromRow(row) : null
}

export function saveEmployee(input: Partial<YooleeEmployee>): YooleeEmployee {
  const db = getDb()
  const timestamp = now()
  const employee: YooleeEmployee = {
    id: input.id || id('emp'),
    name: String(input.name || '').trim(),
    role: String(input.role || ''),
    goal: String(input.goal || ''),
    system_prompt: String(input.system_prompt || ''),
    provider: String(input.provider || ''),
    model: String(input.model || ''),
    profile: String(input.profile || input.profile_name || 'default'),
    profile_strategy: input.profile_strategy === 'dedicated' ? 'dedicated' : 'manual',
    profile_name: input.profile_strategy === 'dedicated'
      ? String(input.profile_name || input.profile || 'default')
      : String(input.profile || input.profile_name || 'default'),
    memory_mode: input.memory_mode === 'readonly' ? 'readonly' : 'training_writable',
    profile_created_at: input.profile_created_at ?? null,
    skills: Array.isArray(input.skills) ? input.skills.map(String) : [],
    knowledge_docs: Array.isArray(input.knowledge_docs) ? normalizeKnowledgeDocs(input.knowledge_docs) : [],
    status: input.status === 'inactive' ? 'inactive' : 'active',
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  }
  db.prepare(`
    INSERT INTO yoolee_employees
      (id, name, role, goal, system_prompt, provider, model, profile, profile_strategy, profile_name, memory_mode, profile_created_at, skills, knowledge_docs, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      goal = excluded.goal,
      system_prompt = excluded.system_prompt,
      provider = excluded.provider,
      model = excluded.model,
      profile = excluded.profile,
      profile_strategy = excluded.profile_strategy,
      profile_name = excluded.profile_name,
      memory_mode = excluded.memory_mode,
      profile_created_at = excluded.profile_created_at,
      skills = excluded.skills,
      knowledge_docs = excluded.knowledge_docs,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    employee.id,
    employee.name,
    employee.role,
    employee.goal,
    employee.system_prompt,
    employee.provider,
    employee.model,
    employee.profile,
    employee.profile_strategy,
    employee.profile_name,
    employee.memory_mode,
    employee.profile_created_at,
    JSON.stringify(employee.skills),
    JSON.stringify(employee.knowledge_docs),
    employee.status,
    employee.created_at,
    employee.updated_at,
  )
  return employee
}

export function deleteEmployee(employeeId: string): boolean {
  const result = getDb().prepare('DELETE FROM yoolee_employees WHERE id = ?').run(employeeId)
  return result.changes > 0
}

export function listCustomers(): YooleeCustomer[] {
  return getDb().prepare('SELECT * FROM yoolee_customers ORDER BY updated_at DESC').all().map(customerFromRow)
}

export function getCustomer(customerId: string): YooleeCustomer | null {
  const row = getDb().prepare('SELECT * FROM yoolee_customers WHERE id = ?').get(customerId)
  return row ? customerFromRow(row) : null
}

export function saveCustomer(input: Partial<YooleeCustomer>): YooleeCustomer {
  const db = getDb()
  const timestamp = now()
  const customer: YooleeCustomer = {
    id: input.id || id('cus'),
    name: String(input.name || '').trim(),
    industry: String(input.industry || ''),
    need: String(input.need || ''),
    budget: String(input.budget || ''),
    concerns: String(input.concerns || ''),
    stage: String(input.stage || ''),
    communication_style: String(input.communication_style || ''),
    opening_message: String(input.opening_message || ''),
    status: input.status === 'inactive' ? 'inactive' : 'active',
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  }
  db.prepare(`
    INSERT INTO yoolee_customers
      (id, name, industry, need, budget, concerns, stage, communication_style, opening_message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      industry = excluded.industry,
      need = excluded.need,
      budget = excluded.budget,
      concerns = excluded.concerns,
      stage = excluded.stage,
      communication_style = excluded.communication_style,
      opening_message = excluded.opening_message,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    customer.id,
    customer.name,
    customer.industry,
    customer.need,
    customer.budget,
    customer.concerns,
    customer.stage,
    customer.communication_style,
    customer.opening_message,
    customer.status,
    customer.created_at,
    customer.updated_at,
  )
  return customer
}

export function deleteCustomer(customerId: string): boolean {
  const result = getDb().prepare('DELETE FROM yoolee_customers WHERE id = ?').run(customerId)
  return result.changes > 0
}

export function createEvaluation(input: {
  employee: YooleeEmployee
  customer: YooleeCustomer
  max_rounds: number
  context?: string
  stop_keywords: string[]
  employee_session_id?: string
  memory_mode?: 'training_writable' | 'readonly'
}): YooleeEvaluation {
  const timestamp = now()
  const evaluation: YooleeEvaluation = {
    id: id('eval'),
    employee_id: input.employee.id,
    customer_id: input.customer.id,
    employee_name: input.employee.name,
    customer_name: input.customer.name,
    max_rounds: input.max_rounds,
    context: String(input.context || ''),
    stop_keywords: input.stop_keywords,
    status: 'running',
    messages: [],
    token_usage: '',
    employee_session_id: String(input.employee_session_id || ''),
    employee_profile: input.employee.profile_name || input.employee.profile || 'default',
    runtime_profile: '',
    capability_boundary_status: 'clean',
    boundary_warnings: [],
    memory_mode: input.memory_mode === 'readonly' ? 'readonly' : (input.employee.memory_mode || 'training_writable'),
    learning_status: 'none',
    auto_score_status: 'none',
    auto_score: null,
    auto_score_pass_count: 0,
    auto_score_total: 0,
    auto_score_error_count: 0,
    auto_score_summary: '',
    duration_ms: 0,
    manual_score: null,
    manual_note: '',
    conclusion: '',
    error: '',
    created_at: timestamp,
    updated_at: timestamp,
  }
  getDb().prepare(`
    INSERT INTO yoolee_evaluations
      (id, employee_id, customer_id, employee_name, customer_name, max_rounds, context, stop_keywords, status, messages, token_usage, employee_session_id, employee_profile, runtime_profile, capability_boundary_status, boundary_warnings, memory_mode, learning_status, auto_score_status, auto_score, auto_score_pass_count, auto_score_total, auto_score_error_count, auto_score_summary, duration_ms, manual_score, manual_note, conclusion, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evaluation.id,
    evaluation.employee_id,
    evaluation.customer_id,
    evaluation.employee_name,
    evaluation.customer_name,
    evaluation.max_rounds,
    evaluation.context,
    JSON.stringify(evaluation.stop_keywords),
    evaluation.status,
    JSON.stringify(evaluation.messages),
    evaluation.token_usage,
    evaluation.employee_session_id,
    evaluation.employee_profile,
    evaluation.runtime_profile,
    evaluation.capability_boundary_status,
    JSON.stringify(evaluation.boundary_warnings),
    evaluation.memory_mode,
    evaluation.learning_status,
    evaluation.auto_score_status,
    evaluation.auto_score,
    evaluation.auto_score_pass_count,
    evaluation.auto_score_total,
    evaluation.auto_score_error_count,
    evaluation.auto_score_summary,
    evaluation.duration_ms,
    evaluation.manual_score,
    evaluation.manual_note,
    evaluation.conclusion,
    evaluation.error,
    evaluation.created_at,
    evaluation.updated_at,
  )
  return evaluation
}

export function updateEvaluation(id: string, updates: Partial<YooleeEvaluation>): YooleeEvaluation | null {
  const existing = getEvaluation(id)
  if (!existing) return null
  const next: YooleeEvaluation = {
    ...existing,
    ...updates,
    updated_at: now(),
  }
  getDb().prepare(`
    UPDATE yoolee_evaluations SET
      status = ?,
      messages = ?,
      token_usage = ?,
      employee_session_id = ?,
      employee_profile = ?,
      runtime_profile = ?,
      capability_boundary_status = ?,
      boundary_warnings = ?,
      memory_mode = ?,
      learning_status = ?,
      auto_score_status = ?,
      auto_score = ?,
      auto_score_pass_count = ?,
      auto_score_total = ?,
      auto_score_error_count = ?,
      auto_score_summary = ?,
      duration_ms = ?,
      manual_score = ?,
      manual_note = ?,
      conclusion = ?,
      error = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    next.status,
    JSON.stringify(next.messages),
    next.token_usage,
    next.employee_session_id,
    next.employee_profile,
    next.runtime_profile,
    next.capability_boundary_status,
    JSON.stringify(next.boundary_warnings || []),
    next.memory_mode,
    next.learning_status,
    next.auto_score_status,
    next.auto_score,
    next.auto_score_pass_count,
    next.auto_score_total,
    next.auto_score_error_count,
    next.auto_score_summary,
    next.duration_ms,
    next.manual_score,
    next.manual_note,
    next.conclusion,
    next.error,
    next.updated_at,
    id,
  )
  return next
}

export function listEvaluations(filters: EvaluationFilters = {}): YooleeEvaluation[] {
  const where: string[] = []
  const params: string[] = []
  if (filters.employee_id) {
    where.push('employee_id = ?')
    params.push(filters.employee_id)
  }
  if (filters.customer_id) {
    where.push('customer_id = ?')
    params.push(filters.customer_id)
  }
  if (filters.status) {
    where.push('status = ?')
    params.push(filters.status)
  }
  const sql = `SELECT * FROM yoolee_evaluations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`
  return getDb().prepare(sql).all(...params).map(evaluationFromRow)
}

export function getEvaluation(evaluationId: string): YooleeEvaluation | null {
  const row = getDb().prepare('SELECT * FROM yoolee_evaluations WHERE id = ?').get(evaluationId)
  return row ? evaluationFromRow(row) : null
}

export function listTurnScores(evaluationId: string): YooleeTurnScore[] {
  return getDb()
    .prepare('SELECT * FROM yoolee_turn_scores WHERE evaluation_id = ? ORDER BY round ASC')
    .all(evaluationId)
    .map(turnScoreFromRow)
}

export function getTurnScore(evaluationId: string, round: number): YooleeTurnScore | null {
  const row = getDb()
    .prepare('SELECT * FROM yoolee_turn_scores WHERE evaluation_id = ? AND round = ?')
    .get(evaluationId, round)
  return row ? turnScoreFromRow(row) : null
}

export function saveTurnScore(input: Partial<YooleeTurnScore> & { evaluation_id: string; round: number }): YooleeTurnScore {
  const existing = getTurnScore(input.evaluation_id, input.round)
  const timestamp = now()
  const normalizeBinaryScore = (value: unknown): 0 | 1 | null => {
    if (value === null || value === undefined || value === '') return null
    return Number(value) === 1 ? 1 : 0
  }
  const turnScore: YooleeTurnScore = {
    id: input.id || existing?.id || id('turn_score'),
    evaluation_id: input.evaluation_id,
    round: input.round,
    auto_score: input.auto_score === undefined ? (existing?.auto_score ?? null) : normalizeBinaryScore(input.auto_score),
    auto_analysis: String(input.auto_analysis ?? existing?.auto_analysis ?? ''),
    auto_reason: String(input.auto_reason ?? existing?.auto_reason ?? ''),
    violated_rubric: String(input.violated_rubric ?? existing?.violated_rubric ?? ''),
    auto_error: String(input.auto_error ?? existing?.auto_error ?? ''),
    manual_score: input.manual_score === undefined ? (existing?.manual_score ?? null) : normalizeBinaryScore(input.manual_score),
    manual_note: String(input.manual_note ?? existing?.manual_note ?? ''),
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  }
  getDb().prepare(`
    INSERT INTO yoolee_turn_scores
      (id, evaluation_id, round, auto_score, auto_analysis, auto_reason, violated_rubric, auto_error, manual_score, manual_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(evaluation_id, round) DO UPDATE SET
      auto_score = excluded.auto_score,
      auto_analysis = excluded.auto_analysis,
      auto_reason = excluded.auto_reason,
      violated_rubric = excluded.violated_rubric,
      auto_error = excluded.auto_error,
      manual_score = excluded.manual_score,
      manual_note = excluded.manual_note,
      updated_at = excluded.updated_at
  `).run(
    turnScore.id,
    turnScore.evaluation_id,
    turnScore.round,
    turnScore.auto_score,
    turnScore.auto_analysis,
    turnScore.auto_reason,
    turnScore.violated_rubric,
    turnScore.auto_error,
    turnScore.manual_score,
    turnScore.manual_note,
    turnScore.created_at,
    turnScore.updated_at,
  )
  return turnScore
}

export function resetAutoTurnScores(evaluationId: string): void {
  const existing = listTurnScores(evaluationId)
  const timestamp = now()
  for (const score of existing) {
    getDb().prepare(`
      UPDATE yoolee_turn_scores SET
        auto_score = NULL,
        auto_analysis = '',
        auto_reason = '',
        violated_rubric = '',
        auto_error = '',
        updated_at = ?
      WHERE id = ?
    `).run(timestamp, score.id)
  }
}

export function addTraceEvent(input: Omit<EvaluationTraceEvent, 'id' | 'created_at'> & { id?: string; created_at?: number }): EvaluationTraceEvent {
  const event: EvaluationTraceEvent = {
    id: input.id || id('trace'),
    evaluation_id: input.evaluation_id,
    round: input.round,
    type: input.type,
    title: input.title,
    detail: input.detail || '',
    status: input.status || 'info',
    created_at: input.created_at || now(),
    raw_event: input.raw_event,
  }
  getDb().prepare(`
    INSERT INTO yoolee_trace_events
      (id, evaluation_id, round, type, title, detail, status, raw_event, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.evaluation_id,
    event.round,
    event.type,
    event.title,
    event.detail,
    event.status,
    event.raw_event ? JSON.stringify(event.raw_event) : '',
    event.created_at,
  )
  return event
}

export function listTraceEvents(evaluationId: string): EvaluationTraceEvent[] {
  const evaluation = getEvaluation(evaluationId)
  const employee = evaluation ? getEmployee(evaluation.employee_id) : null
  return getDb()
    .prepare('SELECT * FROM yoolee_trace_events WHERE evaluation_id = ? ORDER BY created_at ASC')
    .all(evaluationId)
    .map((row: any) => normalizeTraceEvent({
      id: row.id,
      evaluation_id: row.evaluation_id,
      round: Number(row.round || 0),
      type: row.type,
      title: row.title,
      detail: row.detail || '',
      status: row.status || 'info',
      raw_event: parseJson(row.raw_event, undefined),
      created_at: Number(row.created_at || 0),
    }, employee))
}

function normalizeTraceEvent(event: EvaluationTraceEvent, employee: YooleeEmployee | null): EvaluationTraceEvent {
  const raw = event.raw_event as any
  const detail = [
    event.detail,
    raw?.path,
    raw?.file,
    raw?.cwd,
    raw?.tool,
    raw?.name,
    raw?.preview,
    raw?.output,
    Array.isArray(raw?.inspected_skills) ? raw.inspected_skills.join(' ') : '',
  ].filter(Boolean).join(' ')
  const lower = `${event.type} ${event.title} ${detail}`.toLowerCase()
  const path = String(raw?.path || raw?.file || extractPath(detail) || '')
  const resolvedPath = path && !path.startsWith('skill:')
    ? resolve(path.replace(/^file:\/\//, ''))
    : path
  const allowedSkillNames = new Set((Array.isArray(raw?.allowed_skill_names) ? raw.allowed_skill_names : employee?.skills || []).map((item: string) => item.toLowerCase()))
  const allowedSkillPaths = (Array.isArray(raw?.allowed_skill_paths) ? raw.allowed_skill_paths : []).map((item: string) => resolve(String(item)))
  const allowedKnowledgePaths = (Array.isArray(raw?.allowed_knowledge_paths) ? raw.allowed_knowledge_paths : []).map((item: string) => resolve(String(item)))
  const allowedMemoryPath = raw?.allowed_memory_path ? resolve(String(raw.allowed_memory_path)) : ''
  const employeeKnowledgeRoot = employee ? getKnowledgeDir(employee.id) : ''
  const isEmployeeKnowledge = Boolean(
    resolvedPath
    && allowedKnowledgePaths.some((allowed: string) => resolvedPath === allowed || resolvedPath.startsWith(`${allowed}/`))
  ) || Boolean(
    employeeKnowledgeRoot
    && resolvedPath
    && employee?.knowledge_docs.length
    && resolve(resolvedPath).startsWith(`${resolve(employeeKnowledgeRoot)}/`)
  ) || Boolean(employee?.knowledge_docs.some(doc => path.includes(doc.path) || detail.includes(doc.name)))

  const inspectedSkills = Array.isArray(raw?.inspected_skills) ? raw.inspected_skills.map(String) : []
  const inspectedSkill = inspectedSkills[0] || String(raw?.skill || raw?.skill_name || extractSkillName(detail) || '')
  const normalizedSkill = inspectedSkill.toLowerCase()
  const isSkillEvent = lower.includes('skill') || inspectedSkills.length > 0
  const isBoundSkill = isSkillEvent && (
    (normalizedSkill && allowedSkillNames.has(normalizedSkill))
    || Boolean(resolvedPath && allowedSkillPaths.some((allowed: string) => resolve(resolvedPath).startsWith(`${allowed}/`) || resolve(resolvedPath) === allowed))
    || inspectedSkills.some((skill: string) => allowedSkillNames.has(skill.toLowerCase()))
  )
  const isUnboundSkill = isSkillEvent && !isBoundSkill && Boolean(inspectedSkill || path || lower.includes('skill_view') || lower.includes('skills_list'))
  const isMemory = Boolean(allowedMemoryPath && resolvedPath && resolve(resolvedPath) === allowedMemoryPath) || lower.includes('memory')
  const isExternalMd = Boolean(path && lower.includes('.md') && !isEmployeeKnowledge && !isBoundSkill && !isMemory)

  let displayType = '工具调用'
  let scope = 'unknown'
  let resourceKind: EvaluationTraceEvent['resource_kind'] = 'tool'
  let allowed = true
  let blocked = false
  let riskLevel: EvaluationTraceEvent['risk_level'] = 'none'
  if (event.type === 'session' || lower.includes('run ')) {
    displayType = 'Session 事件'
    scope = 'session'
    resourceKind = 'session'
  } else if (isEmployeeKnowledge) {
    displayType = '员工知识库读取'
    scope = 'employee_knowledge'
    resourceKind = 'knowledge_md'
  } else if (isBoundSkill) {
    displayType = 'Skill 指南读取'
    scope = 'bound_skill'
    resourceKind = 'skill_file'
  } else if (isUnboundSkill) {
    displayType = 'Skill 指南读取'
    scope = 'unbound_skill'
    resourceKind = 'skill_file'
    allowed = false
    blocked = true
    riskLevel = 'high'
  } else if (isMemory) {
    displayType = 'Memory 读取/写入'
    scope = 'memory'
    resourceKind = 'memory_file'
  } else if (isExternalMd) {
    displayType = '工具调用'
    scope = 'external_file'
    resourceKind = 'local_file'
    allowed = false
    blocked = true
    riskLevel = 'high'
  }
  if (event.status === 'failed' && riskLevel !== 'high') riskLevel = 'medium'
  const resourceName = path ? basename(path) : (inspectedSkill || '')
  const dedupeKey = [
    event.round,
    event.type,
    event.title.replace(/run_[a-f0-9]+/gi, 'run'),
    scope,
    resourceName,
    event.status,
  ].join('|')

  return {
    ...event,
    display_type: displayType,
    scope,
    resource_name: resourceName,
    resource_path: path,
    is_employee_knowledge: isEmployeeKnowledge,
    allowed,
    blocked,
    resource_kind: resourceKind,
    dedupe_key: dedupeKey,
    display_summary: blocked
      ? `越界资源：${resourceName || event.title}`
      : displayType === 'Skill 指南读取'
        ? `${isBoundSkill ? '绑定' : '未绑定'} Skill：${resourceName || inspectedSkill || '未知'}`
        : event.title,
    risk_level: riskLevel,
  }
}

function extractPath(value: string): string {
  const match = value.match(/(?:file:\/\/\/[\w ._\-@()[\]/]+|\/[\w ._\-@()[\]/]+|\.\/[\w ._\-@()[\]/]+|(?:Downloads|files|skills|memories)\/[\w ._\-@()[\]/]+)(?:\.md|\.markdown|\.txt|\.json|\.yaml|\.yml)?/i)
  return match?.[0] || ''
}

function extractSkillName(value: string): string {
  const match = value.match(/(?:skill_view|skill|skills_list)[^\w-]*([a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?)/i)
  return match?.[1] || ''
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

export function getCapabilitySummary(evaluationId: string): CapabilitySummary {
  const events = listTraceEvents(evaluationId)
  const roundMap = new Map<number, {
    seen: Set<string>
    bound_skills: Set<string>
    unbound_skills: Set<string>
    employee_knowledge: Set<string>
    external_files: Set<string>
    memory_events: number
    tool_count: number
    duplicate_count: number
    blocked_count: number
  }>()
  const warnings = new Set<string>()
  for (const event of events) {
    const round = Number(event.round || 0)
    if (!roundMap.has(round)) {
      roundMap.set(round, {
        seen: new Set(),
        bound_skills: new Set(),
        unbound_skills: new Set(),
        employee_knowledge: new Set(),
        external_files: new Set(),
        memory_events: 0,
        tool_count: 0,
        duplicate_count: 0,
        blocked_count: 0,
      })
    }
    const item = roundMap.get(round)!
    const key = event.dedupe_key || `${event.type}|${event.scope}|${event.resource_name}|${event.title}`
    if (item.seen.has(key)) item.duplicate_count += 1
    item.seen.add(key)

    if (event.scope === 'bound_skill') item.bound_skills.add(event.resource_name || event.title)
    if (event.scope === 'unbound_skill') {
      item.unbound_skills.add(event.resource_name || event.title)
      warnings.add('检测到未绑定 skill 被探索，建议清理员工 profile 或启用 runtime profile 隔离。')
    }
    if (event.scope === 'employee_knowledge') item.employee_knowledge.add(event.resource_name || event.title)
    if (event.scope === 'external_file') {
      item.external_files.add(event.resource_name || event.resource_path || event.title)
      warnings.add('检测到非员工知识库文件读取，结果可能受污染。')
    }
    if (event.scope === 'memory') item.memory_events += 1
    if (event.type === 'tool' || event.display_type === '工具调用') item.tool_count += 1
    if (event.blocked || event.allowed === false) item.blocked_count += 1
    if (event.status === 'warning' && event.detail) warnings.add(event.detail)
  }
  const rounds = [...roundMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, item]) => ({
      round,
      bound_skills: [...item.bound_skills],
      unbound_skills: [...item.unbound_skills],
      employee_knowledge: [...item.employee_knowledge],
      external_files: [...item.external_files],
      memory_events: item.memory_events,
      tool_count: item.tool_count,
      duplicate_count: item.duplicate_count,
      blocked_count: item.blocked_count,
    }))
  const hasBlocked = rounds.some(item => item.blocked_count > 0 || item.external_files.length || item.unbound_skills.length)
  const status: CapabilitySummary['status'] = hasBlocked ? 'polluted' : warnings.size ? 'warning' : 'clean'
  return {
    evaluation_id: evaluationId,
    status,
    warnings: [...warnings],
    rounds,
  }
}

export function updateEvaluationCapabilityBoundary(evaluationId: string): YooleeEvaluation | null {
  const summary = getCapabilitySummary(evaluationId)
  return updateEvaluation(evaluationId, {
    capability_boundary_status: summary.status,
    boundary_warnings: summary.warnings,
  })
}

function learningFromRow(row: any): LearningSuggestion {
  return {
    id: row.id,
    evaluation_id: row.evaluation_id,
    summary: row.summary || '',
    score_reasoning: row.score_reasoning || '',
    memory_entries: parseJson<LearningMemoryEntry[]>(row.memory_entries, []),
    risk: row.risk || '',
    status: ['approved', 'written', 'discarded'].includes(row.status) ? row.status : 'draft',
    target_profile: row.target_profile || '',
    written_block: row.written_block || '',
    written_at: row.written_at == null ? null : Number(row.written_at),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
  }
}

export function getLearningSuggestion(evaluationId: string): LearningSuggestion | null {
  const row = getDb()
    .prepare('SELECT * FROM yoolee_learning_suggestions WHERE evaluation_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(evaluationId)
  return row ? learningFromRow(row) : null
}

export function saveLearningSuggestion(input: Partial<LearningSuggestion> & { evaluation_id: string }): LearningSuggestion {
  const existing = getLearningSuggestion(input.evaluation_id)
  const timestamp = now()
  const suggestion: LearningSuggestion = {
    id: input.id || existing?.id || id('learn'),
    evaluation_id: input.evaluation_id,
    summary: String(input.summary ?? existing?.summary ?? ''),
    score_reasoning: String(input.score_reasoning ?? existing?.score_reasoning ?? ''),
    memory_entries: Array.isArray(input.memory_entries) ? input.memory_entries : (existing?.memory_entries || []),
    risk: String(input.risk ?? existing?.risk ?? ''),
    status: input.status || existing?.status || 'draft',
    target_profile: String(input.target_profile ?? existing?.target_profile ?? ''),
    written_block: String(input.written_block ?? existing?.written_block ?? ''),
    written_at: input.written_at === undefined ? (existing?.written_at ?? null) : input.written_at,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  }
  getDb().prepare(`
    INSERT INTO yoolee_learning_suggestions
      (id, evaluation_id, summary, score_reasoning, memory_entries, risk, status, target_profile, written_block, written_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      summary = excluded.summary,
      score_reasoning = excluded.score_reasoning,
      memory_entries = excluded.memory_entries,
      risk = excluded.risk,
      status = excluded.status,
      target_profile = excluded.target_profile,
      written_block = excluded.written_block,
      written_at = excluded.written_at,
      updated_at = excluded.updated_at
  `).run(
    suggestion.id,
    suggestion.evaluation_id,
    suggestion.summary,
    suggestion.score_reasoning,
    JSON.stringify(suggestion.memory_entries),
    suggestion.risk,
    suggestion.status,
    suggestion.target_profile,
    suggestion.written_block,
    suggestion.written_at,
    suggestion.created_at,
    suggestion.updated_at,
  )
  return suggestion
}

export function dedicatedProfileName(employeeId: string): string {
  return `yoolee-employee-${employeeId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}`
}

export async function createDedicatedProfile(employeeId: string, baseProfile = 'default'): Promise<YooleeEmployee | null> {
  const employee = getEmployee(employeeId)
  if (!employee) return null
  const profileName = dedicatedProfileName(employeeId)
  const targetDir = resolveProfileDir(profileName)
  const sourceDir = resolveProfileDir(baseProfile || employee.profile || 'default')
  await mkdir(targetDir, { recursive: true })
  await mkdir(join(targetDir, 'memories'), { recursive: true })

  for (const file of ['config.yaml', '.env']) {
    const source = join(sourceDir, file)
    const target = join(targetDir, file)
    if (existsSync(source) && !existsSync(target)) {
      await copyFile(source, target)
    }
  }
  if (!existsSync(join(targetDir, 'config.yaml')) && existsSync(join(HERMES_BASE, 'config.yaml'))) {
    await copyFile(join(HERMES_BASE, 'config.yaml'), join(targetDir, 'config.yaml'))
  }
  if (!existsSync(join(targetDir, '.env'))) {
    await writeFile(join(targetDir, '.env'), '# Hermes Agent Environment Configuration\n', 'utf-8')
  }
  if (!existsSync(join(targetDir, 'memories', 'MEMORY.md'))) {
    await writeFile(join(targetDir, 'memories', 'MEMORY.md'), '', 'utf-8')
  }
  if (!existsSync(join(targetDir, 'memories', 'USER.md'))) {
    await writeFile(join(targetDir, 'memories', 'USER.md'), '', 'utf-8')
  }
  return saveEmployee({
    ...employee,
    profile: profileName,
    profile_name: profileName,
    profile_strategy: 'dedicated',
    memory_mode: employee.memory_mode || 'training_writable',
    profile_created_at: now(),
  })
}

export function employeeProfileDir(employee: YooleeEmployee): string {
  const name = employee.profile_name || employee.profile || 'default'
  return profileDirExists(name) ? resolveProfileDir(name) : resolveProfileDir(employee.profile || 'default')
}

export async function readEmployeeMemory(employee: YooleeEmployee): Promise<string> {
  try {
    return await readFile(join(employeeProfileDir(employee), 'memories', 'MEMORY.md'), 'utf-8')
  } catch {
    return ''
  }
}

export async function appendEmployeeMemory(employee: YooleeEmployee, block: string): Promise<void> {
  const memoryPath = join(employeeProfileDir(employee), 'memories', 'MEMORY.md')
  await mkdir(join(employeeProfileDir(employee), 'memories'), { recursive: true })
  await appendFile(memoryPath, `${block.trim()}\n\n`, 'utf-8')
}

export async function removeEmployeeMemoryBlock(employee: YooleeEmployee, marker: string): Promise<boolean> {
  const memoryPath = join(employeeProfileDir(employee), 'memories', 'MEMORY.md')
  let raw = ''
  try {
    raw = await readFile(memoryPath, 'utf-8')
  } catch {
    return false
  }
  const start = raw.indexOf(`<!-- ${marker}:start -->`)
  const endMarker = `<!-- ${marker}:end -->`
  const end = raw.indexOf(endMarker)
  if (start === -1 || end === -1 || end < start) return false
  const next = `${raw.slice(0, start)}${raw.slice(end + endMarker.length)}`.replace(/\n{4,}/g, '\n\n\n')
  await writeFile(memoryPath, next.trimEnd() + '\n', 'utf-8')
  return true
}

export function getYooleeDbPath() {
  return DB_PATH
}

export function defaultPromptSettings(): YooleePromptSettings {
  return {
    employee_prompt_template: DEFAULT_EMPLOYEE_PROMPT_TEMPLATE,
    customer_prompt_template: DEFAULT_CUSTOMER_PROMPT_TEMPLATE,
    learning_prompt_template: DEFAULT_LEARNING_PROMPT_TEMPLATE,
    auto_score_prompt_template: DEFAULT_AUTO_SCORE_PROMPT_TEMPLATE,
    updated_at: 0,
  }
}

export function getPromptSettings(): YooleePromptSettings {
  const row = getDb().prepare('SELECT value, updated_at FROM yoolee_settings WHERE key = ?').get('prompt_settings') as { value?: string; updated_at?: number } | undefined
  const defaults = defaultPromptSettings()
  if (!row?.value) return defaults
  const saved = parseJson<Partial<YooleePromptSettings>>(row.value, {})
  return {
    employee_prompt_template: String(saved.employee_prompt_template || defaults.employee_prompt_template),
    customer_prompt_template: String(saved.customer_prompt_template || defaults.customer_prompt_template),
    learning_prompt_template: String(saved.learning_prompt_template || defaults.learning_prompt_template),
    auto_score_prompt_template: String(saved.auto_score_prompt_template || defaults.auto_score_prompt_template),
    updated_at: Number(row.updated_at || saved.updated_at || 0),
  }
}

export function savePromptSettings(input: Partial<YooleePromptSettings>): YooleePromptSettings {
  const existing = getPromptSettings()
  const timestamp = now()
  const settings: YooleePromptSettings = {
    employee_prompt_template: String(input.employee_prompt_template || existing.employee_prompt_template),
    customer_prompt_template: String(input.customer_prompt_template || existing.customer_prompt_template),
    learning_prompt_template: String(input.learning_prompt_template || existing.learning_prompt_template),
    auto_score_prompt_template: String(input.auto_score_prompt_template || existing.auto_score_prompt_template),
    updated_at: timestamp,
  }
  getDb().prepare(`
    INSERT INTO yoolee_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run('prompt_settings', JSON.stringify(settings), timestamp)
  return settings
}

export function resetPromptSettings(): YooleePromptSettings {
  const settings = defaultPromptSettings()
  settings.updated_at = now()
  getDb().prepare(`
    INSERT INTO yoolee_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run('prompt_settings', JSON.stringify(settings), settings.updated_at)
  return settings
}

function normalizeKnowledgeDocs(value: unknown[]): KnowledgeDoc[] {
  return value.map(item => {
    const doc = item as Partial<KnowledgeDoc>
    const storedPath = normalizeKnowledgePath(String(doc.path || ''))
    return {
      id: String(doc.id || id('doc')),
      name: String(doc.name || ''),
      path: storedPath,
      size: Number(doc.size || 0),
      uploaded_at: Number(doc.uploaded_at || now()),
    }
  }).filter(doc => doc.name && doc.path)
}

function normalizeKnowledgePath(path: string) {
  if (!path) return ''
  const fullPath = resolve(path)
  if (fullPath.startsWith(`${KNOWLEDGE_ROOT}/`)) {
    return relative(KNOWLEDGE_ROOT, fullPath)
  }
  return path.replace(/^\/+/, '')
}

function resolveKnowledgeDocPath(path: string) {
  const fullPath = path.startsWith('/') ? resolve(path) : resolve(KNOWLEDGE_ROOT, path)
  if (!fullPath.startsWith(`${KNOWLEDGE_ROOT}/`)) {
    throw new Error('Knowledge document path is outside knowledge root')
  }
  return fullPath
}

function safeFileName(name: string) {
  const base = basename(name).replace(/[^a-zA-Z0-9._ -]/g, '_').trim()
  return base || `knowledge-${Date.now()}.md`
}

export function getKnowledgeDir(employeeId: string) {
  return resolve(KNOWLEDGE_ROOT, employeeId)
}

export async function addKnowledgeDoc(employeeId: string, filename: string, data: Buffer): Promise<YooleeEmployee | null> {
  const employee = getEmployee(employeeId)
  if (!employee) return null
  const ext = extname(filename).toLowerCase()
  if (ext !== '.md' && ext !== '.markdown') {
    throw new Error('Only Markdown files are supported')
  }
  if (data.length > 1024 * 1024) {
    throw new Error('Markdown file is too large (max 1MB)')
  }
  if (employee.knowledge_docs.length >= 10) {
    throw new Error('Knowledge base supports at most 10 documents per employee')
  }

  const docId = id('doc')
  const dir = getKnowledgeDir(employeeId)
  await mkdir(dir, { recursive: true })
  const savedName = `${docId}-${safeFileName(filename)}`
  const fullPath = resolve(dir, savedName)
  await writeFile(fullPath, data)
  const doc: KnowledgeDoc = {
    id: docId,
    name: safeFileName(filename),
    path: relative(KNOWLEDGE_ROOT, fullPath),
    size: data.length,
    uploaded_at: now(),
  }
  return saveEmployee({ ...employee, knowledge_docs: [...employee.knowledge_docs, doc] })
}

export async function removeKnowledgeDoc(employeeId: string, docId: string): Promise<YooleeEmployee | null> {
  const employee = getEmployee(employeeId)
  if (!employee) return null
  const target = employee.knowledge_docs.find(doc => doc.id === docId)
  if (!target) return employee
  const fullPath = resolveKnowledgeDocPath(target.path)
  if (existsSync(fullPath)) {
    try { await unlink(fullPath) } catch { /* ignore */ }
  }
  return saveEmployee({
    ...employee,
    knowledge_docs: employee.knowledge_docs.filter(doc => doc.id !== docId),
  })
}
