import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { Button } from '../UI/Button'

interface ImportResult {
  project: { id: string; name: string }
  activities_imported: number
}

export function ImportExcelButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Only .xlsx files are supported')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    const toastId = toast.loading(`Importing "${file.name}"…`)

    try {
      const res = await apiClient.post<ImportResult>('/projects/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const result = res.data
      toast.success(
        `Imported "${result.project.name}" — ${result.activities_imported} activities`,
        { id: toastId }
      )
      navigate(`/projects/${result.project.id}`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Import failed'
      toast.error(msg, { id: toastId })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="secondary"
        size="sm"
        loading={loading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={13} />
        Import
      </Button>
    </>
  )
}
