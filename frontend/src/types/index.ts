// ── Enums ──────────────────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
export type ActivityStatusOverride = 'ON_TRACK' | 'SLOW' | 'DELAYED' | 'DONE' | 'PENDING'
export type AssignmentRole = 'LEAD' | 'MEMBER'

// ── Users ──────────────────────────────────────────────────────────────────
export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  department: string | null
  job_title: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export interface Token {
  access_token: string
  token_type: string
  user: User
}

// ── Person ─────────────────────────────────────────────────────────────────
export interface LeaveEntry {
  start_col: number
  end_col: number
  reason: string
}

export interface Person {
  id: string
  name: string
  employee_id: string
  department: string
  role: string
  skills: string[]
  is_active: boolean
  max_concurrent_tasks: number
  avg_delay_days: number
  performance_score: number
  on_time_rate: number
  leave_schedule: LeaveEntry[]
  created_at: string
  updated_at: string | null
}

// ── Resources / Conflicts ──────────────────────────────────────────────────
export interface ConflictActivity {
  id: string
  name: string
  plan_start_col: number
  plan_end_col: number
}

export interface ConflictItem {
  activity_a: ConflictActivity
  activity_b: ConflictActivity
  overlap_start: number
  overlap_end: number
}

export interface PersonConflicts {
  person_id: string
  person_name: string
  department: string
  conflicts: ConflictItem[]
}

export interface PersonWorkload {
  person: Person
  assigned_activities: ActivityWithStatus[]
  total_activities: number
  active_now: number
  conflicts: ConflictItem[]
  utilization_pct: number
}

export interface PreAddConflict {
  conflict_activity_id: string
  conflict_activity_name: string
  overlap_start: number
  overlap_end: number
  message: string
}

// ── Project ────────────────────────────────────────────────────────────────
export interface Project {
  id: string
  name: string
  po_number: string | null
  part_number: string | null
  customer_name: string | null
  product_description: string | null
  scope_of_supply: string | null
  status: ProjectStatus
  created_by_id: string | null
  created_at: string
  updated_at: string | null
}

// ── Assignment ─────────────────────────────────────────────────────────────
export interface Assignment {
  id: string
  activity_id: string
  person_id: string
  role: AssignmentRole
  assigned_at: string
  conflict_warning?: string
}

// ── Activity ───────────────────────────────────────────────────────────────
export interface Activity {
  id: string
  project_id: string
  sequence_no: number
  name: string
  group_type: string | null
  plan_start_col: number
  plan_end_col: number
  actual_start_col: number | null
  actual_end_col: number | null
  status_override: ActivityStatusOverride | null
  remarks: string | null
  assignments: Assignment[]
  // EVM fields
  bac: number | null
  bac_unit: string
  planned_pct: number | null
  actual_pct: number | null
  actual_cost: number | null
  // WBS hierarchy
  wbs_code: string | null
  parent_id: string | null
  wbs_level: number
  is_wbs_summary: boolean
  wbs_color: string | null
  created_at: string
  updated_at: string | null
}

// Activity as returned by the list endpoint — includes computed_status
export interface ActivityWithStatus extends Activity {
  computed_status: ActivityStatusOverride
}

// ── Status / Summary ───────────────────────────────────────────────────────
export interface StatusCounts {
  ON_TRACK: number
  SLOW: number
  DELAYED: number
  DONE: number
  PENDING: number
}

export interface ProjectSummary {
  total: number
  counts: StatusCounts
  pct_complete: number
  overall_status: ActivityStatusOverride
}

export interface ProjectStatusResult {
  project_id: string
  project_name: string
  project_status: ProjectStatus
  summary: ProjectSummary
  activities: ActivityWithStatus[]
}

// ── Payloads ───────────────────────────────────────────────────────────────
export interface LoginPayload {
  email: string
  password: string
}

export interface CreateProjectPayload {
  name: string
  po_number?: string
  part_number?: string
  customer_name?: string
  product_description?: string
  scope_of_supply?: string
  status?: ProjectStatus
}

export interface UpdateActivityPayload {
  name?: string
  group_type?: string | null
  plan_start_col?: number
  plan_end_col?: number
  actual_start_col?: number | null
  actual_end_col?: number | null
  status_override?: ActivityStatusOverride | null
  remarks?: string | null
  bac?: number | null
  bac_unit?: string
  planned_pct?: number | null
  actual_pct?: number | null
  actual_cost?: number | null
  wbs_code?: string | null
  parent_id?: string | null
  is_wbs_summary?: boolean
  wbs_color?: string | null
}

export interface CreateActivityPayload extends UpdateActivityPayload {
  project_id: string
  sequence_no: number
  name: string
  plan_start_col: number
  plan_end_col: number
}

export interface CreateAssignmentPayload {
  activity_id: string
  person_id: string
  role: AssignmentRole
}

// ── Performance Analytics ──────────────────────────────────────────────────
export interface PerformanceSnapshot {
  snapshot_date: string
  score: number
  on_time_rate: number
  avg_delay_days: number
  total_tasks: number
  completed_tasks: number
  delayed_tasks: number
}

