import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getTask, getTaskOutputsDir } from "../../../../../lib/tools/task-store";

function parseRange(rangeHeader: string | null, fileSize: number): { start: number; end: number } | undefined {
  if (!rangeHeader) {
    return undefined;
  }
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return undefined;
  }

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) {
    return undefined;
  }

  if (!startValue && endValue) {
    const suffixLength = Number(endValue);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return undefined;
    }
    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1
    };
  }

  const start = Number(startValue);
  const end = endValue ? Number(endValue) : fileSize - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) {
    return undefined;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

function streamResponse(filePath: string, input: { start?: number; end?: number; fileSize: number }) {
  const start = input.start ?? 0;
  const end = input.end ?? input.fileSize - 1;
  const stream = createReadStream(filePath, { start, end });
  const contentLength = end - start + 1;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(contentLength),
    "Content-Type": "video/mp4"
  });

  if (input.start !== undefined || input.end !== undefined) {
    headers.set("Content-Range", `bytes ${start}-${end}/${input.fileSize}`);
  }

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: input.start !== undefined || input.end !== undefined ? 206 : 200,
    headers
  });
}

export async function GET(request: Request, { params }: { params: { taskId: string } }) {
  try {
    await getTask(params.taskId);
    const outputDir = getTaskOutputsDir(params.taskId);
    const filePath = path.join(outputDir, "final.mp4");
    if (!filePath.startsWith(outputDir)) {
      return NextResponse.json({ error: "Invalid video path." }, { status: 400 });
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "final.mp4 not found." }, { status: 404 });
    }

    const range = request.headers.get("range");
    const parsedRange = parseRange(range, fileStat.size);
    if (range && !parsedRange) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileStat.size}`
        }
      });
    }

    return streamResponse(filePath, {
      start: parsedRange?.start,
      end: parsedRange?.end,
      fileSize: fileStat.size
    });
  } catch {
    return NextResponse.json({ error: "final.mp4 not found." }, { status: 404 });
  }
}
