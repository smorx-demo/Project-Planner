import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { wbsApi } from '../../api/wbs'
import { Button } from '../UI/Button'
import type { WBSColor } from '../../types'

interface WBSColorSettingsProps {
  projectId: string
}

export function WBSColorSettings({ projectId }: WBSColorSettingsProps) {
  const qc = useQueryClient()
  const [colors, setColors] = useState<WBSColor[]>([])

  const { data: serverColors, isLoading } = useQuery({
    queryKey: ['wbs-colors', projectId],
    queryFn:  () => wbsApi.getColors(projectId),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (serverColors) setColors(serverColors)
  }, [serverColors])

  const saveMut = useMutation({
    mutationFn: () => wbsApi.setColors(projectId, colors),
    onSuccess: (updated) => {
      qc.setQueryData(['wbs-colors', projectId], updated)
      toast.success('WBS colors saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function updateColor(index: number, field: 'color_hex' | 'background_hex', value: string) {
    setColors((cs) => cs.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  function resetDefaults() {
    const defaults: WBSColor[] = [
      { level: 1, color_hex: '#1F4E79', background_hex: '#DEEAF1' },
      { level: 2, color_hex: '#375623', background_hex: '#E2EFDA' },
      { level: 3, color_hex: '#7F5200', background_hex: '#FFF2CC' },
      { level: 4, color_hex: '#833C00', background_hex: '#FCE4D6' },
      { level: 5, color_hex: '#3F3151', background_hex: '#EDEBF7' },
      { level: 6, color_hex: '#265B73', background_hex: '#DDEBF7' },
      { level: 7, color_hex: '#595959', background_hex: '#F2F2F2' },
      { level: 8, color_hex: '#000000', background_hex: '#FFFFFF' },
    ]
    setColors(defaults)
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="text-sm text-gray-400 text-center py-4">Loading WBS colors…</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">WBS Level Colors</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Customize text and background colors for each WBS hierarchy level.
          </p>
        </div>
        <button
          onClick={resetDefaults}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Reset defaults
        </button>
      </div>

      <div className="space-y-2">
        {colors.map((c, i) => (
          <div key={c.level} className="flex items-center gap-3">
            {/* Level label */}
            <span className="text-xs font-medium text-gray-500 w-14 shrink-0">
              Level {c.level}
            </span>

            {/* Preview */}
            <div
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/30 truncate"
              style={{ backgroundColor: c.background_hex, color: c.color_hex }}
            >
              Sample WBS Item — Level {c.level}
            </div>

            {/* Text color picker */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-gray-400">Text</span>
              <label className="cursor-pointer">
                <div
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                  style={{ backgroundColor: c.color_hex }}
                />
                <input
                  type="color"
                  value={c.color_hex}
                  onChange={(e) => updateColor(i, 'color_hex', e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Background color picker */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-gray-400">BG</span>
              <label className="cursor-pointer">
                <div
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                  style={{ backgroundColor: c.background_hex }}
                />
                <input
                  type="color"
                  value={c.background_hex}
                  onChange={(e) => updateColor(i, 'background_hex', e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <Button
        loading={saveMut.isPending}
        disabled={colors.length === 0}
        onClick={() => saveMut.mutate()}
      >
        Save Colors
      </Button>
    </div>
  )
}
