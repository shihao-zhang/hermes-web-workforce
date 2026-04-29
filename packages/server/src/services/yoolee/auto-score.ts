import * as store from './store'
import { generateLearningReviewPrompt } from './runner'

const MAX_CONCURRENCY = 3
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1200

const activeJobs = new Set<string>()

type ScoreOutput = {
  score: 0 | 1
  analysis: string
  reason: string
  violated_rubric: string
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '')
}

function customerProfile(customer: store.YooleeCustomer | null) {
  if (!customer) return ''
  return {
    name: customer.name,
    industry: customer.industry,
    need: customer.need,
    budget: customer.budget,
    concerns: customer.concerns,
    stage: customer.stage,
    communication_style: customer.communication_style,
    opening_message: customer.opening_message,
  }
}

function metadataForEvaluation(
  evaluation: store.YooleeEvaluation,
  employee: store.YooleeEmployee | null,
  customer: store.YooleeCustomer | null,
) {
  return JSON.stringify({
    evaluation_id: evaluation.id,
    employee: employee ? {
      name: employee.name,
      role: employee.role,
      goal: employee.goal,
      system_prompt: employee.system_prompt,
      skills: employee.skills,
      knowledge_docs: employee.knowledge_docs.map(doc => ({ name: doc.name, path: doc.path })),
      memory_mode: employee.memory_mode,
    } : {
      name: evaluation.employee_name,
    },
    customer: customerProfile(customer) || { name: evaluation.customer_name },
    context: evaluation.context,
    stop_keywords: evaluation.stop_keywords,
    max_rounds: evaluation.max_rounds,
  }, null, 2)
}

function dialogHistoryBefore(messages: store.EvaluationMessage[], index: number) {
  return JSON.stringify(
    messages
      .slice(0, index)
      .filter(message => message.speaker === 'customer' || message.speaker === 'employee')
      .map(message => ({
        role: message.speaker === 'customer' ? 'user' : 'assistant',
        content: message.content,
      })),
    null,
    2,
  )
}

function lastCustomerQueryBefore(messages: store.EvaluationMessage[], index: number) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].speaker === 'customer') return messages[i].content
  }
  return ''
}

function employeeTurns(evaluation: store.YooleeEvaluation) {
  return evaluation.messages
    .map((message, index) => ({ message, index }))
    .filter(item => item.message.speaker === 'employee' && item.message.content.trim())
}

function cleanJsonOutput(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('评分模型未返回 JSON')
  return trimmed.slice(start, end + 1)
}

function parseScoreOutput(raw: string): ScoreOutput {
  const parsed = JSON.parse(cleanJsonOutput(raw)) as Partial<ScoreOutput>
  const score = Number(parsed.score) === 1 ? 1 : 0
  return {
    score,
    analysis: String(parsed.analysis || '').slice(0, 300),
    reason: String(parsed.reason || '').slice(0, 120),
    violated_rubric: String(parsed.violated_rubric || '').slice(0, 120),
  }
}

function scorePrompt(params: {
  evaluation: store.YooleeEvaluation
  employee: store.YooleeEmployee | null
  customer: store.YooleeCustomer | null
  turn: { message: store.EvaluationMessage; index: number }
}) {
  const settings = store.getPromptSettings()
  return renderTemplate(settings.auto_score_prompt_template, {
    metadata: metadataForEvaluation(params.evaluation, params.employee, params.customer),
    dialog_history: dialogHistoryBefore(params.evaluation.messages, params.turn.index),
    user_query: lastCustomerQueryBefore(params.evaluation.messages, params.turn.index),
    actual_output: params.turn.message.content,
  })
}

async function scoreSingleTurn(params: {
  evaluation: store.YooleeEvaluation
  employee: store.YooleeEmployee | null
  customer: store.YooleeCustomer | null
  turn: { message: store.EvaluationMessage; index: number }
}) {
  let lastError = ''
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const raw = await generateLearningReviewPrompt(scorePrompt(params), params.employee?.model || undefined)
      return parseScoreOutput(raw)
    } catch (err: any) {
      lastError = err?.message || String(err)
      if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS)
    }
  }
  throw new Error(lastError || '自动评分重试次数用尽')
}

async function runInChunks<T>(items: T[], worker: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += MAX_CONCURRENCY) {
    await Promise.all(items.slice(i, i + MAX_CONCURRENCY).map(worker))
  }
}

