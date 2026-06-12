import apiClient from './client'
import type { User, UserRole, Token } from '../types'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  role?: UserRole
  department?: string
  job_title?: string
}

export const usersApi = {
  list: () => apiClient.get<User[]>('/users/').then((r) => r.data),

  register: (payload: RegisterPayload) =>
    apiClient.post<Token>('/auth/register', payload).then((r) => r.data),

  updateMe: (payload: { name?: string; email?: string; department?: string; job_title?: string }) =>
    apiClient.put<User>('/users/me', payload).then((r) => r.data),

  changePassword: (payload: { old_password: string; new_password: string }) =>
    apiClient.put('/users/me/password', payload).then((r) => r.data),

  updateUser: (id: string, payload: { role?: UserRole; is_active?: boolean }) =>
    apiClient.patch<User>(`/users/${id}`, payload).then((r) => r.data),
}
