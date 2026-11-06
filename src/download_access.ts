import { z } from "zod";

export const downloadRequestSchema = z.object({
  sessionId: z.string().min(1).max(200),
  documentType: z.enum(["donor_receipt", "volunteer_reminder", "campaign_report"]),
  recordId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
}).strict();

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;

const documentFolders: Record<DownloadRequest["documentType"], string> = {
  donor_receipt: "donor-receipts",
  volunteer_reminder: "volunteer-reminders",
  campaign_report: "campaign-reports"
};

export function privateObjectKey(request: DownloadRequest): string {
  return `${documentFolders[request.documentType]}/${request.recordId}.pdf`;
}

export function attachmentName(request: DownloadRequest): string {
  return `${request.documentType.replaceAll("_", "-")}-${request.recordId}.pdf`;
}
