import axios, { type AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuthRedirect?: boolean
  }
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Read token directly from zustand store — avoids the persist JSON wrapper overwriting localStorage
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Unwrap { success, data } envelope; handle 401
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) {
        return Promise.reject(new Error(body.error || 'Request failed'))
      }
      response.data = body.data
    }
    return response
  },
  (error: AxiosError<{ success: false; error: string; detail: unknown }>) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    const data = error.response?.data as any
    const message = data?.error || data?.detail || error.message || 'Request failed'
    const enriched = Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message)), {
      response: error.response,
    })
    return Promise.reject(enriched)
  }
)

export default apiClient
