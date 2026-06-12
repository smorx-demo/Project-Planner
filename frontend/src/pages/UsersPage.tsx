import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus, Shield, UserX, UserCheck, KeyRound } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { usersApi } from '../api/users'
import { AddUserModal } from '../components/Users/AddUserModal'
import { useAuthStore } from '../store/authStore'
import type { User, UserRole } from '../types'

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN:    'bg-purple-100 text-purple-700',
  MANAGER:  'bg-blue-100 text-blue-700',
  OPERATOR: 'bg-green-100 text-green-700',
  VIEWER:   'bg-gray-100 text-gray-600',
}

const ALL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLORS[role]}`}>
      {role}
    </span>
  )
}

export function UsersPage() {
  const { user: me } = useAuthStore()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingRole, setEditingRole] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { role?: UserRole; is_active?: boolean } }) =>
      usersApi.updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated')
      setEditingRole(null)
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update user'),
  })

  const filtered = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage login accounts and roles</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium
            rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={15} />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                User
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Department
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Role
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Shield size={32} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-gray-400 text-sm">No users found</p>
                </td>
              </tr>
            ) : (
              filtered.map((u: User) => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center
                        text-white text-xs font-bold shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {u.name}
                          {u.id === me?.id && (
                            <span className="ml-1.5 text-[10px] text-blue-500 font-semibold">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.department || '—'}
                    {u.job_title && (
                      <p className="text-gray-400">{u.job_title}</p>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {editingRole === u.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue={u.role}
                          autoFocus
                          onChange={(e) =>
                            updateMut.mutate({ id: u.id, payload: { role: e.target.value as UserRole } })
                          }
                          onBlur={() => setEditingRole(null)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs
                            focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <button
                        onClick={() => u.id !== me?.id && setEditingRole(u.id)}
                        className={`group flex items-center gap-1.5 ${u.id === me?.id ? 'cursor-default' : 'cursor-pointer'}`}
                        title={u.id === me?.id ? "Can't change your own role" : 'Click to change role'}
                      >
                        <RoleBadge role={u.role} />
                        {u.id !== me?.id && (
                          <KeyRound size={11} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                        )}
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      u.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right">
                    {u.id !== me?.id && (
                      <button
                        onClick={() =>
                          updateMut.mutate({ id: u.id, payload: { is_active: !u.is_active } })
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium
                          rounded-lg border transition-colors ${
                          u.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {u.is_active ? (
                          <><UserX size={12} /> Deactivate</>
                        ) : (
                          <><UserCheck size={12} /> Activate</>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        {filtered.length} user{filtered.length !== 1 ? 's' : ''} · Click a role badge to change it
      </p>

      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
