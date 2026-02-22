export type DownloadStatus =
  | "pending"
  | "analyzing"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "queued";

export type FileCategory =
  | "documents"
  | "video"
  | "audio"
  | "images"
  | "archives"
  | "software"
  | "other";

export interface Download {
  id: string;
  url: string;
  filename: string;
  save_path: string;
  total_size: number | null;
  downloaded_size: number;
  status: DownloadStatus;
  error_message: string | null;
  error_code: string | null;
  mime_type: string | null;
  category: FileCategory;
  resumable: boolean;
  connections: number;
  speed: number;
  source_domain: string | null;
  referrer: string | null;
  cookies: string | null;
  user_agent: string | null;
  headers: string | null;
  queue_position: number | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface DownloadProgress {
  download_id: string;
  downloaded_size: number;
  total_size: number | null;
  speed: number;
  eta_seconds: number | null;
  connections: ConnectionProgress[];
}

export interface ConnectionProgress {
  connection_num: number;
  downloaded: number;
  range_start: number;
  range_end: number;
}

export interface UrlAnalysis {
  url: string;
  filename: string;
  total_size: number | null;
  mime_type: string | null;
  resumable: boolean;
  category: FileCategory;
  server: string | null;
}
