export type OutputManifestItem = {
  key: "final_mp4" | "final_subtitled_mp4" | "cover_jpg" | "production_package_md" | "project_package_json";
  label: string;
  file_path: string;
  exists: boolean;
  size_bytes?: number;
  updated_at?: string;
  download_file?: "final.mp4" | "final_subtitled.mp4" | "cover.jpg" | "production-package.md" | "project-package.json";
};

export type OutputsManifest = {
  task_id: string;
  status: "success";
  generated_at: string;
  recommended_preview: "final_subtitled.mp4" | "final.mp4" | "none";
  outputs: OutputManifestItem[];
};
