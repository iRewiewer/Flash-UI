import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
const port = Number(process.env.PORT || 8020);
const defaultGamesDir = path.resolve(process.env.GAMES_DIR || path.join(process.cwd(), "games"));
const defaultSettingsPath = path.resolve(process.env.CONFIG_PATH || path.join(process.cwd(), "config", "settings.json"));
const clientDir = path.resolve(__dirname, "..", "dist");

app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: createUploadStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

const thumbnailUpload = multer({
  storage: createUploadStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const metadataUpload = multer({
  storage: createUploadStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

let settings = await loadSettings();
let gamesDir = settings.gamesDir;
let settingsPath = settings.settingsPath;

await ensureStorage();

app.use("/ruffle", express.static(resolveRuffleDir(), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".wasm")) {
      res.setHeader("Content-Type", "application/wasm");
    }
  }
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/settings", (_req, res) => {
  res.json({ settings: toSettingsResponse() });
});

app.put("/api/settings", async (req, res, next) => {
  try {
    const nextSettings = normalizeSettings(req.body);
    settings = nextSettings;
    gamesDir = nextSettings.gamesDir;
    settingsPath = nextSettings.settingsPath;
    await saveSettings(nextSettings);
    await ensureStorage();
    res.json({ settings: toSettingsResponse() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/metadata/export", async (_req, res, next) => {
  try {
    const library = await loadLibrary();
    res.type("application/json");
    res.setHeader("Content-Disposition", "attachment; filename=\"flash-ui-metadata.json\"");
    res.send(`${JSON.stringify(library, null, 2)}\n`);
  } catch (error) {
    next(error);
  }
});

app.post("/api/metadata/import", metadataUpload.single("metadata"), async (req, res, next) => {
  const metadataFile = req.file;

  try {
    if (!metadataFile) {
      res.status(400).json({ error: "A metadata JSON file is required." });
      return;
    }

    const raw = await fs.readFile(metadataFile.path, "utf8");
    const importedLibrary = parseLibraryPayload(parseJsonPayload(raw, "Metadata import must be valid JSON."));
    await saveLibrary(importedLibrary);
    await removeTempFile(metadataFile);

    const library = await loadLibrary();
    const games = await scanGames(library);
    await saveLibrary(library);
    res.json({ games });
  } catch (error) {
    await removeTempFile(metadataFile);
    next(error);
  }
});

app.post("/api/favorites/clear", async (_req, res, next) => {
  try {
    const library = await loadLibrary();

    library.games = Object.fromEntries(
      Object.entries(library.games || {}).map(([id, metadata]) => [
        id,
        normalizeMetadata({
          ...metadata,
          favorite: false
        })
      ])
    );

    await saveLibrary(library);
    const games = await scanGames(library);
    await saveLibrary(library);
    res.json({ games });
  } catch (error) {
    next(error);
  }
});

app.get("/api/games", async (_req, res, next) => {
  try {
    const library = await loadLibrary();
    const games = await scanGames(library);
    await saveLibrary(library);
    res.json({ games });
  } catch (error) {
    next(error);
  }
});

app.post("/api/games", upload.fields([
  { name: "swf", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 }
]), async (req, res, next) => {
  const swfFile = req.files?.swf?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];
  let destination = null;

  try {
    if (!swfFile) {
      res.status(400).json({ error: "A SWF file is required." });
      return;
    }

    if (!isSwfFile(swfFile.originalname)) {
      await removeTempFile(swfFile);
      await removeTempFile(thumbnailFile);
      res.status(400).json({ error: "Only .swf files can be uploaded." });
      return;
    }

    const metadata = parseMetadataPayload(req.body.metadata);
    const fileName = await uniqueFileName(sanitizeFileName(swfFile.originalname));
    destination = path.join(gamesDir, fileName);
    await fs.rename(swfFile.path, destination);

    const library = await loadLibrary();
    const id = toRelativeId(destination);
    library.games[id] = normalizeMetadata({
      ...createDefaultMetadata(id, await fileStat(destination)),
      ...metadata,
      name: metadata.name || baseNameWithoutExtension(fileName)
    });

    if (thumbnailFile) {
      library.games[id].thumbnail = await persistThumbnail(id, thumbnailFile);
    }

    await saveLibrary(library);
    const [game] = await scanGames(library, [id]);
    res.status(201).json({ game });
  } catch (error) {
    await removeTempFile(swfFile);
    await removeTempFile(thumbnailFile);
    if (destination) {
      await removeFileIfExists(destination);
    }
    next(error);
  }
});

app.put("/api/games/:id/metadata", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const gamePath = resolveGamePath(id);
    const stat = await fileStat(gamePath);
    const library = await loadLibrary();
    const existing = library.games[id] || createDefaultMetadata(id, stat);
    library.games[id] = normalizeMetadata({
      ...existing,
      ...parseMetadataPayload(req.body),
      timesPlayed: existing.timesPlayed,
      lastPlayedAt: existing.lastPlayedAt
    });

    await saveLibrary(library);
    const [game] = await scanGames(library, [id]);
    res.json({ game });
  } catch (error) {
    next(error);
  }
});

app.post("/api/games/:id/thumbnail", thumbnailUpload.single("thumbnail"), async (req, res, next) => {
  const thumbnailFile = req.file;

  try {
    if (!thumbnailFile) {
      res.status(400).json({ error: "A thumbnail image is required." });
      return;
    }

    const id = decodeGameId(req.params.id);
    await fileStat(resolveGamePath(id));

    const library = await loadLibrary();
    const existing = library.games[id] || createDefaultMetadata(id, await fileStat(resolveGamePath(id)));
    const previousThumbnail = existing.thumbnail;
    library.games[id] = normalizeMetadata({
      ...existing,
      thumbnail: await persistThumbnail(id, thumbnailFile)
    });

    if (previousThumbnail && previousThumbnail !== library.games[id].thumbnail) {
      await removeThumbnail(previousThumbnail);
    }

    await saveLibrary(library);
    const [game] = await scanGames(library, [id]);
    res.json({ game });
  } catch (error) {
    await removeTempFile(thumbnailFile);
    next(error);
  }
});

app.post("/api/games/:id/play", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const gamePath = resolveGamePath(id);
    const stat = await fileStat(gamePath);
    const library = await loadLibrary();
    const metadata = library.games[id] || createDefaultMetadata(id, stat);

    metadata.timesPlayed = Number(metadata.timesPlayed || 0) + 1;
    metadata.lastPlayedAt = new Date().toISOString();
    library.games[id] = normalizeMetadata(metadata);

    await saveLibrary(library);
    const [game] = await scanGames(library, [id]);
    res.json({ game });
  } catch (error) {
    next(error);
  }
});

