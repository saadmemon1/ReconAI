'use client';
import { ReconciliationReport } from '@/engine/reconcile';
import { Card } from './ui/card';

export function ReportViewer({ report }: { report: ReconciliationReport }) {
  return (
    <Card className="p-6">
      <h3 className="text-h3 mb-4">Reconciliation Report</h3>
      <p className="text-sm text-secondary">{report.summary}</p>
      <p className="text-xs text-secondary mt-4">
        Model: {report.modelUsed} · Generated: {new Date(report.timestamp).toLocaleString()}
      </p>
    </Card>
  );
}
