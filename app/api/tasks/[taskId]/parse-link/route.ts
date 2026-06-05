import { NextResponse } from "next/server";
import { linkParserNextAction, parseSourceLinkForTask } from "../../../../../lib/tools/link-parser";

export async function POST(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const body = await request.json().catch(() => ({})) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json(
        {
          error: "url is required",
          next_action: linkParserNextAction()
        },
        { status: 400 }
      );
    }
    const sourceLink = await parseSourceLinkForTask(params.taskId, body.url);
    return NextResponse.json({
      source_link: sourceLink,
      next_action: sourceLink.user_next_action ?? linkParserNextAction()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse source link";
    return NextResponse.json(
      {
        error: message,
        next_action: linkParserNextAction()
      },
      { status: 500 }
    );
  }
}
