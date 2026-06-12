import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Plus, Pencil, Check, X, Trash2, Send, Loader2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { usersApi } from '../api/users'
import { personsApi } from '../api/persons'
import { appSettingsApi } from '../api/appSettings'
import { Button } from '../components/UI/Button'
import { RulesSettings } from '../components/Notifications/RulesSettings'
import { notificationsApi } from '../api/notifications'
import { XERImportSection } from '../components/XER/XERImportSection'
import { XERExportSection } from '../components/XER/XERExportSection'
import { XERAuditSection }  from '../components/XER/XERAuditSection'
import type { Person, UserRole } from '../types'

type Tab = 'profile' | 'alerts' | 'people' | 'xer' | 'users' | 'config'

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']

// ─── Profile tab ──────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    department: user?.department ?? '',
    job_title: user?.job_title ?? '',
  })
  const [pw, setPw] = useState({ old: '', new_: '', confirm: '' })

  const profileMut = useMutation({
    mutationFn: () => usersApi.updateMe({
      name: form.name,
      email: form.email,
      department: form.department || undefined,
      job_title: form.job_title || undefined,
    }),
    onSuccess: (updated) => {
      updateUser(updated)
      toast.success('Profile saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const pwMut = useMutation({
    mutationFn: () => usersApi.changePassword({ old_password: pw.old, new_password: pw.new_ }),
    onSuccess: () => {
      setPw({ old: '', new_: '', confirm: '' })
      toast.success('Password changed')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submitPw() {
    if (pw.new_.length < 6) return toast.error('New password must be at least 6 characters')
    if (pw.new_ !== pw.confirm) return toast.error('Passwords do not match')
    pwMut.mutate()
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* Profile form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Profile Information</h3>

        {[
          { label: 'Name', key: 'name', type: 'text' },
          { label: 'Email', key: 'email', type: 'email' },
          { label: 'Department', key: 'department', type: 'text' },
          { label: 'Job Title', key: 'job_title', type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}

        <Button loading={profileMut.isPending} onClick={() => profileMut.mutate()}>
          Save Changes
        </Button>
      </div>

      {/* Password change */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Change Password</h3>
        {[
          { label: 'Current Password', key: 'old', value: pw.old },
          { label: 'New Password', key: 'new_', value: pw.new_ },
          { label: 'Confirm New Password', key: 'confirm', value: pw.confirm },
        ].map(({ label, key, value }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <Button loading={pwMut.isPending} onClick={submitPw}>
          Change Password
        </Button>
      </div>
    </div>
  )
}

// ─── People tab ───────────────────────────────────────────────────────────────
function PeopleTab() {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Person>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', employee_id: '', department: '', role: '', skills: '',
    max_concurrent_tasks: 3,
  })

  const { data: persons = [], isLoading } = useQuery({
    queryKey: ['persons-all'],
    queryFn: () => personsApi.list(false),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Person> }) =>
      personsApi.update(id, data),
    onSuccess: () => {
      toast.success('Person updated')
      qc.invalidateQueries({ queryKey: ['persons-all'] })
      setEditId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createMut = useMutation({
    mutationFn: () =>
      personsApi.create({
        ...addForm,
        skills: addForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
        is_active: true,
        avg_delay_days: 0,
        performance_score: 100,
        on_time_rate: 100,
        leave_schedule: [],
      } as any),
    onSuccess: () => {
      toast.success('Person created')
      qc.invalidateQueries({ queryKey: ['persons-all'] })
      setShowAdd(false)
      setAddForm({ name: '', employee_id: '', department: '', role: '', skills: '', max_concurrent_tasks: 3 })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      personsApi.update(id, { is_active: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['persons-all'] }),
  })

  function startEdit(p: Person) {
    setEditId(p.id)
    setEditForm({ name: p.name, department: p.department, role: p.role, max_concurrent_tasks: p.max_concurrent_tasks })
  }

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{persons.length} team members</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Person
        </Button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">Add Team Member</p>
          </div>
          {[
            { label: 'Full Name', key: 'name' },
            { label: 'Employee ID', key: 'employee_id' },
            { label: 'Department', key: 'department' },
            { label: 'Role / Title', key: 'role' },
            { label: 'Skills (comma-separated)', key: 'skills' },
          ].map(({ label, key }) => (
            <div key={key} className={key === 'skills' ? 'col-span-2' : ''}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type="text"
                value={addForm[key as keyof typeof addForm] as string}
                onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Concurrent Tasks</label>
            <input
              type="number" min={1} max={10}
              value={addForm.max_concurrent_tasks}
              onChange={(e) => setAddForm((f) => ({ ...f, max_concurrent_tasks: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 flex gap-2">
            <Button size="sm" loading={createMut.isPending} onClick={() => createMut.mutate()}>
              Create
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Max Tasks</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {persons.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                {editId === p.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={editForm.department ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={editForm.role ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min={1} value={editForm.max_concurrent_tasks ?? 3}
                        onChange={(e) => setEditForm((f) => ({ ...f, max_concurrent_tasks: Number(e.target.value) }))}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-16" />
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 flex gap-1">
                      <button onClick={() => updateMut.mutate({ id: p.id, data: editForm })}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14} /></button>
                      <button onClick={() => setEditId(null)}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.department}</td>
                    <td className="px-4 py-3 text-gray-500">{p.role}</td>
                    <td className="px-4 py-3 text-gray-500 text-center">{p.max_concurrent_tasks}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(p)} className="p-1 text-gray-400 hover:text-blue-600 rounded">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                          className={`text-xs px-2 py-0.5 rounded border ${p.is_active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Users tab (admin) ────────────────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list(),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: UserRole; is_active?: boolean } }) =>
      usersApi.updateUser(id, data),
    onSuccess: () => {
      toast.success('User updated')
      qc.invalidateQueries({ queryKey: ['users-list'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
              <td className="px-4 py-3">
                <select
                  value={u.role}
                  onChange={(e) => updateMut.mutate({ id: u.id, data: { role: e.target.value as UserRole } })}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => updateMut.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                  className={`text-xs px-2 py-0.5 rounded border ${u.is_active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                >
                  {u.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Config tab (admin) ───────────────────────────────────────────────────────
function ListEditor({ settingKey, label, description }: { settingKey: string; label: string; description: string }) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['setting', settingKey],
    queryFn: () => appSettingsApi.get(settingKey),
  })

  const saveMut = useMutation({
    mutationFn: (next: string[]) => appSettingsApi.update(settingKey, next),
    onSuccess: (updated) => {
      qc.setQueryData(['setting', settingKey], updated)
      toast.success(`${label} saved`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const add = () => {
    const v = input.trim()
    if (!v) return
    if (items.includes(v)) { toast.error('Already exists'); return }
    saveMut.mutate([...items, v])
    setInput('')
  }

  const remove = (item: string) => {
    saveMut.mutate(items.filter((x) => x !== item))
  }

  if (isLoading) return <div className="text-gray-400 text-sm py-4">Loading…</div>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">{label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}…`}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button size="sm" onClick={add} loading={saveMut.isPending} disabled={!input.trim()}>
          <Plus size={14} /> Add
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No items yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 group">
              <span className="text-sm text-gray-800">{item}</span>
              <button
                onClick={() => remove(item)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ConfigTab() {
  return (
    <div className="space-y-6 max-w-lg">
      <ListEditor
        settingKey="departments"
        label="Departments"
        description="Used in person profiles, user accounts, and activity group dropdowns."
      />
      <ListEditor
        settingKey="designations"
        label="Designations"
        description="Suggested role titles when adding or editing persons. You can still type a custom value."
      />
    </div>
  )
}

// ─── Alerts tab ───────────────────────────────────────────────────────────────
function AlertsTab() {
  const testMut = useMutation({
    mutationFn: notificationsApi.sendTestEmail,
    onSuccess: (d) => toast.success(`Test email sent to ${d.sent_to}`),
    onError: (e: Error) => toast.error(e.message || 'Failed to send test email'),
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Alert Rules</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Configure when and how you receive notifications about project activities.
          </p>
        </div>
        <button
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
            bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors
            disabled:opacity-50 shrink-0"
        >
          {testMut.isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />}
          Send Test Email
        </button>
      </div>
      <RulesSettings />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'alerts',  label: 'Alerts' },
    { id: 'people',  label: 'People' },
    { id: 'xer',     label: 'XER / P6' },
    { id: 'users',   label: 'Users',   adminOnly: true },
    { id: 'config',  label: 'Config',  adminOnly: true },
  ]

  const visibleTabs = tabs.filter((t) => !t.adminOnly || user?.role === 'ADMIN')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your profile, alerts, and team</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
          {visibleTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'profile' && <ProfileTab />}
        {tab === 'alerts'  && <AlertsTab />}
        {tab === 'people'  && <PeopleTab />}
        {tab === 'xer'     && (
          <div className="space-y-6 max-w-3xl">
            <XERImportSection />
            <XERExportSection />
            <XERAuditSection />
          </div>
        )}
        {tab === 'users'   && user?.role === 'ADMIN' && <UsersTab />}
        {tab === 'config'  && user?.role === 'ADMIN' && <ConfigTab />}
      </div>
    </div>
  )
}
