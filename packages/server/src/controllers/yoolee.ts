import * as store from '../services/yoolee/store'
import { stat } from 'fs/promises'
import { join } from 'path'
import {
  generateCustomerReply,
  generateEmployeeReplyWithTrace,
  generateLearningReviewPrompt,
  findMissingSkillsForProfile,
  prepareEvaluationRuntimeProfile,
  shouldStop,
} from '../services/yoolee/runner'
import {
  getAutoScore,
  queueAutoScore,
  runAutoScoreForEvaluation,
  updateManualTurnScore,
} from '../services/yoolee/auto-score'
import { getGatewayManagerInstance } from '../services/gateway-bootstrap'

function badRequest(ctx: any, error: string) {
  ctx.status = 400
  ctx.body = { error }
}

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[,，\n]/).map(v => v.trim()).filter(Boolean)
  }
  return ['成交', '不考虑', '再联系', '预算不够']
}

function sanitizeEvaluationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/ENOENT|not found|HERMES_BIN/i.test(message)) {
    return 'Hermes CLI 未找到，请检查 HERMES_BIN 或服务启动 PATH。'
  }
  if (/Gateway health check timed out|timed out|timeout/i.test(message)) {
    return 'Gateway health check timed out.'
  }
  if (/绑定 Skill 未安装|绑定 Skill 未在员工 profile 中找到|missing bound skills/i.test(message)) {
    return message.length > 500 ? `${message.slice(0, 500)}...` : message
  }
  if (/Command failed: hermes -z/i.test(message)) {
    const stderr = message.split('\n').map(line => line.trim()).filter(Boolean).find(line => !line.startsWith('Command failed: hermes -z'))
    return stderr || '模型调用失败，请查看原始日志。'
  }
  return message.length > 500 ? `${message.slice(0, 500)}...` : message
}

function employeeCapabilitySummary(employee: store.YooleeEmployee, runtimeProfile?: string): string {
  const knowledgeDir = store.getKnowledgeDir(employee.id)
  const docs = employee.knowledge_docs.length
    ? employee.knowledge_docs.map(doc => `- ${doc.name} (${Math.round(doc.size / 1024)}KB): ${doc.path}`).join('\n')
    : '无'
  return [
    'AI员工能力注入：',
    `Hermes Profile：${employee.profile_name || employee.profile || 'default'}（${employee.profile_strategy === 'dedicated' ? '员工独立 profile' : '手动绑定 profile'}）`,
    runtimeProfile ? `测评 Runtime Profile：${runtimeProfile}（仅包含本员工绑定 skills 与必要运行配置）` : '',
    `记忆模式：${employee.memory_mode === 'readonly' ? '基准只读' : '训练可写'}`,
    `Provider / Model：${employee.provider || 'profile 默认'} / ${employee.model || 'profile 默认'}`,
    `Skills：${employee.skills.length ? employee.skills.join(', ') : '无'}${employee.skills.length ? '（已绑定到员工上下文，实际触发会在能力轨迹中展示）' : ''}`,
    `知识库目录：${employee.knowledge_docs.length ? knowledgeDir : '无'}`,
    '知识库文件：',
    docs,
    '说明：测评采用严格白名单边界；知识库以目录和文件清单注入 Hermes prompt，由员工侧 agent 在需要时自主读取 md；实际读取动作会在能力轨迹中展示。',
  ].filter(Boolean).join('\n')
}

export async function meta(ctx: any) {
  ctx.body = { dbPath: store.getYooleeDbPath() }
}

export async function dashboard(ctx: any) {
  const employees = store.listEmployees()
  const customers = store.listCustomers()
  const evaluations = store.listEvaluations()
  const pendingScores = evaluations.filter(item => item.status === 'completed' && item.manual_score == null)
  const pendingLearning = evaluations.filter(item => item.manual_score != null && item.learning_status === 'none')
  ctx.body = {
    stats: {
      employees: employees.length,
      active_employees: employees.filter(item => item.status === 'active').length,
      customers: customers.length,
      active_customers: customers.filter(item => item.status === 'active').length,
      running_evaluations: evaluations.filter(item => item.status === 'running').length,
      failed_evaluations: evaluations.filter(item => item.status === 'failed').length,
      pending_scores: pendingScores.length,
      pending_learning: pendingLearning.length,
    },
    recent_evaluations: evaluations.slice(0, 6),
    exceptions: evaluations.filter(item => item.status === 'failed' || item.status === 'running').slice(0, 8),
    learning_queue: pendingLearning.slice(0, 8).map(evaluation => ({
      evaluation,
      learning_suggestion: store.getLearningSuggestion(evaluation.id),
    })),
  }
}

