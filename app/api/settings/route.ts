import { NextResponse } from "next/server";
import { checkRuntimeConfig } from "../../../lib/tools/config-check";
import { readSettings, writeSettings } from "../../../lib/tools/settings-store";

export async function GET() {
  try {
    const [settings, runtime] = await Promise.all([readSettings(), checkRuntimeConfig()]);
    return NextResponse.json({ settings, runtime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") updates[key] = value;
      else if (typeof value === "boolean") updates[key] = value ? "true" : "false";
      else if (typeof value === "number") updates[key] = String(value);
    }
    const { updatedKeys } = await writeSettings(updates);
    const [settings, runtime] = await Promise.all([readSettings(), checkRuntimeConfig()]);
    return NextResponse.json({ updatedKeys, settings, runtime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
