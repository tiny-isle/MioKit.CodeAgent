export interface CheckReport {
  errors: string[];
  warnings: string[];
  hints: string[];
}

export function emptyReport(): CheckReport {
  return { errors: [], warnings: [], hints: [] };
}

export function mergeReports(...reports: CheckReport[]): CheckReport {
  const merged = emptyReport();
  for (const report of reports) {
    merged.errors.push(...report.errors);
    merged.warnings.push(...report.warnings);
    merged.hints.push(...report.hints);
  }
  return merged;
}

export function hasErrors(report: CheckReport): boolean {
  return report.errors.length > 0;
}
