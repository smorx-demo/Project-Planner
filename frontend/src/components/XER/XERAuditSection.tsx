import { useRef, useState } from 'react'
import { FileSearch, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { xerApi } from '../../api/xer'
import { Button } from '../UI/Button'
import type { XERAuditResult, AuditCounts } from '../../types'

const SEV_STYLE: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-600',
}

const COUNT_CHIPS: [keyof AuditCounts, string, string][] = [
  ['open_ends',       'Open Ends',       'bg-red-100 text-red-700'],
  ['missing_logic',   'Missing Logic',   'bg-orange-100 text-orange-700'],
  ['negative_float',  'Negative Float',  'bg-red-100 text-red-700'],
  ['constraints',     'Constraints',     'bg-amber-100 text-amber-700'],
  ['out_of_sequence', 'Out of Sequence', 'bg-purple-100 text-purple-700'],
]

export function XERAuditSection() {
  const [file, setFile]             = useState<File | null>(null)
  const [loading, setLoading]       = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [result, setResult]         = useState<XERAuditResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    setFile(f)
    setResult(null)
  }

  async function handleAudit() {
    if (!file) return
    setLoading(true)
    try {
      const r = await xerApi.auditXER(file)
      setResult(r)
    } catch (e: any) {
      toast.error(e.message ?? 'Audit failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportReport() {
    if (!result || !file) return
    setExporting(true)
    try {
      const blob = await xerApi.exportAuditReport(
        file.name.replace(/\.xer$/i, ''),
        result.total_tasks,
        result.issues,
        result.counts,
      )
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url
      a.download = `audit_${file.name.replace(/\.xer$/i, '')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(e.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Schedule Audit</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Audit any .xer file for scheduling best-practice issues
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
        <FileSearch className="mx-auto mb-2 text-gray-400" size={28} />
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

      <Button loading={loading} disabled={!file} onClick={handleAudit}>
        <FileSearch size={14} /> Run Audit
      </Button>

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{result.total_tasks} tasks audited</p>
            <Button variant="secondary" size="sm" loading={exporting} onClick={handleExportReport}>
              <Download size={13} /> Export Report
            </Button>
          </div>

          {/* Count chips */}
          <div className="flex flex-wrap gap-2">
            {COUNT_CHIPS.map(([key, label, cls]) => (
              <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${cls}`}>
                <span className="font-bold">{result.counts[key]}</span>
                {label}
              </div>
            ))}
          </div>

          {/* Issues table */}
          {result.issues.length === 0 ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-sm font-medium text-green-700">No issues found — schedule looks clean!</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 font-semibold text-gray-600">Severity</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600">Type</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600">Activity</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.issues.map((issue, i) => (
                    <tr key={i} className="bg-white hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[issue.severity]}`}>
                          {issue.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{issue.type}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{issue.activity}</td>
                      <td className="px-3 py-2 text-gray-500">{issue.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
