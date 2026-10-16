export type Role = 'admin' | 'crew' | 'client'
export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled'
export type AssignmentRole = 'lead' | 'helper'
export type AssignmentStatus = 'offered' | 'accepted' | 'declined' | 'removed'

export interface Account {
  id: string
  role: Role
  full_name: string | null
  phone: string | null
  email: string | null
  language: string
  truck_sizes: string[]
  can_lead: boolean
  active: boolean
}

export interface Job {
  id: string
  job_date: string
  window_start: string | null
  window_end: string | null
  job_type: string
  home_size: string | null
  from_address: string
  to_address: string | null
  access_notes: string | null
  est_hours: number | null
  truck_size: string | null
  crew_size: number | null
  status: JobStatus
  is_open: boolean
  open_pay: number | null
  open_pay_type: 'flat' | 'hourly'
}

export interface Assignment {
  id: string
  job_id: string
  crew_id: string
  role: AssignmentRole
  crew_pay: number
  pay_type: 'flat' | 'hourly'
  status: AssignmentStatus
}

export interface TruckRental {
  id: string
  job_id: string
  company: string | null
  confirmation: string | null
  truck_size: string | null
  pickup_location: string | null
  pickup_at: string | null
  return_location: string | null
  return_at: string | null
}

export interface JobCost {
  id: string
  job_id: string
  kind: string
  amount: number
  note: string | null
}

export interface TimeEntry {
  id: string
  assignment_id: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
}

export const JOB_TYPES: Record<string, string> = {
  full_move: 'Full move',
  office_move: 'Office relocation',
  labor_only: 'Labor only',
  packing: 'Packing',
  junk_haul: 'Junk haul',
}

export const TRUCK_SIZES = ['Cargo van', '12 ft', '16 ft', '22 ft', '26 ft']
export const HOME_SIZES = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4+ bedrooms', 'Small office (1 to 10 people)', 'Medium office (11 to 30 people)', 'Large office (30+ people)', 'Few items']

export type PhotoKind = 'before' | 'after' | 'damage' | 'other'
export type ExtraKind = 'item' | 'time' | 'supplies'

export interface JobPhoto {
  id: string
  job_id: string
  uploaded_by: string | null
  kind: PhotoKind
  storage_path: string
  note: string | null
  created_at: string
}

export interface JobExtra {
  id: string
  job_id: string
  kind: ExtraKind
  title: string
  note: string | null
  created_at: string
}

export interface JobSignoff {
  job_id: string
  signer_name: string
  signature: string
  signed_at: string
}

export const EXTRA_KINDS: Record<ExtraKind, string> = { item: 'Item', time: 'Time', supplies: 'Supplies' }