app.put("/api/games/:id/favorite", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const gamePath = resolveGamePath(id);
    const stat = await fileStat(gamePath);
    const library = await loadLibrary();
    const existing = library.games[id] || createDefaultMetadata(id, stat);

    library.games[id] = normalizeMetadata({
      ...existing,
      favorite: Boolean(req.body?.favorite)
    });

    await saveLibrary(library);
    const [game] = await scanGames(library, [id]);
    res.json({ game });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/games/:id", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const gamePath = resolveGamePath(id);
    await fileStat(gamePath);

    const library = await loadLibrary();
    const thumbnail = library.games[id]?.thumbnail;

    await removeFileIfExists(gamePath);

    if (thumbnail) {
      await removeThumbnail(thumbnail);
    }

    delete library.games[id];
    await saveLibrary(library);
    res.json({ deletedId: id });
  } catch (error) {
    next(error);
  }
});

app.get("/api/games/:id/swf", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const gamePath = resolveGamePath(id);
    await fileStat(gamePath);
    const library = await loadLibrary();
    const metadataName = library.games[id]?.name;
    const downloadName = sanitizeDownloadName(metadataName || path.basename(id));
    res.type("application/x-shockwave-flash");
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${downloadName}"`);
    res.sendFile(gamePath);
  } catch (error) {
    next(error);
  }
});

app.get("/api/games/:id/thumbnail", async (req, res, next) => {
  try {
    const id = decodeGameId(req.params.id);
    const library = await loadLibrary();
    const thumbnail = library.games[id]?.thumbnail;

    if (!thumbnail) {
      res.status(404).json({ error: "Thumbnail not found." });
      return;
    }

    const thumbnailPath = resolveThumbnailPath(thumbnail);
    await fileStat(thumbnailPath);
    res.sendFile(thumbnailPath);
  } catch (error) {
    next(error);
  }
});

