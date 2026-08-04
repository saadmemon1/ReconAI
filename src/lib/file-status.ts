/** Minimal shape of the processing block DocAI returns with ?include=processing */
export interface FileProcessingInfo {
  latest_parse_job?: {
    status?: string;
    percent?: number;
    total_pages?: number;
    completed_pages?: number;
  } | null;
}

export interface FileWithProcessing {
  id: string;
  filename: string;
  processing?: FileProcessingInfo | null;
}

/**
 * Authoritative server-side parse status from DocAI's ?include=processing.
 * A file is "parsed" when its latest parse job completed successfully.
 */
export function isFileParsed(file: FileWithProcessing): boolean {
  return file.processing?.latest_parse_job?.status === 'completed';
}
