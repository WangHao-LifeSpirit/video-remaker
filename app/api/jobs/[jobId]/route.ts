import { NextResponse } from "next/server";
import { getJob } from "../../../../lib/tools/job-store";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  try {
    const job = await getJob(jobId);
    return NextResponse.json(job);
  } catch {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
}
