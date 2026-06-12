import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { usersApi } from '../../api/users'
import { Button } from '../UI/Button'
import { useAppSetting } from '../../hooks/useAppSetting'
import type { UserRole } from '../../types'

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: 'ADMIN',    label: 'Admin',    desc: 'Full access including user management' },
  { value: 'MANAGER',  label: 'Manager',  desc: 'Can create projects, manage persons' },
  { value: 'OPERATOR', label: 'Operator', desc: 'Can update activity progress' },
  { value: 'VIEWER',   label: 'Viewer',   desc: 'Read-only access' },
]

interface Props {
  onClose: () => void
}

export function AddUserModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const departments = useAppSetting('departments')

  const [form, setForm] = useState({
    name:       '',
    email:      '',
    password:   '',
    role:       'OPERATOR' as UserRole,
    department: '',
    job_title:  '',
  })
  const [showPw, setShowPw] = useState(false)

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const mut = useMutation({
    mutationFn: () =>
      usersApi.register({
        name:       form.name.trim(),
        email:      form.email.trim().toLowerCase(),
        password:   form.password,
        role:       form.role,
        department: form.department || undefined,
        job_title:  form.job_title.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User account created')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create user'),
  })

  const valid =
    form.name.trim() &&
    form.email.includes('@') &&
    form.password.length >= 6 &&
    form.role

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-gray-900">Create User Account</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ramesh Iyer"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="e.g. ramesh@company.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {form.password && form.password.length < 6 && (
                <p className="text-xs text-red-500 mt-1">Password must be at least 6 characters</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Role <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      form.role === value
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={form.role === value}
                      onChange={() => set('role', value)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => set('department', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Optional —</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={form.job_title}
                  onChange={(e) => set('job_title', e.target.value)}
                  placeholder="e.g. Project Manager"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <Button
              loading={mut.isPending}
              disabled={!valid}
              onClick={() => mut.mutate()}
            >
              Create Account
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