export interface PersonPerformance {
  person_id: string
  person_name: string
  employee_id: string
  department: string
  role: string
  skills: string[]
  performance_score: number
  on_time_rate: number
  avg_delay_days: number
  score_change_vs_last_week: number
  total_tasks: number
  completed_tasks: number
  on_track_tasks: number
  slow_tasks: number
  delayed_tasks: number
  pending_tasks: number
  activities: ActivityWithStatus[]
}

export interface DepartmentPerformance {
  department: string
  avg_score: number
  avg_on_time_rate: number
  total_persons: number
  persons: PersonPerformance[]
}

export interface LeaderboardEntry {
  person_id: string
  person_name: string
  employee_id: string
  department: string
  role: string
  performance_score: number
  on_time_rate: number
  avg_delay_days: number
  total_tasks: number
  completed_tasks: number
  score_change_vs_last_week: number
  rank: number
}

export interface ProjectPerformance {
  project_id: string
  performance_score: number
  total_tasks: number
  completed_tasks: number
  on_track_tasks: number
  slow_tasks: number
  delayed_tasks: number
  pending_tasks: number
  on_time_rate: number
  avg_delay_days: number
  persons: PersonPerformance[]
}

// ── Notifications ──────────────────────────────────────────────────────────
export type NotificationType =
  | 'ACTIVITY_DELAYED'
  | 'ACTIVITY_SLOW'
  | 'PERSON_OVERLOADED'
  | 'PROJECT_BEHIND'
  | 'DAILY_DIGEST'
  | 'CONFLICT_DETECTED'

export interface AppNotification {
  id: string
  user_id: string
  project_id: string | null
  activity_id: string | null
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface NotificationRule {
  id: string
  user_id: string
  project_id: string | null
  trigger_type: NotificationType
  threshold_days: number
  channels: string[]
  is_active: boolean
  created_at: string
}

export interface NotificationsResponse {
  notifications: AppNotification[]
  unread_count: number
}

// ── EVM ────────────────────────────────────────────────────────────────────
export interface ActivityEVM {
  activity_id:   string
  activity_name: string
  bac:           number | null
  bac_unit:      string
  planned_pct:   number | null
  actual_pct:    number | null
  actual_cost:   number | null
  pv:            number | null
  ev:            number | null
  ac:            number | null
  spi:           number | null
  cpi:           number | null
  sv:            number | null
  cv:            number | null
  eac:           number | null
  vac:           number | null
}

export interface SCurvePoint {
  col:                number
  label:              string
  planned_cumulative: number
  actual_cumulative:  number
}

export interface ProjectEVM {
  project_id:         string
  total_bac:          number
  total_pv:           number
  total_ev:           number
  total_ac:           number
  spi:                number | null
  cpi:                number | null
  sv:                 number | null
  cv:                 number | null
  eac:                number | null
  vac:                number | null
  activities:         ActivityEVM[]
  s_curve:            SCurvePoint[]
}

export interface EVMHistoryPoint {
  snapshot_date: string
  pv:            number | null
  ev:            number | null
  ac:            number | null
  spi:           number | null
  cpi:           number | null
  sv:            number | null
  cv:            number | null
}

export interface PMSRow {
  seq:         number
  name:        string
  group_type:  string | null
  plan_start:  string
  plan_end:    string
  actual_start: string | null
  actual_end:   string | null
  bac:          number | null
  bac_unit:     string
  planned_pct:  number | null
  actual_pct:   number | null
  actual_cost:  number | null
  pv:           number | null
  ev:           number | null
  ac:           number | null
  spi:          number | null
  cpi:          number | null
  status:       string
}

export interface UpdateActivityEVMPayload {
  bac?:         number | null
  bac_unit?:    string
  planned_pct?: number | null
  actual_pct?:  number | null
  actual_cost?: number | null
}

// ── WBS ────────────────────────────────────────────────────────────────────
export interface WBSColor {
  level:          number
  color_hex:      string
  background_hex: string
}

export interface WBSRollup {
  planStart:       number
  planEnd:         number
  overall_status:  string
  pct:             number
}

export interface CreateChildActivityPayload {
  name:           string
  plan_start_col: number
  plan_end_col:   number
  group_type?:    string | null
  is_wbs_summary?: boolean
  remarks?:       string | null
  bac?:           number | null
  bac_unit?:      string
}

// ── XER / P6 ───────────────────────────────────────────────────────────────
export interface AuditIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  type:     string
  activity: string
  detail:   string
}

export interface AuditCounts {
  open_ends:       number
  missing_logic:   number
  negative_float:  number
  constraints:     number
  out_of_sequence: number
}

export interface XERImportResult {
  project:             Project
  activities_imported: number
  wbs_levels:          number
  resource_count:      number
  audit_issues:        AuditIssue[]
  audit_counts:        AuditCounts
}

export interface XERAuditResult {
  issues:      AuditIssue[]
  counts:      AuditCounts
  total_tasks: number
}
