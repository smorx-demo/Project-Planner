import apiClient from './client'

export interface PredictionResponse {
  prediction: string
  prediction_type: string
  tokens_used: number
}

export interface InsightResponse {
  insight: string
  insight_type: string
  tokens_used: number
}

export interface QuickSummaryResponse {
  summary: string
  cached: boolean
}

const AI_TIMEOUT = 90_000  // 90 s — LLM calls can take 30–60 s

export const aiApi = {
  async predict(projectId: string, predictionType: string): Promise<PredictionResponse> {
    const res = await apiClient.post('/ai/predict', {
      project_id: projectId,
      prediction_type: predictionType,
    }, { timeout: AI_TIMEOUT })
    return res.data
  },

  async personInsight(personId: string, insightType: string): Promise<InsightResponse> {
    const res = await apiClient.post('/ai/person-insight', {
      person_id: personId,
      insight_type: insightType,
    }, { timeout: AI_TIMEOUT })
    return res.data
  },

  async quickSummary(projectId: string): Promise<QuickSummaryResponse> {
    const res = await apiClient.get(`/ai/quick-summary/${projectId}`, { timeout: AI_TIMEOUT })
    return res.data
  },
}
