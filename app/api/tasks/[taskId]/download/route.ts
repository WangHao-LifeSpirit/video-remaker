import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTaskOutputsDir } from "../../../../../lib/tools/task-store";

const allowedFiles = {
  "final.mp4": "video/mp4",
  "production-package.md": "text/markdown; charset=utf-8",
  "project-package.json": "application/json; charset=utf-8"
} as const;

type AllowedFile = keyof typeof allowedFiles;

function isAllowedFile(value: string | null): value is AllowedFile {
  return value === "final.mp4" || value === "production-package.md" || value === "project-package.json";
}

export async function GET(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!isAllowedFile(file)) {
      return NextResponse.json({ error: "Unsupported download file." }, { status: 400 });
    }

    const outputDir = getTaskOutputsDir(params.taskId);
    const filePath = path.join(outputDir, file);
    if (!filePath.startsWith(outputDir)) {
      return NextResponse.json({ error: "Invalid download path." }, { status: 400 });
    }

    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        "Content-Type": allowedFiles[file],
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download file not found.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
