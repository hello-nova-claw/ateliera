export interface PwaArtifactReport {
  files: string[];
  issues: string[];
  metrics: {
    fileCount: number;
    javascriptBytes: number;
    precacheEntries: number;
    totalBytes: number;
  };
}

export function inspectPwaArtifact(rootPath: string): Promise<PwaArtifactReport>;
