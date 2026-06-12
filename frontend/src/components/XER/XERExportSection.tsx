import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { xerApi } from '../../api/xer'
import { projectsApi } from '../../api/projects'
import { Button } from '../UI/Button'

export function XERExportSection() {
  const [selectedProject, setSelectedProject] = useState('')
  const [loading, setLoading]                 = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => projectsApi.list(),
    staleTime: 30_000,
  })

  async function handleExport() {
    if (!selectedProject) return
    setLoading(true)
    try {
      const blob = await xerApi.exportXER(selectedProject)
      const proj = projects.find(p => p.id === selectedProject)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `${proj?.name ?? 'project'}.xer`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(e.message ?? 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Export XER</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Export a project schedule as a Primavera P6 .xer file
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Select Project</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— choose a project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <Button loading={loading} disabled={!selectedProject} onClick={handleExport}>
        <Download size={14} /> Export XER
      </Button>
    </div>
  )
}
