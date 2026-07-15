import { NextResponse } from "next/server";
import { testConnection } from "../../../../lib/tools/connection-test";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { provider?: string };
    if (!body.provider) {
      return NextResponse.json({ error: "Missing provider to test." }, { status: 400 });
    }
    const result = await testConnection(body.provider);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
