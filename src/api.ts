import type { Game, MetadataFormState } from "./types";

type GamesResponse = {
  games: Game[];
};

type GameResponse = {
  game: Game;
};

type DeleteGameResponse = {
  deletedId: string;
};

export async function fetchGames(): Promise<Game[]> {
  const response = await fetch("/api/games");
  const data = await parseResponse<GamesResponse>(response);
  return data.games;
}

export async function uploadGame(
  swf: File,
  metadata: MetadataFormState,
  thumbnail: File | null
): Promise<Game> {
  const form = new FormData();
  form.set("swf", swf);
  form.set("metadata", JSON.stringify(toMetadataPayload(metadata)));

  if (thumbnail) {
    form.set("thumbnail", thumbnail);
  }

  const response = await fetch("/api/games", {
    method: "POST",
    body: form
  });

  const data = await parseResponse<GameResponse>(response);
  return data.game;
}

export async function updateGameMetadata(
  gameId: string,
  metadata: MetadataFormState
): Promise<Game> {
  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/metadata`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toMetadataPayload(metadata))
  });

  const data = await parseResponse<GameResponse>(response);
  return data.game;
}

export async function updateGameThumbnail(gameId: string, thumbnail: File): Promise<Game> {
  const form = new FormData();
  form.set("thumbnail", thumbnail);

  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/thumbnail`, {
    method: "POST",
    body: form
  });

  const data = await parseResponse<GameResponse>(response);
  return data.game;
}

export async function recordGamePlay(gameId: string): Promise<Game> {
  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/play`, {
    method: "POST"
  });

  const data = await parseResponse<GameResponse>(response);
  return data.game;
}

export async function deleteGame(gameId: string): Promise<string> {
  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
    method: "DELETE"
  });

  const data = await parseResponse<DeleteGameResponse>(response);
  return data.deletedId;
}

export function createFormState(game?: Game, swf?: File): MetadataFormState {
  const now = new Date().toISOString();
  const inferredName = swf ? swf.name.replace(/\.swf$/i, "") : "";

  return {
    name: game?.name || inferredName,
    description: game?.description || "",
    notes: game?.notes || "",
    tags: game?.tags.join(", ") || "",
    dateAdded: game?.dateAdded || now,
    version: game?.version || "",
    launchOptions: JSON.stringify(
      game?.launchOptions || {
        parameters: {},
        allowFullscreen: true,
        backgroundColor: null
      },
      null,
      2
    )
  };
}

export function validateLaunchOptions(value: string): string | null {
  try {
    const parsed = JSON.parse(value || "{}");

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Launch options must be a JSON object.";
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON.";
  }
}

function toMetadataPayload(metadata: MetadataFormState) {
  const launchOptions = JSON.parse(metadata.launchOptions || "{}");

  return {
    name: metadata.name.trim(),
    description: metadata.description.trim(),
    notes: metadata.notes.trim(),
    tags: metadata.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    dateAdded: metadata.dateAdded,
    version: metadata.version.trim(),
    launchOptions
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  return data as T;
}
