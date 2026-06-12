import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import apiClient from '../api/client'
import { useAuthStore } from '../store/authStore'
import type { Token } from '../types'
import { Button } from '../components/UI/Button'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // interceptor unwraps envelope → r.data is the Token object
      const { data } = await apiClient.post<Token>('/auth/login', { email, password })
      setAuth(data.access_token, data.user)
      toast.success(`Welcome, ${data.user.name}!`)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 bg-blue-600 rounded-xl mb-4">
              <Factory size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Manufacturing Planner</h1>
            <p className="text-gray-500 text-sm mt-1">Ingenious Engineering Pvt. Ltd.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoFocus
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@ingenious.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
              Sign In
            </Button>
          </form>
        </div>
        <p className="text-center text-blue-200 text-xs mt-6">
          © 2026 Ingenious Engineering Pvt. Ltd.
        </p>
      </div>
    </div>
  )
}
