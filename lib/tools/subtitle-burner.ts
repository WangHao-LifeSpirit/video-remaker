import { access, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { SubtitlePackage } from "../types/subtitles";
import { assertFfmpegAvailable, runFfmpeg, runFfprobe } from "./ffmpeg";
import {
  getTask,
  getTaskDir,
  getTaskOutputsDir,
  readTaskArtifact,
  saveTask,
  setTaskStatus,
  toProjectRelativePath
} from "./task-store";

const execFileAsync = promisify(execFile);

export type BurnSubtitlesInput = {
  taskId: string;
  input?: string;
  output?: string;
};

export type BurnSubtitlesResult = {
  task_id: string;
  status: "success";
  input_mp4: string;
  subtitles_srt: string;
  output_mp4: string;
  output_size: number;
  note: string;
};

async function assertReadableFile(filePath: string, label: string): Promise<void> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`${label} is not a file.`);
    }
    await access(filePath);
  } catch {
    throw new Error(`${label} not found: ${toProjectRelativePath(filePath)}`);
  }
}

type VideoSize = {
  width: number;
  height: number;
};

type FfprobeSizeOutput = {
  streams?: Array<{
    width?: number;
    height?: number;
  }>;
};

function wrapText(value: string, maxChars = 16): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [" "];
  }
  const chars = Array.from(normalized);
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(""));
  }
  return lines.slice(0, 2);
}

async function probeVideoSize(inputPath: string): Promise<VideoSize> {
  const result = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    inputPath
  ]);
  const parsed = JSON.parse(result.stdout) as FfprobeSizeOutput;
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) {
    return { width: 704, height: 1248 };
  }
  return {
    width: stream.width,
    height: stream.height
  };
}

async function writeSubtitleOverlays(input: {
  taskId: string;
  subtitles: SubtitlePackage;
  videoSize: VideoSize;
}): Promise<string[]> {
  const overlayDir = path.join(getTaskDir(input.taskId), "final", "subtitle-overlays");
  await mkdir(overlayDir, { recursive: true });
  const rendererPath = await writeSwiftSubtitleRenderer(overlayDir);

  const overlayPaths: string[] = [];
  for (const segment of input.subtitles.segments) {
    overlayPaths.push(await renderSubtitlePng({
      rendererPath,
      outputPath: path.join(overlayDir, `subtitle-${segment.index.toString().padStart(3, "0")}.png`),
      width: input.videoSize.width,
      height: input.videoSize.height,
      lines: wrapText(segment.text)
    }));
  }
  return overlayPaths;
}

async function writeSwiftSubtitleRenderer(outputDir: string): Promise<string> {
  const rendererPath = path.join(outputDir, "render-subtitle.swift");
  await writeFile(rendererPath, `
import AppKit

let args = CommandLine.arguments
if args.count < 5 {
  fatalError("Usage: render-subtitle.swift <output> <width> <height> <line1> [line2]")
}

let output = args[1]
let width = Int(args[2]) ?? 704
let height = Int(args[3]) ?? 1248
let lines = Array(args.dropFirst(4))
let size = NSSize(width: width, height: height)
let image = NSImage(size: size)

image.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

let fontSize = max(30.0, Double(height) * 0.038)
let lineHeight = fontSize * 1.28
let bottomMargin = Double(height) * 0.072
let boxPaddingY = fontSize * 0.55
let boxHeight = Double(lines.count) * lineHeight + boxPaddingY
let boxWidth = Double(width) * 0.84
let boxX = Double(width) * 0.08
let boxY = bottomMargin
let boxRect = NSRect(x: boxX, y: boxY, width: boxWidth, height: boxHeight)
let path = NSBezierPath(roundedRect: boxRect, xRadius: 14, yRadius: 14)
NSColor.black.withAlphaComponent(0.48).setFill()
path.fill()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let font = NSFont.systemFont(ofSize: fontSize, weight: .bold)
let text = lines.joined(separator: "\\n") as NSString
let textHeight = Double(lines.count) * lineHeight
let textRect = NSRect(
  x: boxX + 18,
  y: boxY + (boxHeight - textHeight) / 2,
  width: boxWidth - 36,
  height: textHeight + 8
)

let strokeAttributes: [NSAttributedString.Key: Any] = [
  .font: font,
  .paragraphStyle: paragraph,
  .foregroundColor: NSColor.white,
  .strokeColor: NSColor.black,
  .strokeWidth: -5.0
]
text.draw(in: textRect, withAttributes: strokeAttributes)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
  fatalError("Failed to encode subtitle png")
}
try png.write(to: URL(fileURLWithPath: output))
`, "utf8");
  return rendererPath;
}

