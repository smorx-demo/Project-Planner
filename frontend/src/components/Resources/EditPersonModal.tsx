import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, XCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { personsApi } from '../../api/persons'
import { Button } from '../UI/Button'
import { useAppSetting } from '../../hooks/useAppSetting'
import type { Person } from '../../types'

interface Props {
  person: Person
  onClose: () => void
}

export function EditPersonModal({ person, onClose }: Props) {
  const queryClient = useQueryClient()
  const departments  = useAppSetting('departments')
  const designations = useAppSetting('designations')

  const [form, setForm] = useState({
    name: person.name,
    employee_id: person.employee_id,
    department: person.department,
    role: person.role,
    max_concurrent_tasks: person.max_concurrent_tasks,
  })
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>(person.skills ?? [])

  const set = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }))

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.includes(s)) setSkills((prev) => [...prev, s])
    setSkillInput('')
  }

  const removeSkill = (s: string) => setSkills((prev) => prev.filter((x) => x !== s))

  const mut = useMutation({
    mutationFn: () =>
      personsApi.update(person.id, {
        name: form.name.trim(),
        employee_id: form.employee_id.trim(),
        department: form.department,
        role: form.role.trim(),
        max_concurrent_tasks: form.max_concurrent_tasks,
        skills,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      toast.success('Person updated')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update person'),
  })

  const valid = form.name.trim() && form.employee_id.trim() && form.department && form.role.trim()

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Edit Person</h2>
              <p className="text-xs text-gray-400 mt-0.5">{person.employee_id}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Employee ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.employee_id}
                  onChange={(e) => set('employee_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.department}
                  onChange={(e) => set('department', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Select —</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Role / Designation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  list="designation-options-edit"
                  value={form.role}
                  onChange={(e) => set('role', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="designation-options-edit">
                  {designations.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Max Concurrent Tasks
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.max_concurrent_tasks}
                onChange={(e) => set('max_concurrent_tasks', parseInt(e.target.value) || 1)}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Skills</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                  placeholder="Type a skill and press Enter"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                >
                  <Plus size={16} />
                </button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                    >
                      {s}
                      <button onClick={() => removeSkill(s)} className="text-blue-400 hover:text-blue-600">
                        <XCircle size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
