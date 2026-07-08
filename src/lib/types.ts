export type EquipmentType = 'excavator' | 'dump' | 'truck'
export type UnitType = 'hour' | 'count' | 'day'
export type Status = 'active' | 'completed' | 'cancelled'

export interface Client {
  id: string
  name: string
  business_no?: string
  ceo_name?: string
  contact?: string
  manager_name?: string
  manager_contact?: string
  address?: string
  memo?: string
  business_reg_image_url?: string
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  business_no?: string
  ceo_name?: string
  contact?: string
  manager_name?: string
  manager_contact?: string
  address?: string
  commission_rate: number
  bank_name?: string
  bank_account?: string
  bank_holder?: string
  biz_type?: string
  biz_item?: string
  status: 'active' | 'inactive'
  memo?: string
  created_at: string
}

export interface Equipment {
  id: string
  supplier_id: string
  type: EquipmentType
  plate_no?: string
  model?: string
  spec?: string
  reg_no?: string
  year?: number
  inspection_expire?: string
  insurance_expire?: string
  insurance_premium?: number
  status: 'available' | 'dispatched' | 'maintenance'
  memo?: string
  created_at: string
  supplier?: Supplier
}

export interface Document {
  id: string
  ref_type: 'supplier' | 'equipment' | 'client'
  ref_id: string
  doc_type: string
  file_url: string
  file_name?: string
  expire_date?: string
  memo?: string
  created_at: string
}

export interface Project {
  id: string
  client_id: string
  name: string
  location?: string
  start_date?: string
  end_date?: string
  status: Status
  memo?: string
  created_at: string
  client?: Client
}

export interface Dispatch {
  id: string
  project_id: string
  equipment_id: string
  supplier_id: string
  start_date: string
  end_date?: string
  unit_type: UnitType
  client_unit_price?: number
  supplier_unit_price?: number
  commission_rate?: number
  commission_amount?: number
  status: Status
  memo?: string
  work_items?: { type: string; hours: number; unit_price: number }[]
  created_at: string
  equipment?: Equipment
  supplier?: Supplier
  project?: Project
}

export interface DailyLog {
  id: string
  dispatch_id: string
  log_date: string
  quantity: number
  note?: string
  work_time_1?: string
  work_time_2?: string
  work_content?: string
  special_notes?: string
  driver_name?: string
  created_at: string
  dispatch?: Dispatch
}

export interface Invoice {
  id: string
  client_id: string
  project_id?: string
  issue_date: string
  period_start?: string
  period_end?: string
  supply_amount?: number
  vat_amount?: number
  total_amount?: number
  status: 'issued' | 'paid'
  file_url?: string
  memo?: string
  created_at: string
  client?: Client
}

export interface PurchaseInvoice {
  id: string
  supplier_id: string
  project_id?: string
  issue_date: string
  period_start?: string
  period_end?: string
  supply_amount?: number
  vat_amount?: number
  total_amount?: number
  status: 'received' | 'paid'
  paid_at?: string
  memo?: string
  created_at: string
  supplier?: Supplier
}

export interface Settlement {
  id: string
  supplier_id: string
  period_start: string
  period_end: string
  gross_amount?: number
  commission_rate?: number
  commission_amount?: number
  net_amount?: number
  status?: string
  paid_at?: string
  memo?: string
}
