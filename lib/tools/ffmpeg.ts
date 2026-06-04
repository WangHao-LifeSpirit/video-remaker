import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MediaCommandResult = {
  command: string;
  stdout: string;
  stderr: string;
};

type ExecFileFailure = Error & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: string | number | null;
  signal?: NodeJS.Signals | null;
};

export class MediaCommandError extends Error {
  command: string;
  stdout: string;
  stderr: string;
  code?: string | number | null;
  signal?: NodeJS.Signals | null;

  constructor(input: {
    message: string;
    command: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    code?: string | number | null;
    signal?: NodeJS.Signals | null;
  }) {
    super(input.message);
    this.name = "MediaCommandError";
    this.command = input.command;
    this.stdout = String(input.stdout ?? "");
    this.stderr = String(input.stderr ?? "");
    this.code = input.code;
    this.signal = input.signal;
  }
}

function quoteArg(arg: string): string {
  return /\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

function formatCommand(binary: string, args: string[]): string {
  return [binary, ...args].map(quoteArg).join(" ");
}

export function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function getFfprobePath(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

async function runMediaCommand(binary: string, args: string[], timeoutMs: number): Promise<MediaCommandResult> {
  const command = formatCommand(binary, args);
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      command,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? "")
    };
  } catch (error) {
    const failure = error as ExecFileFailure;
    throw new MediaCommandError({
      message: `${binary} command failed: ${failure.message}`,
      command,
      stdout: failure.stdout,
      stderr: failure.stderr,
      code: failure.code,
      signal: failure.signal
    });
  }
}

export async function runFfmpeg(args: string[], timeoutMs = 180_000): Promise<MediaCommandResult> {
  return runMediaCommand(getFfmpegPath(), args, timeoutMs);
}

export async function runFfprobe(args: string[], timeoutMs = 60_000): Promise<MediaCommandResult> {
  return runMediaCommand(getFfprobePath(), args, timeoutMs);
}

export async function assertFfmpegAvailable(): Promise<void> {
  await runFfmpeg(["-version"], 15_000);
  await runFfprobe(["-version"], 15_000);
}

