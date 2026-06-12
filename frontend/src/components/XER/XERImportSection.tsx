import { useRef, useState } from 'react'
import { Upload, CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { xerApi } from '../../api/xer'
import { Button } from '../UI/Button'
import { XERAuditBadge } from './XERAuditBadge'
import type { XERImportResult } from '../../types'

export function XERImportSection() {
  const [file, setFile]       = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<XERImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    setFile(f)
    setResult(null)
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    try {
      const r = await xerApi.importXER(file)
      setResult(r)
      toast.success('XER imported successfully')
    } catch (e: any) {
      toast.error(e.message ?? 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Import XER</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Import a Primavera P6 .xer file to create a new project with activities
        </p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click() }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${file ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
      >
        <Upload className="mx-auto mb-2 text-gray-400" size={28} />
        {file ? (
          <p className="text-sm font-medium text-blue-700">{file.name}</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">Drag & drop a .xer file here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Primavera P6 XER format</p>
          </>
        )}
        <input
          ref={inputRef} type="file" accept=".xer" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
        />
      </div>

      <Button loading={loading} disabled={!file} onClick={handleImport}>
        <Upload size={14} /> Import XER
      </Button>

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">Import successful</p>
              <p className="text-xs text-green-700 mt-0.5">
                <strong>{result.project.name}</strong> — {result.activities_imported} activities,{' '}
                {result.wbs_levels} WBS levels
                {result.resource_count > 0 && `, ${result.resource_count} resources`}
              </p>
            </div>
            <a
              href={`/projects/${result.project.id}`}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Open Project →
            </a>
          </div>
          <XERAuditBadge issues={result.audit_issues} />
        </div>
      )}
    </div>
  )
}