async function renderSubtitlePng(input: {
  rendererPath: string;
  outputPath: string;
  width: number;
  height: number;
  lines: string[];
}): Promise<string> {
  await unlink(input.outputPath).catch(() => undefined);
  const moduleCachePath = path.join(path.dirname(input.rendererPath), "swift-module-cache");
  await mkdir(moduleCachePath, { recursive: true });
  await execFileAsync("swift", [
    "-module-cache-path",
    moduleCachePath,
    input.rendererPath,
    input.outputPath,
    String(input.width),
    String(input.height),
    ...input.lines
  ], {
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCachePath
    }
  });
  await assertReadableFile(input.outputPath, "subtitle overlay png");
  return input.outputPath;
}

function overlayFilter(subtitles: SubtitlePackage): string {
  const steps: string[] = [];
  let current = "[0:v]";
  subtitles.segments.forEach((segment, index) => {
    const inputIndex = index + 1;
    const next = `[v${index + 1}]`;
    const end = Math.max(segment.end, segment.start + 0.1);
    steps.push(`${current}[${inputIndex}:v]overlay=0:0:enable='between(t,${segment.start.toFixed(3)},${end.toFixed(3)})'${next}`);
    current = next;
  });
  return steps.join(";");
}

function taskOutputPath(taskId: string, fileName: string): string {
  const outputDir = getTaskOutputsDir(taskId);
  const resolved = path.resolve(outputDir, fileName);
  const relative = path.relative(outputDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output file must stay inside the task output directory.");
  }
  return resolved;
}

export async function burnSubtitlesForTask(input: BurnSubtitlesInput): Promise<BurnSubtitlesResult> {
  const task = await getTask(input.taskId);
  const outputDir = getTaskOutputsDir(input.taskId);
  const inputPath = input.input
    ? taskOutputPath(input.taskId, input.input)
    : path.join(outputDir, "final.mp4");
  const outputPath = input.output
    ? taskOutputPath(input.taskId, input.output)
    : path.join(outputDir, "final_subtitled.mp4");
  const subtitlePath = path.join(getTaskDir(input.taskId), "assets", "subtitles", "subtitles.srt");
  const inputRelative = toProjectRelativePath(inputPath);
  const outputRelative = toProjectRelativePath(outputPath);
  const subtitleRelative = toProjectRelativePath(subtitlePath);

  await assertReadableFile(inputPath, "final.mp4");
  await assertReadableFile(subtitlePath, "subtitles.srt");
  await assertFfmpegAvailable();
  await mkdir(outputDir, { recursive: true });
  const subtitles = await readTaskArtifact<SubtitlePackage>(input.taskId, "subtitles.json");
  if (!subtitles.segments.length) {
    throw new Error("subtitles.json has no subtitle segments to burn.");
  }
  const videoSize = await probeVideoSize(inputPath);
  const overlayPaths = await writeSubtitleOverlays({
    taskId: input.taskId,
    subtitles,
    videoSize
  });

  const ffmpegArgs = ["-y", "-i", inputPath];
  for (const overlayPath of overlayPaths) {
    ffmpegArgs.push("-loop", "1", "-i", overlayPath);
  }
  ffmpegArgs.push(
    "-filter_complex",
    overlayFilter(subtitles),
    "-map",
    `[v${subtitles.segments.length}]`,
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "copy",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath
  );

  await runFfmpeg(ffmpegArgs);
  await runFfprobe(["-v", "error", "-show_format", "-show_streams", outputPath]);
  const outputStat = await stat(outputPath);

  task.export_paths.subtitled_mp4 = outputRelative;
  setTaskStatus(task, "success", "burn-subtitles");
  await saveTask(task);

  return {
    task_id: input.taskId,
    status: "success",
    input_mp4: inputRelative,
    subtitles_srt: subtitleRelative,
    output_mp4: outputRelative,
    output_size: outputStat.size,
    note: "FFmpeg burned subtitles into a separate final_subtitled.mp4. The original final.mp4 was not overwritten."
  };
}
