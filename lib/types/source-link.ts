export type SourceLinkPlatform =
  | "douyin"
  | "kuaishou"
  | "xiaohongshu"
  | "bilibili"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "unknown";

export type SourceLinkStatus =
  | "pending"
  | "parsed"
  | "needs_user_input"
  | "unsupported"
  | "failed";

export type SourceLinkInfo = {
  url: string;
  normalized_url?: string;
  platform: SourceLinkPlatform;
  status: SourceLinkStatus;
  title?: string;
  author?: string;
  description?: string;
  cover_url?: string;
  duration_seconds?: number;
  extracted_at?: string;
  error?: string;
  user_next_action?: string;
};
