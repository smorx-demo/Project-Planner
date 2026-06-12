import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { evmApi } from '../../api/evm'
import type { PMSRow } from '../../types'

const STATUS_COLOR: Record<string, string> = {
  DONE:     'bg-green-100 text-green-700',
  ON_TRACK: 'bg-blue-100 text-blue-700',
  SLOW:     'bg-amber-100 text-amber-700',
  DELAYED:  'bg-red-100 text-red-700',
  PENDING:  'bg-gray-100 text-gray-500',
}

function fmt(n: number | null, dec = 2): string {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(0)}%`
}

interface Props {
  projectId: string
  rows: PMSRow[]
}

export function PMSTable({ projectId, rows }: Props) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await evmApi.exportPMS(projectId)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `pms_${projectId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PMS export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Progress Measurement Sheet</h3>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
            text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50
            disabled:opacity-50 transition-colors"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Export XLSX
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No activities with EVM data. Set BAC on activities to populate this table.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {['#', 'Activity', 'Dept', 'Plan Start', 'Plan End', 'BAC', 'Planned%', 'Actual%',
                  'PV', 'EV', 'AC', 'SPI', 'CPI', 'Status'].map((h) => (
                  <th key={h} className="text-left px-2 py-2 text-[11px] font-semibold text-gray-500
                    border-b border-gray-200 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.seq} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-2 py-2 text-gray-400">{row.seq}</td>
                  <td className="px-2 py-2 font-medium text-gray-800 max-w-[180px] truncate" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-2 py-2 text-gray-500">{row.group_type ?? '—'}</td>
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{row.plan_start}</td>
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{row.plan_end}</td>
                  <td className="px-2 py-2 text-gray-700">
                    {row.bac != null ? `${row.bac} ${row.bac_unit}` : '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{fmtPct(row.planned_pct)}</td>
                  <td className="px-2 py-2 text-gray-600">{fmtPct(row.actual_pct)}</td>
                  <td className="px-2 py-2 text-blue-600">{fmt(row.pv)}</td>
                  <td className="px-2 py-2 text-green-600">{fmt(row.ev)}</td>
                  <td className="px-2 py-2 text-gray-600">{fmt(row.ac)}</td>
                  <td className={`px-2 py-2 font-semibold ${
                    row.spi == null ? 'text-gray-400' :
                    row.spi >= 1 ? 'text-green-600' : row.spi >= 0.8 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {fmt(row.spi)}
                  </td>
                  <td className={`px-2 py-2 font-semibold ${
                    row.cpi == null ? 'text-gray-400' :
                    row.cpi >= 1 ? 'text-green-600' : row.cpi >= 0.8 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {fmt(row.cpi)}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