function summarizeTurnScores(turnScores: store.YooleeTurnScore[]) {
  const scored = turnScores.filter(item => item.auto_score === 0 || item.auto_score === 1)
  const passCount = scored.filter(item => item.auto_score === 1).length
  const errorCount = turnScores.filter(item => item.auto_error).length
  const failReasons = scored
    .filter(item => item.auto_score === 0)
    .slice(0, 5)
    .map(item => `第${item.round}轮：${item.auto_reason || item.violated_rubric || '未通过'}`)
  return {
    passCount,
    total: scored.length,
    errorCount,
    score: scored.length ? Math.round((passCount / scored.length) * 100) : null,
    summary: failReasons.length ? failReasons.join('；') : (scored.length ? '所有已评分员工轮次均通过。' : '没有可用自动评分结果。'),
  }
}

export async function runAutoScoreForEvaluation(evaluationId: string) {
  let evaluation = store.getEvaluation(evaluationId)
  if (!evaluation) throw new Error('Evaluation not found')
  if (evaluation.status !== 'completed') {
    return {
      evaluation,
      turn_scores: store.listTurnScores(evaluationId),
    }
  }

  const employee = store.getEmployee(evaluation.employee_id)
  const customer = store.getCustomer(evaluation.customer_id)
  const turns = employeeTurns(evaluation)
  store.resetAutoTurnScores(evaluationId)
  evaluation = store.updateEvaluation(evaluationId, {
    auto_score_status: 'running',
    auto_score: null,
    auto_score_pass_count: 0,
    auto_score_total: 0,
    auto_score_error_count: 0,
    auto_score_summary: '',
  }) || evaluation

  if (!turns.length) {
    const failed = store.updateEvaluation(evaluationId, {
      auto_score_status: 'failed',
      auto_score: null,
      auto_score_pass_count: 0,
      auto_score_total: 0,
      auto_score_error_count: 0,
      auto_score_summary: '没有可评分的 AI员工回复。',
    }) || evaluation
    return { evaluation: failed, turn_scores: [] }
  }

  await runInChunks(turns, async turn => {
    store.saveTurnScore({ evaluation_id: evaluationId, round: turn.message.round })
    try {
      const result = await scoreSingleTurn({ evaluation, employee, customer, turn })
      store.saveTurnScore({
        evaluation_id: evaluationId,
        round: turn.message.round,
        auto_score: result.score,
        auto_analysis: result.analysis,
        auto_reason: result.reason,
        violated_rubric: result.violated_rubric,
        auto_error: '',
      })
    } catch (err: any) {
      store.saveTurnScore({
        evaluation_id: evaluationId,
        round: turn.message.round,
        auto_error: err?.message || String(err),
      })
    }
  })

  const turnScores = store.listTurnScores(evaluationId)
  const summary = summarizeTurnScores(turnScores)
  const status: store.AutoScoreStatus = summary.total > 0 ? 'completed' : 'failed'
  const nextEvaluation = store.updateEvaluation(evaluationId, {
    auto_score_status: status,
    auto_score: summary.score,
    auto_score_pass_count: summary.passCount,
    auto_score_total: summary.total,
    auto_score_error_count: summary.errorCount,
    auto_score_summary: summary.summary,
  }) || evaluation
  return {
    evaluation: nextEvaluation,
    turn_scores: store.listTurnScores(evaluationId),
  }
}

export function queueAutoScore(evaluationId: string) {
  const evaluation = store.getEvaluation(evaluationId)
  if (!evaluation || evaluation.status !== 'completed') return evaluation
  if (activeJobs.has(evaluationId) || evaluation.auto_score_status === 'running' || evaluation.auto_score_status === 'queued') {
    return evaluation
  }
  const queued = store.updateEvaluation(evaluationId, { auto_score_status: 'queued' }) || evaluation
  activeJobs.add(evaluationId)
  setTimeout(() => {
    runAutoScoreForEvaluation(evaluationId)
      .catch(err => {
        store.updateEvaluation(evaluationId, {
          auto_score_status: 'failed',
          auto_score_error_count: 1,
          auto_score_summary: err?.message || String(err),
        })
      })
      .finally(() => activeJobs.delete(evaluationId))
  }, 0)
  return queued
}

export function getAutoScore(evaluationId: string) {
  return {
    evaluation: store.getEvaluation(evaluationId),
    turn_scores: store.listTurnScores(evaluationId),
  }
}

export function updateManualTurnScore(evaluationId: string, round: number, input: { manual_score: unknown; manual_note?: string }) {
  const score = input.manual_score === null || input.manual_score === undefined || input.manual_score === ''
    ? null
    : Number(input.manual_score) === 1 ? 1 : 0
  return store.saveTurnScore({
    evaluation_id: evaluationId,
    round,
    manual_score: score,
    manual_note: String(input.manual_note || ''),
  })
}
