import type { TaskSource, TaskUserInputs } from "./task";
import type { ErrorRecord, StepStatus } from "./common";

export type InputMaterial = {
  type: "url" | "upload" | "text_notes" | "transcript" | "screenshot_notes";
  status: StepStatus;
  value?: string;
  note?: string;
};

export type VideoInputArtifact = {
  task_id: string;
  status: StepStatus;
  source: TaskSource;
  user_inputs: TaskUserInputs;
  materials: InputMaterial[];
  available_materials: string[];
  missing_materials: string[];
  errors: ErrorRecord[];
};
