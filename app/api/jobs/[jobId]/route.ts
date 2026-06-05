import { NextResponse } from "next/server";
import { getJob } from "../../../../lib/tools/job-store";

export async function GET(_request: Request, { params }: { params: { jobId: string } }) {
  try {
    const job = await getJob(params.jobId);
    return NextResponse.json(job);
  } catch {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
}
