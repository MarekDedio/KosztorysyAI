export interface ExtractedTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface DocumentMetadata {
  title?: string;
  location?: string;
  administrativeDetails?: string;
}

export interface ExtractionResult {
  metadata?: DocumentMetadata;
  tables: ExtractedTable[];
}

export interface CalculatedTotals {
  totalNetto: number;
  totalBrutto: number;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}