if (fsSync.existsSync(path.join(clientDir, "index.html"))) {
  app.use(express.static(clientDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = status === 500 ? "Unexpected server error." : error.message;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({ error: message });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Flash UI listening on http://0.0.0.0:${port}`);
  console.log(`Games directory: ${gamesDir}`);
  console.log(`Settings path: ${settingsPath}`);
});

async function ensureStorage() {
  await fs.mkdir(gamesDir, { recursive: true });
  await fs.mkdir(thumbnailsDir(), { recursive: true });
  await fs.mkdir(incomingDir(), { recursive: true });

  if (!fsSync.existsSync(metadataPath())) {
    await saveLibrary({ games: {} });
  }
}

function createUploadStorage() {
  return multer.diskStorage({
    destination(_req, _file, callback) {
      ensureStorage()
        .then(() => callback(null, incomingDir()))
        .catch((error) => callback(error, incomingDir()));
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  });
}

async function loadSettings() {
  const bootstrapSettings = await readSettingsFile(defaultSettingsPath);

  if (bootstrapSettings) {
    const normalizedBootstrapSettings = normalizeSettings(bootstrapSettings);

    if (normalizedBootstrapSettings.settingsPath !== defaultSettingsPath) {
      const linkedSettings = await readSettingsFile(normalizedBootstrapSettings.settingsPath);
      const normalizedLinkedSettings = normalizeSettings({
        ...normalizedBootstrapSettings,
        ...linkedSettings,
        settingsPath: normalizedBootstrapSettings.settingsPath
      });
      await saveSettings(normalizedLinkedSettings);
      return normalizedLinkedSettings;
    }

    return normalizedBootstrapSettings;
  }

  const initialSettings = normalizeSettings({});
  await saveSettings(initialSettings);
  return initialSettings;
}

async function readSettingsFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function saveSettings(nextSettings) {
  await writeSettingsFile(nextSettings.settingsPath, nextSettings);

  if (nextSettings.settingsPath !== defaultSettingsPath) {
    await writeSettingsFile(defaultSettingsPath, nextSettings);
  }
}

async function writeSettingsFile(filePath, nextSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizeSettings(value = {}) {
  const rawGamesDir = typeof value.gamesDir === "string" ? value.gamesDir.trim() : defaultGamesDir;
  const rawSettingsPath = typeof value.settingsPath === "string" ? value.settingsPath.trim() : defaultSettingsPath;

  if (!rawGamesDir) {
    const error = new Error("Games folder path is required.");
    error.status = 400;
    throw error;
  }

  if (!rawSettingsPath) {
    const error = new Error("Settings file path is required.");
    error.status = 400;
    throw error;
  }

  return {
    gamesDir: path.resolve(rawGamesDir),
    settingsPath: path.resolve(rawSettingsPath)
  };
}

function toSettingsResponse() {
  return {
    gamesDir,
    settingsPath
  };
}

function metadataPath() {
  return path.join(gamesDir, "metadata.json");
}

function thumbnailsDir() {
  return path.join(gamesDir, "thumbnails");
}

function incomingDir() {
  return path.join(gamesDir, ".incoming");
}

function resolveRuffleDir() {
  const ruffleEntry = require.resolve("@ruffle-rs/ruffle/ruffle.js");
  return path.dirname(ruffleEntry);
}

async function loadLibrary() {
  try {
    const raw = await fs.readFile(metadataPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      games: typeof parsed.games === "object" && parsed.games ? parsed.games : {}
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { games: {} };
    }
    throw error;
  }
}

async function saveLibrary(library) {
  const cleanLibrary = {
    games: Object.fromEntries(
      Object.entries(library.games || {}).map(([id, metadata]) => [id, normalizeMetadata(metadata)])
    )
  };

  const tempPath = `${metadataPath()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(cleanLibrary, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, metadataPath());
}

function parseLibraryPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("Metadata import must be a JSON object.");
    error.status = 400;
    throw error;
  }

  const rawGames = value.games && typeof value.games === "object" && !Array.isArray(value.games)
    ? value.games
    : value;

  return {
    games: Object.fromEntries(
      Object.entries(rawGames).map(([id, metadata]) => [id, normalizeMetadata(metadata)])
    )
  };
}

function parseJsonPayload(raw, message) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

async function scanGames(library, onlyIds = null) {
  const files = await walkGames(gamesDir);
  const allowed = onlyIds ? new Set(onlyIds) : null;
  const games = [];

  for (const filePath of files) {
    const id = toRelativeId(filePath);
    if (allowed && !allowed.has(id)) {
      continue;
    }

    const stat = await fileStat(filePath);
    if (!library.games[id]) {
      library.games[id] = createDefaultMetadata(id, stat);
    } else {
      library.games[id] = normalizeMetadata(library.games[id]);
    }

    games.push(toGameResponse(id, stat, library.games[id]));
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}

async function walkGames(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "thumbnails") {
        continue;
      }
      files.push(...await walkGames(entryPath));
    } else if (entry.isFile() && isSwfFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function createDefaultMetadata(id, stat) {
  return normalizeMetadata({
    name: baseNameWithoutExtension(id),
    description: "",
    notes: "",
    tags: [],
    favorite: false,
    dateAdded: stat.birthtime?.toISOString?.() || new Date().toISOString(),
    timesPlayed: 0,
    lastPlayedAt: null,
    version: "",
    thumbnail: null,
    launchOptions: {
      parameters: {},
      allowFullscreen: true,
      backgroundColor: null
    }
  });
}

function normalizeMetadata(metadata = {}) {
  return {
    name: stringOrEmpty(metadata.name),
    description: stringOrEmpty(metadata.description),
    notes: stringOrEmpty(metadata.notes),
    tags: normalizeTags(metadata.tags),
    favorite: metadata.favorite === true,
    dateAdded: normalizeDate(metadata.dateAdded),
    timesPlayed: Number.isFinite(Number(metadata.timesPlayed)) ? Number(metadata.timesPlayed) : 0,
    lastPlayedAt: metadata.lastPlayedAt || null,
    version: stringOrEmpty(metadata.version),
    thumbnail: metadata.thumbnail || null,
    launchOptions: normalizeLaunchOptions(metadata.launchOptions)
  };
}

function normalizeLaunchOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      parameters: {},
      allowFullscreen: true,
      backgroundColor: null
    };
  }

  return {
    ...value,
    allowFullscreen: value.allowFullscreen !== false
  };
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseMetadataPayload(payload) {
  if (!payload) {
    return {};
  }

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return parseMetadataPayload(parsed);
    } catch {
      const error = new Error("Metadata must be valid JSON.");
      error.status = 400;
      throw error;
    }
  }

  return {
    name: payload.name,
    description: payload.description,
    notes: payload.notes,
    tags: payload.tags,
    dateAdded: payload.dateAdded,
    version: payload.version,
    thumbnail: payload.thumbnail,
    launchOptions: payload.launchOptions
  };
}

function toGameResponse(id, stat, metadata) {
  const encodedId = encodeURIComponent(id);

  return {
    id,
    fileName: path.basename(id),
    relativePath: id,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    swfUrl: `/api/games/${encodedId}/swf`,
    thumbnailUrl: metadata.thumbnail ? `/api/games/${encodedId}/thumbnail` : null,
    ...metadata
  };
}

async function uniqueFileName(originalName) {
  const extension = path.extname(originalName);
  const base = baseNameWithoutExtension(originalName);
  let candidate = `${base}${extension}`;
  let counter = 2;

  while (fsSync.existsSync(path.join(gamesDir, candidate))) {
    candidate = `${base}-${counter}${extension}`;
    counter += 1;
  }

  return candidate;
}

async function persistThumbnail(id, file) {
  if (!isImageFile(file.originalname, file.mimetype)) {
    await removeTempFile(file);
    const error = new Error("Thumbnail must be a PNG, JPG, JPEG, WEBP, or GIF image.");
    error.status = 400;
    throw error;
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const hash = crypto.createHash("sha1").update(id).digest("hex").slice(0, 16);
  const fileName = `${hash}${extension}`;
  const destination = path.join(thumbnailsDir(), fileName);
  await removeFileIfExists(destination);
  await fs.rename(file.path, destination);
  return fileName;
}

async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeThumbnail(fileName) {
  try {
    await fs.unlink(resolveThumbnailPath(fileName));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeTempFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function fileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      const notFound = new Error("Game not found.");
      notFound.status = 404;
      throw notFound;
    }
    throw error;
  }
}

function decodeGameId(value) {
  return decodeURIComponent(value);
}

function resolveGamePath(id) {
  const resolved = path.resolve(gamesDir, id);
  if (!isInside(gamesDir, resolved) || !isSwfFile(resolved)) {
    const error = new Error("Invalid game path.");
    error.status = 400;
    throw error;
  }
  return resolved;
}

function resolveThumbnailPath(fileName) {
  const resolved = path.resolve(thumbnailsDir(), fileName);
  if (!isInside(thumbnailsDir(), resolved)) {
    const error = new Error("Invalid thumbnail path.");
    error.status = 400;
    throw error;
  }
  return resolved;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toRelativeId(filePath) {
  return path.relative(gamesDir, filePath).split(path.sep).join("/");
}

function sanitizeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const base = baseNameWithoutExtension(fileName)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "game";

  return `${base}${extension}`;
}

function sanitizeDownloadName(value) {
  const extension = path.extname(value).toLowerCase() === ".swf" ? "" : ".swf";
  const base = baseNameWithoutExtension(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "game";

  return `${base}${extension}`;
}

function baseNameWithoutExtension(fileName) {
  return path.basename(fileName, path.extname(fileName));
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function isSwfFile(fileName) {
  return path.extname(fileName).toLowerCase() === ".swf";
}

function isImageFile(fileName, mimeType) {
  const extension = path.extname(fileName).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)
    && /^image\/(png|jpe?g|webp|gif)$/.test(mimeType || "");
}
