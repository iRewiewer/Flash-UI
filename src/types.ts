export type LayoutMode = "grid" | "list";
export type ShellLayoutMode = "compact" | "split" | "library";

export type AppSettings = {
  gamesDir: string;
  settingsPath: string;
};

export type BrowserSettings = {
  defaultPlayerVolume: number;
};

export type LaunchOptions = {
  parameters?: Record<string, string>;
  allowFullscreen?: boolean;
  backgroundColor?: string | null;
  [key: string]: unknown;
};

export type Game = {
  id: string;
  fileName: string;
  relativePath: string;
  name: string;
  description: string;
  notes: string;
  tags: string[];
  dateAdded: string;
  timesPlayed: number;
  lastPlayedAt: string | null;
  version: string;
  thumbnail: string | null;
  thumbnailUrl: string | null;
  launchOptions: LaunchOptions;
  sizeBytes: number;
  modifiedAt: string;
  swfUrl: string;
};

export type MetadataFormState = {
  name: string;
  description: string;
  notes: string;
  tags: string;
  dateAdded: string;
  version: string;
  launchOptions: string;
};

export type UploadDraft = {
  swf: File;
  thumbnail: File | null;
  metadata: MetadataFormState;
};