export async function dataSummary(ctx: any) {
  const employees = store.listEmployees()
  const evaluations = store.listEvaluations()
  const completed = evaluations.filter(item => item.status === 'completed')
  const failed = evaluations.filter(item => item.status === 'failed')
  const traceEvents = evaluations.flatMap(item => store.listTraceEvents(item.id))
  const failureMap = new Map<string, number>()
  for (const item of failed) {
    const key = item.failure_type || '未知失败'
    failureMap.set(key, (failureMap.get(key) || 0) + 1)
  }
  const skillMap = new Map<string, number>()
  const knowledgeMap = new Map<string, number>()
  for (const event of traceEvents) {
    if (event.display_type === 'Skill 触发' || event.display_type === 'Skill 指南读取') {
      const key = event.resource_name || event.title || 'unknown'
      skillMap.set(key, (skillMap.get(key) || 0) + 1)
    }
    if (event.is_employee_knowledge) {
      const key = event.resource_name || event.title || 'unknown'
      knowledgeMap.set(key, (knowledgeMap.get(key) || 0) + 1)
    }
  }
  ctx.body = {
    total_evaluations: evaluations.length,
    completed_evaluations: completed.length,
    failed_evaluations: failed.length,
    running_evaluations: evaluations.filter(item => item.status === 'running').length,
    success_rate: evaluations.length ? completed.length / evaluations.length : 0,
    average_rounds: evaluations.length
      ? evaluations.reduce((sum, item) => sum + Math.max(0, ...item.messages.map(msg => msg.round || 0)), 0) / evaluations.length
      : 0,
    average_duration_ms: evaluations.length
      ? evaluations.reduce((sum, item) => sum + (item.duration_ms || 0), 0) / evaluations.length
      : 0,
    failure_reasons: Array.from(failureMap.entries()).map(([type, count]) => ({ type, count })),
    employee_trends: employees.map(employee => {
      const own = evaluations.filter(item => item.employee_id === employee.id)
      const scored = own.filter(item => item.manual_score != null)
      return {
        employee_id: employee.id,
        employee_name: employee.name,
        total: own.length,
        completed: own.filter(item => item.status === 'completed').length,
        failed: own.filter(item => item.status === 'failed').length,
        average_score: scored.length
          ? scored.reduce((sum, item) => sum + Number(item.manual_score || 0), 0) / scored.length
          : null,
      }
    }),
    skill_usage: Array.from(skillMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    knowledge_usage: Array.from(knowledgeMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    learning_writes: evaluations.filter(item => item.learning_status === 'written').length,
  }
}

export async function getPromptSettings(ctx: any) {
  ctx.body = {
    settings: store.getPromptSettings(),
    defaults: store.defaultPromptSettings(),
  }
}

export async function updatePromptSettings(ctx: any) {
  const body = ctx.request.body || {}
  const employeeTemplate = String(body.employee_prompt_template || '').trim()
  const customerTemplate = String(body.customer_prompt_template || '').trim()
  const learningTemplate = String(body.learning_prompt_template || '').trim()
  const autoScoreTemplate = String(body.auto_score_prompt_template || '').trim()
  if (!employeeTemplate) return badRequest(ctx, 'Missing employee prompt template')
  if (!customerTemplate) return badRequest(ctx, 'Missing customer prompt template')
  if (!learningTemplate) return badRequest(ctx, 'Missing learning prompt template')
  if (!autoScoreTemplate) return badRequest(ctx, 'Missing auto score prompt template')
  ctx.body = {
    settings: store.savePromptSettings({
      employee_prompt_template: String(body.employee_prompt_template),
      customer_prompt_template: String(body.customer_prompt_template),
      learning_prompt_template: String(body.learning_prompt_template),
      auto_score_prompt_template: String(body.auto_score_prompt_template),
    }),
    defaults: store.defaultPromptSettings(),
  }
}

export async function resetPromptSettings(ctx: any) {
  ctx.body = {
    settings: store.resetPromptSettings(),
    defaults: store.defaultPromptSettings(),
  }
}

export async function listEmployees(ctx: any) {
  ctx.body = { employees: store.listEmployees() }
}

export async function createEmployee(ctx: any) {
  const body = ctx.request.body || {}
  if (!String(body.name || '').trim()) return badRequest(ctx, 'Missing employee name')
  const profile = String(body.profile_name || body.profile || 'default')
  const missingSkills = await findMissingSkillsForProfile(profile, Array.isArray(body.skills) ? body.skills : [])
  if (missingSkills.length) {
    return badRequest(ctx, `绑定 Skill 未安装到员工 Profile「${profile}」：${missingSkills.join(', ')}。请先安装到该 Profile，或切换员工 Profile。`)
  }
  ctx.body = { employee: store.saveEmployee(body) }
}

export async function updateEmployee(ctx: any) {
  const existing = store.getEmployee(ctx.params.id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { error: 'Employee not found' }
    return
  }
  const body = ctx.request.body || {}
  if (!String(body.name || existing.name).trim()) return badRequest(ctx, 'Missing employee name')
  const nextProfile = String(body.profile_name || body.profile || existing.profile_name || existing.profile || 'default')
  const nextSkills = Array.isArray(body.skills) ? body.skills : existing.skills
  const missingSkills = await findMissingSkillsForProfile(nextProfile, nextSkills)
  if (missingSkills.length) {
    return badRequest(ctx, `绑定 Skill 未安装到员工 Profile「${nextProfile}」：${missingSkills.join(', ')}。请先安装到该 Profile，或切换员工 Profile。`)
  }
  ctx.body = { employee: store.saveEmployee({ ...existing, ...body, id: existing.id, created_at: existing.created_at }) }
}

export async function createEmployeeProfile(ctx: any) {
  const employee = store.getEmployee(ctx.params.id)
  if (!employee) {
    ctx.status = 404
    ctx.body = { error: 'Employee not found' }
    return
  }
  const body = ctx.request.body || {}
  try {
    const updated = await store.createDedicatedProfile(employee.id, String(body.base_profile || employee.profile || 'default'))
    if (!updated) {
      ctx.status = 404
      ctx.body = { error: 'Employee not found' }
      return
    }
    const mgr = getGatewayManagerInstance()
    if (mgr) {
      try { await mgr.start(updated.profile_name || updated.profile) } catch { /* profile exists even if gateway start fails */ }
    }
    ctx.body = { employee: updated }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

export async function getEmployeeMemory(ctx: any) {
  const employee = store.getEmployee(ctx.params.id)
  if (!employee) {
    ctx.status = 404
    ctx.body = { error: 'Employee not found' }
    return
  }
  const profile = employee.profile_name || employee.profile || 'default'
  const memoryPath = join(store.employeeProfileDir(employee), 'memories', 'MEMORY.md')
  const memory = await store.readEmployeeMemory(employee)
  let memoryMtime: Date | null = null
  try {
    memoryMtime = (await stat(memoryPath)).mtime
  } catch {
    memoryMtime = null
  }
  const learning_records = store
    .listEvaluations({ employee_id: employee.id })
    .map(evaluation => ({
      evaluation,
      learning_suggestion: store.getLearningSuggestion(evaluation.id),
    }))
    .filter(item => item.learning_suggestion)
    .slice(0, 20)
  ctx.body = {
    profile,
    memory,
    memory_path: memoryPath,
    memory_mtime: memoryMtime ? memoryMtime.getTime() : null,
    learning_records,
  }
}

export async function deleteEmployee(ctx: any) {
  ctx.body = { success: store.deleteEmployee(ctx.params.id) }
}

export async function uploadEmployeeKnowledge(ctx: any) {
  const employee = store.getEmployee(ctx.params.id)
  if (!employee) {
    ctx.status = 404
    ctx.body = { error: 'Employee not found' }
    return
  }
  const upload = await readSingleUpload(ctx)
  if (!upload) return
  try {
    const updated = await store.addKnowledgeDoc(employee.id, upload.filename, upload.data)
    ctx.body = { employee: updated, knowledge_docs: updated?.knowledge_docs || [] }
  } catch (err: any) {
    ctx.status = 400
    ctx.body = { error: err.message }
  }
}

export async function deleteEmployeeKnowledge(ctx: any) {
  const updated = await store.removeKnowledgeDoc(ctx.params.id, ctx.params.docId)
  if (!updated) {
    ctx.status = 404
    ctx.body = { error: 'Employee not found' }
    return
  }
  ctx.body = { employee: updated, knowledge_docs: updated.knowledge_docs }
}

export async function listCustomers(ctx: any) {
  ctx.body = { customers: store.listCustomers() }
}

export async function createCustomer(ctx: any) {
  const body = ctx.request.body || {}
  if (!String(body.name || '').trim()) return badRequest(ctx, 'Missing customer name')
  ctx.body = { customer: store.saveCustomer(body) }
}

export async function updateCustomer(ctx: any) {
  const existing = store.getCustomer(ctx.params.id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { error: 'Customer not found' }
    return
  }
  const body = ctx.request.body || {}
  if (!String(body.name || existing.name).trim()) return badRequest(ctx, 'Missing customer name')
  ctx.body = { customer: store.saveCustomer({ ...existing, ...body, id: existing.id, created_at: existing.created_at }) }
}

export async function deleteCustomer(ctx: any) {
  ctx.body = { success: store.deleteCustomer(ctx.params.id) }
}

export async function listEvaluations(ctx: any) {
  ctx.body = {
    evaluations: store.listEvaluations({
      employee_id: String(ctx.query.employee_id || ''),
      customer_id: String(ctx.query.customer_id || ''),
      status: String(ctx.query.status || ''),
    }),
  }
}

export async function getEvaluation(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  ctx.body = {
    evaluation,
    trace_events: store.listTraceEvents(evaluation.id),
    turn_scores: store.listTurnScores(evaluation.id),
    learning_suggestion: store.getLearningSuggestion(evaluation.id),
  }
}

export async function runEvaluation(ctx: any) {
  const body = ctx.request.body || {}
  const employee = store.getEmployee(String(body.employee_id || ''))
  const customer = store.getCustomer(String(body.customer_id || ''))
  if (!employee) return badRequest(ctx, 'Employee not found')
  if (!customer) return badRequest(ctx, 'Customer not found')
  if (employee.status !== 'active') return badRequest(ctx, 'Employee is inactive')
  if (customer.status !== 'active') return badRequest(ctx, 'Customer is inactive')

  const maxRounds = Math.max(2, Math.min(20, Number(body.max_rounds || 6)))
  const stopKeywords = parseKeywords(body.stop_keywords)
  const started = Date.now()
  const context = String(body.context || '').trim()
  const memoryMode = body.memory_mode === 'readonly' ? 'readonly' : (employee.memory_mode || 'training_writable')
  let evaluation = store.createEvaluation({
    employee,
    customer,
    max_rounds: maxRounds,
    context,
    stop_keywords: stopKeywords,
    memory_mode: memoryMode,
  })
  const employeeSessionId = `yoolee-eval-${evaluation.id}-employee`.replace(/[^a-zA-Z0-9_-]/g, '-')
  let runtimeProfile
  try {
    runtimeProfile = await prepareEvaluationRuntimeProfile({ ...employee, memory_mode: memoryMode }, evaluation.id)
  } catch (err: any) {
    const errorMessage = sanitizeEvaluationError(err)
    evaluation = store.updateEvaluation(evaluation.id, {
      status: 'failed',
      employee_session_id: employeeSessionId,
      employee_profile: employee.profile_name || employee.profile || 'default',
      failure_type: '员工侧失败',
      error: errorMessage,
      duration_ms: Date.now() - started,
    }) || evaluation
    ctx.body = { evaluation }
    return
  }
  evaluation = store.updateEvaluation(evaluation.id, {
    employee_session_id: employeeSessionId,
    employee_profile: employee.profile_name || employee.profile || 'default',
    runtime_profile: runtimeProfile.profileName,
    capability_boundary_status: runtimeProfile.warnings.length ? 'warning' : 'clean',
    boundary_warnings: runtimeProfile.warnings,
  }) || evaluation
  const messages = [...evaluation.messages]

  messages.push({
    round: 0,
    speaker: 'system',
    content: `${employeeCapabilitySummary(employee, runtimeProfile.profileName)}\nHermes Session：${employeeSessionId}`,
    created_at: Date.now(),
  })
  store.addTraceEvent({
    evaluation_id: evaluation.id,
    round: 0,
    type: 'session',
    title: 'AI员工能力注入',
    detail: `${employeeCapabilitySummary(employee, runtimeProfile.profileName)}\nHermes Session：${employeeSessionId}`,
    status: 'info',
    raw_event: {
      runtime_profile: runtimeProfile.profileName,
      source_profile: runtimeProfile.sourceProfile,
      allowed_skill_names: runtimeProfile.allowedSkillNames,
      allowed_skill_paths: runtimeProfile.allowedSkillPaths,
      allowed_knowledge_paths: runtimeProfile.allowedKnowledgePaths,
      allowed_memory_path: runtimeProfile.allowedMemoryPath,
    },
  })
  for (const warning of runtimeProfile.warnings) {
    store.addTraceEvent({
      evaluation_id: evaluation.id,
      round: 0,
      type: 'session',
      title: 'Runtime Profile 准备警告',
      detail: warning,
      status: 'warning',
      raw_event: { runtime_profile: runtimeProfile.profileName },
    })
  }
  const missingSkillWarnings = runtimeProfile.warnings.filter(item => item.startsWith('绑定 Skill 未在员工 profile 中找到'))
  if (missingSkillWarnings.length) {
    const errorMessage = `${missingSkillWarnings.join('；')}。请先把这些 skill 安装到员工 Profile「${runtimeProfile.sourceProfile}」，或切换员工绑定 Profile。`
    messages.push({
      round: 1,
      speaker: 'system',
      content: '测评运行失败，员工能力配置不完整。',
      error: errorMessage,
      created_at: Date.now(),
    })
    evaluation = store.updateEvaluation(evaluation.id, {
      status: 'failed',
      messages,
      error: errorMessage,
      duration_ms: Date.now() - started,
    }) || evaluation
    ctx.body = { evaluation }
    return
  }

  if (context) {
    messages.push({
      round: 0,
      speaker: 'system',
      content: `对话前情：${context}`,
      created_at: Date.now(),
    })
  }

  if (customer.opening_message) {
    messages.push({
      round: 0,
      speaker: 'customer',
      content: customer.opening_message,
      created_at: Date.now(),
    })
  }

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      const employeeReplyResult = await generateEmployeeReplyWithTrace({
        evaluationId: evaluation.id,
        sessionId: employeeSessionId,
        employee: { ...employee, memory_mode: memoryMode },
        customer,
        messages,
        round,
        runtimeProfile,
      })
      for (const trace of employeeReplyResult.traces) {
        store.addTraceEvent({
          evaluation_id: evaluation.id,
          round: trace.round,
          type: trace.type,
          title: trace.title,
          detail: trace.detail,
          status: trace.status,
          raw_event: trace.raw_event,
        })
      }
      messages.push({
        round,
        speaker: 'employee',
        content: employeeReplyResult.content,
        created_at: Date.now(),
      })

      const customerReply = await generateCustomerReply(customer, employee, messages, round)
      messages.push({
        round,
        speaker: 'customer',
        content: customerReply,
        created_at: Date.now(),
      })

      evaluation = store.updateEvaluation(evaluation.id, {
        messages,
        token_usage: employeeReplyResult.usage || evaluation.token_usage,
        duration_ms: Date.now() - started,
      }) || evaluation
      evaluation = store.updateEvaluationCapabilityBoundary(evaluation.id) || evaluation

      if (shouldStop(customerReply, stopKeywords)) break
    }

    evaluation = store.updateEvaluationCapabilityBoundary(evaluation.id) || evaluation
    evaluation = store.updateEvaluation(evaluation.id, {
      status: 'completed',
      messages,
      duration_ms: Date.now() - started,
    }) || evaluation
    evaluation = queueAutoScore(evaluation.id) || evaluation
  } catch (err: any) {
    const errorMessage = sanitizeEvaluationError(err)
    messages.push({
      round: Math.max(1, messages[messages.length - 1]?.round || 1),
      speaker: 'system',
      content: '测评运行失败，已保留已生成的对话。',
      error: errorMessage,
      created_at: Date.now(),
    })
    evaluation = store.updateEvaluation(evaluation.id, {
      status: 'failed',
      messages,
      error: errorMessage,
      duration_ms: Date.now() - started,
    }) || evaluation
    evaluation = store.updateEvaluationCapabilityBoundary(evaluation.id) || evaluation
  }

  ctx.body = { evaluation }
}

export async function getEvaluationTrace(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  ctx.body = { trace_events: store.listTraceEvents(evaluation.id) }
}

export async function getEvaluationCapabilitySummary(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  ctx.body = { capability_summary: store.getCapabilitySummary(evaluation.id) }
}

export async function getEvaluationAutoScore(ctx: any) {
  const result = getAutoScore(ctx.params.id)
  if (!result.evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  ctx.body = result
}

export async function rerunEvaluationAutoScore(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  if (evaluation.status !== 'completed') return badRequest(ctx, 'Only completed evaluations can be auto-scored')
  try {
    store.updateEvaluation(evaluation.id, { auto_score_status: 'queued' })
    const result = await runAutoScoreForEvaluation(evaluation.id)
    ctx.body = result
  } catch (err: any) {
    const failed = store.updateEvaluation(evaluation.id, {
      auto_score_status: 'failed',
      auto_score_summary: err?.message || String(err),
      auto_score_error_count: 1,
    })
    ctx.status = 500
    ctx.body = { error: err?.message || String(err), evaluation: failed, turn_scores: store.listTurnScores(evaluation.id) }
  }
}

export async function updateEvaluationTurnScore(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  const round = Number(ctx.params.round)
  if (!Number.isFinite(round) || round < 0) return badRequest(ctx, 'Invalid round')
  const body = ctx.request.body || {}
  const rawScore = body.manual_score
  if (rawScore !== null && rawScore !== undefined && rawScore !== '' && ![0, 1].includes(Number(rawScore))) {
    return badRequest(ctx, 'Manual turn score must be 0, 1, or null')
  }
  ctx.body = {
    evaluation,
    turn_score: updateManualTurnScore(evaluation.id, round, {
      manual_score: rawScore,
      manual_note: body.manual_note,
    }),
    turn_scores: store.listTurnScores(evaluation.id),
  }
}

function evaluationTranscript(evaluation: store.YooleeEvaluation) {
  return evaluation.messages.map(msg => {
    const speaker = msg.speaker === 'employee' ? 'AI员工' : msg.speaker === 'customer' ? 'AI客户' : '系统'
    return `第 ${msg.round} 轮 · ${speaker}：${msg.content}`
  }).join('\n')
}

function renderLearningTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => variables[key] ?? '')
}

function customerProfileText(customer: store.YooleeCustomer | null) {
  if (!customer) return ''
  return [
    customer.industry,
    customer.need,
    customer.budget,
    customer.concerns,
    customer.stage,
    customer.communication_style,
  ].filter(Boolean).join(' / ')
}

function autoScoreReviewText(evaluation: store.YooleeEvaluation, turnScores: store.YooleeTurnScore[]) {
  const rows = turnScores.length
    ? turnScores.map(item => [
      `- 第${item.round}轮`,
      `自动：${item.auto_score == null ? '未评分' : item.auto_score === 1 ? '通过' : '不通过'}`,
      item.auto_reason ? `原因：${item.auto_reason}` : '',
      item.violated_rubric ? `违反：${item.violated_rubric}` : '',
      item.auto_error ? `错误：${item.auto_error}` : '',
      `人工逐轮：${item.manual_score == null ? '未评分' : item.manual_score === 1 ? '通过' : '不通过'}`,
      item.manual_note ? `人工备注：${item.manual_note}` : '',
    ].filter(Boolean).join('；')).join('\n')
    : '暂无逐轮自动评分。'
  return [
    `整场自动分：${evaluation.auto_score == null ? '未评分' : `${evaluation.auto_score}/100`}`,
    `自动评分状态：${evaluation.auto_score_status}`,
    `通过轮次：${evaluation.auto_score_pass_count}/${evaluation.auto_score_total}`,
    evaluation.auto_score_error_count ? `评分错误轮次：${evaluation.auto_score_error_count}` : '',
    evaluation.auto_score_summary ? `自动评分摘要：${evaluation.auto_score_summary}` : '',
    '逐轮评分：',
    rows,
  ].filter(Boolean).join('\n')
}

function learningPrompt(evaluation: store.YooleeEvaluation, employee: store.YooleeEmployee | null, customer: store.YooleeCustomer | null, traceEvents: store.EvaluationTraceEvent[], turnScores: store.YooleeTurnScore[]) {
  const traceText = traceEvents.map(event => `- 第${event.round}轮 ${event.title}: ${event.detail}`).join('\n') || '无'
  const template = store.getPromptSettings().learning_prompt_template
  const rendered = renderLearningTemplate(template, {
    employee_name: employee?.name || evaluation.employee_name,
    employee_role: employee?.role || '',
    employee_goal: employee?.goal || '',
    customer_name: customer?.name || evaluation.customer_name,
    customer_profile: customerProfileText(customer),
    manual_score: evaluation.manual_score == null ? '未评分' : String(evaluation.manual_score),
    manual_conclusion: evaluation.conclusion || '无',
    manual_note: evaluation.manual_note || '无',
    auto_score_review: autoScoreReviewText(evaluation, turnScores),
    trace_events: traceText,
    transcript: evaluationTranscript(evaluation),
  })
  return template.includes('auto_score_review')
    ? rendered
    : `${rendered}\n\n自动评分结果：\n${autoScoreReviewText(evaluation, turnScores)}`
}

function parseLearningJson(raw: string): Partial<store.LearningSuggestion> {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    return {
      summary: trimmed.slice(0, 800),
      score_reasoning: '复盘 Agent 未返回结构化 JSON，请人工编辑后再写入。',
      memory_entries: [],
      risk: '非结构化输出，建议人工确认。',
    }
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    const entries = Array.isArray(parsed.memory_entries) ? parsed.memory_entries : []
    return {
      summary: String(parsed.summary || ''),
      score_reasoning: String(parsed.score_reasoning || ''),
      memory_entries: entries.map((entry: any, index: number) => ({
        id: String(entry.id || `entry-${index + 1}`),
        type: String(entry.type || 'improvement'),
        content: String(entry.content || '').trim(),
        selected: entry.selected !== false,
      })).filter((entry: store.LearningMemoryEntry) => entry.content),
      risk: String(parsed.risk || ''),
    }
  } catch {
    return {
      summary: trimmed.slice(0, 800),
      score_reasoning: '复盘 Agent 返回的 JSON 无法解析，请人工编辑后再写入。',
      memory_entries: [],
      risk: 'JSON parse failed.',
    }
  }
}

