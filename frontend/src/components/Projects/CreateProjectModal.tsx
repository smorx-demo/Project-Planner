import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { projectsApi } from '../../api/projects'
import { Button } from '../UI/Button'

interface Props {
  onClose: () => void
}

export function CreateProjectModal({ onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: '',
    customer_name: '',
    po_number: '',
    part_number: '',
    product_description: '',
    scope_of_supply: '',
  })

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const createMut = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: form.name.trim(),
        customer_name: form.customer_name.trim() || undefined,
        po_number: form.po_number.trim() || undefined,
        part_number: form.part_number.trim() || undefined,
        product_description: form.product_description.trim() || undefined,
        scope_of_supply: form.scope_of_supply.trim() || undefined,
        status: 'ACTIVE',
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project created')
      onClose()
      navigate(`/projects/${project.id}`)
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create project'),
  })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">New Project</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-5 space-y-4">
            {/* Project Name — required */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Front Transportation Support Assembly LH"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Customer + PO — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => set('customer_name', e.target.value)}
                  placeholder="e.g. TASL"
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
                  placeholder="e.g. 5100068763"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Part number */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Part Number</label>
              <input
                type="text"
                value={form.part_number}
                onChange={(e) => set('part_number', e.target.value)}
                placeholder="e.g. 109300009030"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Product description */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Product Description</label>
              <input
                type="text"
                value={form.product_description}
                onChange={(e) => set('product_description', e.target.value)}
                placeholder="e.g. Front Transportation Support Assembly LH"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Scope of supply */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Scope of Supply</label>
              <input
                type="text"
                value={form.scope_of_supply}
                onChange={(e) => set('scope_of_supply', e.target.value)}
                placeholder="e.g. Blasted, Painted, Assembled, Packed"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <Button
              loading={createMut.isPending}
              disabled={!form.name.trim()}
              onClick={() => createMut.mutate()}
            >
              Create Project
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
