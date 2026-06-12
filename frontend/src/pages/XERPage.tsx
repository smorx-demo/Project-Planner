import { XERImportSection } from '../components/XER/XERImportSection'
import { XERExportSection } from '../components/XER/XERExportSection'
import { XERAuditSection }  from '../components/XER/XERAuditSection'

export function XERPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">XER / P6</h1>
        <p className="text-sm text-gray-500 mt-0.5">Import, export, and audit Primavera P6 schedules</p>
      </div>

      <XERImportSection />
      <XERExportSection />
      <XERAuditSection />
    </div>
  )
}
