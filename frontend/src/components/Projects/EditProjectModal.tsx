import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, UserPlus, Trash2, Eye } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { projectsApi } from '../../api/projects'
import { usersApi } from '../../api/users'
import { Button } from '../UI/Button'
import type { Project, ProjectStatus, User } from '../../types'

interface Props {
  project: Project
  onClose: () => void
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'ON_HOLD',   label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function EditProjectModal({ project, onClose }: Props) {
  const queryClient = useQueryClient()
  const [showAccess, setShowAccess] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [form, setForm] = useState({
    name:                project.name,
    customer_name:       project.customer_name       ?? '',
    po_number:           project.po_number           ?? '',
    part_number:         project.part_number         ?? '',
    product_description: project.product_description ?? '',
    scope_of_supply:     project.scope_of_supply     ?? '',
    status:              project.status,
  })

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const updateMut = useMutation({
    mutationFn: () =>
      projectsApi.update(project.id, {
        name:                form.name.trim(),
        customer_name:       form.customer_name.trim()       || undefined,
        po_number:           form.po_number.trim()           || undefined,
        part_number:         form.part_number.trim()         || undefined,
        product_description: form.product_description.trim() || undefined,
        scope_of_supply:     form.scope_of_supply.trim()     || undefined,
        status:              form.status,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      toast.success('Project updated')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update project'),
  })

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', project.id],
    queryFn: () => projectsApi.getMembers(project.id),
    enabled: showAccess,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: showAccess,
  })

  const viewerUsers = (allUsers as User[]).filter(
    (u) => u.role === 'VIEWER' && u.is_active && !members.some((m) => m.user_id === u.id)
  )

  const addMemberMut = useMutation({
    mutationFn: (userId: string) => projectsApi.addMember(project.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', project.id] })
      setSelectedUserId('')
      toast.success('Access granted')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add member'),
  })

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(project.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', project.id] })
      toast.success('Access revoked')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove member'),
  })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-gray-900">Edit Project</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => set('customer_name', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PO Number</label>
                <input
                  type="text"
                  value={form.po_number}
                  onChange={(e) => set('po_number', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Part Number</label>
              <input
                type="text"
                value={form.part_number}
                onChange={(e) => set('part_number', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Product Description</label>
              <input
                type="text"
                value={form.product_description}
                onChange={(e) => set('product_description', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Scope of Supply</label>
              <input
                type="text"
                value={form.scope_of_supply}
                onChange={(e) => set('scope_of_supply', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Viewer Access */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAccess((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium
                  text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Eye size={14} className="text-gray-400" />
                  Viewer Access
                  {members.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full font-semibold">
                      {members.length}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">{showAccess ? '▲' : '▼'}</span>
              </button>

              {showAccess && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  <p className="text-xs text-gray-500">
                    Users with the <strong>Viewer</strong> role can only access projects they are added to here.
                  </p>

                  {/* Add member */}
                  <div className="flex gap-2">
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Add a viewer —</option>
                      {viewerUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedUserId || addMemberMut.isPending}
                      onClick={() => selectedUserId && addMemberMut.mutate(selectedUserId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white
                        rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                      <UserPlus size={13} /> Add
                    </button>
                  </div>

                  {/* Current members */}
                  {members.length > 0 ? (
                    <ul className="space-y-1">
                      {members.map((m) => (
                        <li
                          key={m.user_id}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg
                            hover:bg-gray-50 group"
                        >
                          <div>
                            <span className="text-sm text-gray-800">{m.name}</span>
                            <span className="text-xs text-gray-400 ml-2">{m.email}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMemberMut.mutate(m.user_id)}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100
                              transition-all"
                            title="Remove access"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No viewers added yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <Button
              loading={updateMut.isPending}
              disabled={!form.name.trim()}
              onClick={() => updateMut.mutate()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
