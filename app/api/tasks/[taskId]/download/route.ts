import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTaskDir, getTaskOutputsDir } from "../../../../../lib/tools/task-store";

const allowedFiles = {
  "final.mp4": "video/mp4",
  "final_subtitled.mp4": "video/mp4",
  "cover.jpg": "image/jpeg",
  "outputs_manifest.json": "application/json; charset=utf-8",
  "production-package.md": "text/markdown; charset=utf-8",
  "project-package.json": "application/json; charset=utf-8",
  "subtitles.srt": "application/x-subrip; charset=utf-8"
} as const;

type AllowedFile = keyof typeof allowedFiles;

function isAllowedFile(value: string | null): value is AllowedFile {
  return value === "final.mp4"
    || value === "final_subtitled.mp4"
    || value === "cover.jpg"
    || value === "outputs_manifest.json"
    || value === "production-package.md"
    || value === "project-package.json"
    || value === "subtitles.srt";
}

function resolveAllowedDownload(taskId: string, file: AllowedFile): { baseDir: string; filePath: string } {
  if (file === "subtitles.srt") {
    const baseDir = path.join(getTaskDir(taskId), "assets", "subtitles");
    return {
      baseDir,
      filePath: path.join(baseDir, "subtitles.srt")
    };
  }

  const baseDir = getTaskOutputsDir(taskId);
  return {
    baseDir,
    filePath: path.join(baseDir, file)
  };
}

export async function GET(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!isAllowedFile(file)) {
      return NextResponse.json({ error: "Unsupported download file." }, { status: 400 });
    }

    const { baseDir, filePath } = resolveAllowedDownload(params.taskId, file);
    if (!filePath.startsWith(baseDir)) {
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
