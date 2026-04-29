import Router from '@koa/router'
import * as ctrl from '../controllers/yoolee'

export const yooleeRoutes = new Router()

yooleeRoutes.get('/api/yoolee/meta', ctrl.meta)
yooleeRoutes.get('/api/yoolee/dashboard', ctrl.dashboard)
yooleeRoutes.get('/api/yoolee/data/summary', ctrl.dataSummary)
yooleeRoutes.get('/api/yoolee/prompt-settings', ctrl.getPromptSettings)
yooleeRoutes.put('/api/yoolee/prompt-settings', ctrl.updatePromptSettings)
yooleeRoutes.post('/api/yoolee/prompt-settings/reset', ctrl.resetPromptSettings)

yooleeRoutes.get('/api/yoolee/employees', ctrl.listEmployees)
yooleeRoutes.post('/api/yoolee/employees', ctrl.createEmployee)
yooleeRoutes.put('/api/yoolee/employees/:id', ctrl.updateEmployee)
yooleeRoutes.delete('/api/yoolee/employees/:id', ctrl.deleteEmployee)
yooleeRoutes.post('/api/yoolee/employees/:id/profile', ctrl.createEmployeeProfile)
yooleeRoutes.get('/api/yoolee/employees/:id/memory', ctrl.getEmployeeMemory)
yooleeRoutes.post('/api/yoolee/employees/:id/knowledge', ctrl.uploadEmployeeKnowledge)
yooleeRoutes.delete('/api/yoolee/employees/:id/knowledge/:docId', ctrl.deleteEmployeeKnowledge)

yooleeRoutes.get('/api/yoolee/customers', ctrl.listCustomers)
yooleeRoutes.post('/api/yoolee/customers', ctrl.createCustomer)
yooleeRoutes.put('/api/yoolee/customers/:id', ctrl.updateCustomer)
yooleeRoutes.delete('/api/yoolee/customers/:id', ctrl.deleteCustomer)

yooleeRoutes.get('/api/yoolee/evaluations', ctrl.listEvaluations)
yooleeRoutes.post('/api/yoolee/evaluations/run', ctrl.runEvaluation)
yooleeRoutes.get('/api/yoolee/evaluations/:id', ctrl.getEvaluation)
yooleeRoutes.get('/api/yoolee/evaluations/:id/trace', ctrl.getEvaluationTrace)
yooleeRoutes.get('/api/yoolee/evaluations/:id/capability-summary', ctrl.getEvaluationCapabilitySummary)
yooleeRoutes.get('/api/yoolee/evaluations/:id/auto-score', ctrl.getEvaluationAutoScore)
yooleeRoutes.post('/api/yoolee/evaluations/:id/auto-score', ctrl.rerunEvaluationAutoScore)
yooleeRoutes.put('/api/yoolee/evaluations/:id/score', ctrl.scoreEvaluation)
yooleeRoutes.put('/api/yoolee/evaluations/:id/turn-scores/:round', ctrl.updateEvaluationTurnScore)
yooleeRoutes.post('/api/yoolee/evaluations/:id/learning-suggestion', ctrl.generateLearningSuggestion)
yooleeRoutes.post('/api/yoolee/evaluations/:id/learning-suggestion/commit', ctrl.commitLearningSuggestion)
yooleeRoutes.post('/api/yoolee/evaluations/:id/learning-suggestion/revert', ctrl.revertLearningSuggestion)