export async function generateLearningSuggestion(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  const employee = store.getEmployee(evaluation.employee_id)
  const customer = store.getCustomer(evaluation.customer_id)
  const traceEvents = store.listTraceEvents(evaluation.id)
  const turnScores = store.listTurnScores(evaluation.id)
  try {
    const raw = await generateLearningReviewPrompt(learningPrompt(evaluation, employee, customer, traceEvents, turnScores), employee?.model || undefined)
    const parsed = parseLearningJson(raw)
    const suggestion = store.saveLearningSuggestion({
      evaluation_id: evaluation.id,
      summary: parsed.summary || '',
      score_reasoning: parsed.score_reasoning || '',
      memory_entries: parsed.memory_entries || [],
      risk: parsed.risk || '',
      target_profile: evaluation.employee_profile || employee?.profile_name || employee?.profile || 'default',
      status: 'draft',
    })
    store.updateEvaluation(evaluation.id, { learning_status: 'draft' })
    ctx.body = { learning_suggestion: suggestion, raw }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

function memoryBlock(evaluation: store.YooleeEvaluation, suggestion: store.LearningSuggestion, entries: store.LearningMemoryEntry[]) {
  const marker = `yoolee-learning:${suggestion.id}`
  return [
    `<!-- ${marker}:start -->`,
    `## Yoolee 测评学习 - ${new Date().toLocaleString()}`,
    '',
    `来源：${evaluation.employee_name} × ${evaluation.customer_name}（${evaluation.id}）`,
    `人工评分：${evaluation.manual_score ?? '未评分'} / 100`,
    evaluation.conclusion ? `结论：${evaluation.conclusion}` : '',
    '',
    ...entries.map(entry => `- [${entry.type}] ${entry.content}`),
    '',
    suggestion.risk ? `风险提示：${suggestion.risk}` : '',
    `<!-- ${marker}:end -->`,
  ].filter(Boolean).join('\n')
}

export async function commitLearningSuggestion(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  const employee = store.getEmployee(evaluation.employee_id)
  if (!employee) return badRequest(ctx, 'Employee not found')
  if (evaluation.capability_boundary_status === 'polluted' || evaluation.status === 'failed') {
    return badRequest(ctx, '失败或能力边界污染的测评不能写入员工记忆，请仅用于复盘。')
  }
  const body = ctx.request.body || {}
  const existing = store.getLearningSuggestion(evaluation.id)
  if (!existing) return badRequest(ctx, 'Learning suggestion not found')
  const entries = Array.isArray(body.memory_entries)
    ? body.memory_entries
    : existing.memory_entries.filter(entry => entry.selected)
  const selected = entries.map((entry: any, index: number) => ({
    id: String(entry.id || `entry-${index + 1}`),
    type: String(entry.type || 'improvement'),
    content: String(entry.content || '').trim(),
    selected: true,
  })).filter((entry: store.LearningMemoryEntry) => entry.content)
  if (!selected.length) return badRequest(ctx, 'No memory entries selected')
  const updatedDraft = store.saveLearningSuggestion({
    ...existing,
    summary: String(body.summary ?? existing.summary),
    score_reasoning: String(body.score_reasoning ?? existing.score_reasoning),
    risk: String(body.risk ?? existing.risk),
    memory_entries: selected,
    status: 'approved',
  })
  const block = memoryBlock(evaluation, updatedDraft, selected)
  try {
    await store.appendEmployeeMemory(employee, block)
    const written = store.saveLearningSuggestion({
      ...updatedDraft,
      status: 'written',
      written_block: block,
      written_at: Date.now(),
      target_profile: employee.profile_name || employee.profile || 'default',
    })
    const nextEval = store.updateEvaluation(evaluation.id, { learning_status: 'written' })
    ctx.body = { learning_suggestion: written, evaluation: nextEval }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

export async function revertLearningSuggestion(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  const employee = store.getEmployee(evaluation.employee_id)
  const suggestion = store.getLearningSuggestion(evaluation.id)
  if (!employee || !suggestion) return badRequest(ctx, 'Learning suggestion not found')
  try {
    await store.removeEmployeeMemoryBlock(employee, `yoolee-learning:${suggestion.id}`)
    const reverted = store.saveLearningSuggestion({ ...suggestion, status: 'discarded' })
    const nextEval = store.updateEvaluation(evaluation.id, { learning_status: 'discarded' })
    ctx.body = { learning_suggestion: reverted, evaluation: nextEval }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

async function readSingleUpload(ctx: any): Promise<{ filename: string; data: Buffer } | null> {
  const contentType = ctx.get('content-type') || ''
  if (!contentType.startsWith('multipart/form-data')) {
    ctx.status = 400
    ctx.body = { error: 'Expected multipart/form-data' }
    return null
  }
  const boundary = '--' + contentType.split('boundary=')[1]
  if (!boundary || boundary === '--undefined') {
    ctx.status = 400
    ctx.body = { error: 'Missing boundary' }
    return null
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of ctx.req) {
    size += chunk.length
    if (size > 2 * 1024 * 1024) {
      ctx.status = 413
      ctx.body = { error: 'Upload too large' }
      return null
    }
    chunks.push(chunk)
  }
  const parts = splitMultipart(Buffer.concat(chunks), Buffer.from(boundary))
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd === -1) continue
    const header = part.subarray(0, headerEnd).toString('utf-8')
    const data = part.subarray(headerEnd + 4, part.length - 2)
    const filenameStarMatch = header.match(/filename\*=UTF-8''(.+)/i)
    const filenameMatch = header.match(/filename="([^"]+)"/)
    const filename = filenameStarMatch ? decodeURIComponent(filenameStarMatch[1]) : filenameMatch?.[1]
    if (filename) return { filename, data }
  }
  ctx.status = 400
  ctx.body = { error: 'No file found' }
  return null
}

function splitMultipart(raw: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  while (true) {
    const idx = raw.indexOf(boundary, start)
    if (idx === -1) break
    if (start > 0) parts.push(raw.subarray(start + 2, idx))
    start = idx + boundary.length
  }
  return parts
}

export async function scoreEvaluation(ctx: any) {
  const evaluation = store.getEvaluation(ctx.params.id)
  if (!evaluation) {
    ctx.status = 404
    ctx.body = { error: 'Evaluation not found' }
    return
  }
  const body = ctx.request.body || {}
  const score = body.manual_score === null || body.manual_score === undefined || body.manual_score === ''
    ? null
    : Number(body.manual_score)
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    return badRequest(ctx, 'Score must be between 0 and 100')
  }
  ctx.body = {
    evaluation: store.updateEvaluation(evaluation.id, {
      manual_score: score,
      manual_note: String(body.manual_note || ''),
      conclusion: String(body.conclusion || ''),
    }),
  }
}
