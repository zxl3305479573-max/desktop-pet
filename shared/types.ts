export interface PetStatus {
  id: string
  name: string
  status: 'uploaded' | 'processing' | 'awaiting_review' | 'ready' | 'failed'
  preview_front: string | null
  rig_quality: string | null
  error_message: string | null
  created_at: string
}

export interface PetDetail extends PetStatus {
  user_id: string
  source_photo_path: string | null
  asset_bundle_path: string | null
  skeleton_json: string | null
  updated_at: string
}

export interface PetListResponse {
  pets: PetStatus[]
  total: number
}

export interface JobStatus {
  job_id: string
  pet_id: string
  status: 'queued' | 'running' | 'awaiting_review' | 'completed' | 'failed' | 'needs_better_photo'
  stage_progress: number
  error_message: string | null
  failed_stage: string | null
  preview_front: string | null
  created_at: string
  updated_at: string
}
