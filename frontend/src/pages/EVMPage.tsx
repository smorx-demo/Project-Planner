import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, RefreshCw, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { projectsApi } from '../api/projects'
import { evmApi } from '../api/evm'
import { EVMCards } from '../components/EVM/EVMCards'
import { SCurveChart } from '../components/EVM/SCurveChart'
import { ActivityEVMDrawer } from '../components/EVM/ActivityEVMDrawer'
import { TableSkeleton } from '../components/UI/Skeleton'
import type { ActivityEVM, PMSRow } from '../types'

type Tab = 'dashboard' | 'scurve' | 'pms'

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(0)}%`
}

function fmtNum(n: number | null, unit = '', dec = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(dec)}${unit ? ' ' + unit : ''}`
}

function IndexCell({ val }: { val: number | null }) {
  if (val == null) return <span className="text-gray-300">—</span>
  const bg   = val >= 1 ? 'bg-green-100 text-green-700' : val >= 0.9 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${bg}`}>{val.toFixed(2)}</span>
}

function VarCell({ val }: { val: number | null }) {
  if (val == null) return <span className="text-gray-300">—</span>
  const color = val >= 0 ? 'text-green-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{val >= 0 ? '+' : ''}{val.toFixed(1)}</span>
}

const PMS_ROW_BG: Record<string, string> = {
  DONE:     'bg-green-50',
  ON_TRACK: 'bg-white',
  SLOW:     'bg-amber-50',
  DELAYED:  'bg-red-50',
  PENDING:  'bg-white',
}

// ── Component ─────────────────────────────────────────────────────────────

export function EVMPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()

  const [tab, setTab]   = useState<Tab>('dashboard')
  const [editAct, setEditAct] = useState<ActivityEVM | null>(null)
  const [exporting, setExporting] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn:  () => projectsApi.get(projectId!),
    enabled:  !!projectId,
    staleTime: 5 * 60_000,
  })

  const { data: evm, isLoading: evmLoading, refetch: refetchEVM } = useQuery({
    queryKey: ['projectEVM', projectId],
    queryFn:  () => evmApi.getProjectEVM(projectId!),
    enabled:  !!projectId,
    staleTime: 60_000,
  })

  const { data: pmsRows = [], isLoading: pmsLoading } = useQuery({
    queryKey: ['pms', projectId],
    queryFn:  () => evmApi.getPMS(projectId!),
    enabled:  !!projectId && tab === 'pms',
    staleTime: 60_000,
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await evmApi.exportPMS(projectId!)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `pms_${project?.name ?? projectId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Common tab button style
  const tabCls = (t: Tab) =>
    `px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  // Derive unit from first activity with a bac_unit
  const unit = evm?.activities.find((a) => a.bac_unit)?.bac_unit ?? ''

  return (
    <div className="p-4 lg:p-6 max-w-full mx-auto">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">
            Earned Value{project ? ` — ${project.name}` : ''}
          </h1>
          {project && (
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              {project.customer_name && <span>Customer: <strong>{project.customer_name}</strong></span>}
              {project.po_number     && <span>PO: <strong className="font-mono">{project.po_number}</strong></span>}
              {project.part_number   && <span>Part: <strong className="font-mono">{project.part_number}</strong></span>}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { refetchEVM(); queryClient.invalidateQueries({ queryKey: ['pms', projectId] }) }}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
              text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50
              disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Export PMS
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 px-2">
          <button className={tabCls('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={tabCls('scurve')}    onClick={() => setTab('scurve')}>S-Curve</button>
          <button className={tabCls('pms')}       onClick={() => setTab('pms')}>PMS Sheet</button>
        </div>

        {/* ── DASHBOARD TAB ─────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div className="p-5 space-y-6">
            {evmLoading ? (
              <TableSkeleton rows={3} cols={6} />
            ) : !evm ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No EVM data. Open activities and set BAC + actual % to get started.
              </p>
            ) : (
              <>
                {/* KPI cards */}
                <EVMCards evm={evm} unit={unit} />

                {/* Activity EVM table */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity EVM Breakdown</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          {['Sn', 'Activity', 'BAC', 'Planned %', 'Actual %', 'SV', 'SPI', 'CPI', 'Status', ''].map((h) => (
                            <th key={h}
                              className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500
                                border-b border-gray-200 whitespace-nowrap first:rounded-tl-lg last:rounded-tr-lg">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evm.activities.map((a, idx) => (
                          <tr key={a.activity_id}
                            className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2 text-gray-400 font-mono">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px]">
                              <span className="truncate block" title={a.activity_name}>{a.activity_name}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {a.bac != null ? `${a.bac} ${a.bac_unit}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{fmtPct(a.planned_pct)}</td>
                            <td className="px-3 py-2 text-gray-700 font-medium">{fmtPct(a.actual_pct)}</td>
                            <td className="px-3 py-2"><VarCell val={a.sv} /></td>
                            <td className="px-3 py-2"><IndexCell val={a.spi} /></td>
                            <td className="px-3 py-2"><IndexCell val={a.cpi} /></td>
                            <td className="px-3 py-2">
                              <ActivityStatusChip status={a} />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => setEditAct(a)}
                                className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit EVM"
                              >
                                <Pencil size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {/* TOTAL row */}
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                          <td className="px-3 py-2 text-gray-500" colSpan={2}>TOTAL</td>
                          <td className="px-3 py-2 text-gray-700">{fmtNum(evm.total_bac, unit)}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {evm.total_bac ? fmtPct((evm.total_pv ?? 0) / evm.total_bac) : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {evm.total_bac ? fmtPct((evm.total_ev ?? 0) / evm.total_bac) : '—'}
                          </td>
                          <td className="px-3 py-2"><VarCell val={evm.sv} /></td>
                          <td className="px-3 py-2"><IndexCell val={evm.spi} /></td>
                          <td className="px-3 py-2"><IndexCell val={evm.cpi} /></td>
                          <td className="px-3 py-2" colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── S-CURVE TAB ───────────────────────────────────────────── */}
        {tab === 'scurve' && (
          <div className="p-5">
            {evmLoading ? (
              <div style={{ height: 320 }}><TableSkeleton rows={4} cols={8} /></div>
            ) : !evm ? (
              <p className="text-sm text-gray-400 text-center py-16">
                No S-curve data available.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">S-Curve — Planned vs Actual</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Cumulative Planned Value (BCWS) vs Earned Value (BCWP) over time
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>BAC: <strong className="text-gray-700">{fmtNum(evm.total_bac, unit)}</strong></span>
                    {evm.spi != null && (
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        evm.spi >= 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        SPI {evm.spi.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <SCurveChart
                  data={evm.s_curve}
                  totalBac={evm.total_bac}
                  bacUnit={unit}
                  height={320}
                />
              </>
            )}
          </div>
        )}

        {/* ── PMS SHEET TAB ─────────────────────────────────────────── */}
        {tab === 'pms' && (
          <div className="p-5">
            {/* PMS header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Progress Measurement Sheet</h3>
                {project && (
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    <p><span className="font-medium">Project:</span> {project.name}</p>
                    {project.po_number     && <p><span className="font-medium">PO:</span> {project.po_number}</p>}
                    {project.part_number   && <p><span className="font-medium">Part:</span> {project.part_number}</p>}
                    {project.customer_name && <p><span className="font-medium">Customer:</span> {project.customer_name}</p>}
                    <p><span className="font-medium">Generated:</span> {format(new Date(), 'dd-MMM-yyyy')}</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                  text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50
                  disabled:opacity-50 transition-colors shrink-0"
              >
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Export to Excel
              </button>
            </div>

            {pmsLoading ? (
              <TableSkeleton rows={5} cols={10} />
            ) : pmsRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No PMS data. Set BAC on activities to populate this sheet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      {['Sn', 'Activity', 'Group', 'BAC', 'Unit', 'Plan %', 'Actual %', 'Var %',
                        'PV', 'EV', 'AC', 'SPI', 'CPI', 'Status'].map((h) => (
                        <th key={h}
                          className="px-3 py-2.5 text-left font-semibold text-[11px] whitespace-nowrap
                            border-b border-white/20">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pmsRows.map((row) => (
                      <tr key={row.seq}
                        className={`border-b border-gray-100 ${PMS_ROW_BG[row.status] ?? 'bg-white'}`}>
                        <td className="px-3 py-2 text-gray-400 font-mono">{row.seq}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[180px]">
                          <span className="truncate block" title={row.name}>{row.name}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{row.group_type ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.bac != null ? row.bac : '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{row.bac_unit}</td>
                        <td className="px-3 py-2 text-blue-600">{fmtPct(row.planned_pct)}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{fmtPct(row.actual_pct)}</td>
                        <td className="px-3 py-2">
                          <VarPctCell planned={row.planned_pct} actual={row.actual_pct} />
                        </td>
                        <td className="px-3 py-2 text-blue-600">{row.pv != null ? row.pv.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2 text-green-600">{row.ev != null ? row.ev.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.ac != null ? row.ac.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2"><IndexCell val={row.spi} /></td>
                        <td className="px-3 py-2"><IndexCell val={row.cpi} /></td>
                        <td className="px-3 py-2">
                          <PmsStatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {/* TOTAL */}
                    {evm && (
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-3 py-2.5 text-gray-600" colSpan={3}>TOTAL</td>
                        <td className="px-3 py-2.5 text-gray-800">{evm.total_bac.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-gray-500">{unit}</td>
                        <td className="px-3 py-2.5 text-blue-600">
                          {evm.total_bac ? fmtPct(evm.total_pv / evm.total_bac) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-800">
                          {evm.total_bac ? fmtPct(evm.total_ev / evm.total_bac) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <VarCell val={evm.sv} />
                        </td>
                        <td className="px-3 py-2.5 text-blue-600">{evm.total_pv.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-green-600">{evm.total_ev.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-gray-600">{evm.total_ac.toFixed(1)}</td>
                        <td className="px-3 py-2.5"><IndexCell val={evm.spi} /></td>
                        <td className="px-3 py-2.5"><IndexCell val={evm.cpi} /></td>
                        <td className="px-3 py-2.5" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity EVM edit drawer */}
      {editAct && (
        <ActivityEVMDrawer
          activity={editAct}
          onClose={() => setEditAct(null)}
          onSaved={() => {
            refetchEVM()
            queryClient.invalidateQueries({ queryKey: ['pms', projectId] })
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ActivityStatusChip({ status }: { status: ActivityEVM }) {
  // Derive a simple status text from SPI
  if (status.spi == null) return <span className="text-gray-300 text-xs">No data</span>
  const { text, cls } =
    status.spi >= 1    ? { text: 'On Track', cls: 'bg-blue-100 text-blue-700' } :
    status.spi >= 0.9  ? { text: 'Slow',     cls: 'bg-amber-100 text-amber-700' } :
                         { text: 'Behind',   cls: 'bg-red-100 text-red-700' }
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{text}</span>
}

function VarPctCell({ planned, actual }: { planned: number | null; actual: number | null }) {
  if (planned == null || actual == null) return <span className="text-gray-300">—</span>
  const diff = (actual - planned) * 100
  const color = diff >= 0 ? 'text-green-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(0)}%</span>
}

const PMS_STATUS: Record<string, { bg: string; text: string }> = {
  DONE:     { bg: 'bg-green-100',  text: 'text-green-700' },
  ON_TRACK: { bg: 'bg-blue-100',   text: 'text-blue-700'  },
  SLOW:     { bg: 'bg-amber-100',  text: 'text-amber-700' },
  DELAYED:  { bg: 'bg-red-100',    text: 'text-red-700'   },
  PENDING:  { bg: 'bg-gray-100',   text: 'text-gray-500'  },
}

function PmsStatusBadge({ status }: { status: string }) {
  const s = PMS_STATUS[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500' }
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${s.bg} ${s.text}`}>
      {status}
    </span>
  )
}
