import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearFavorites,
  createFormState,
  deleteGame,
  exportMetadata,
  fetchGames,
  fetchSettings,
  importMetadata,
  updateGameFavorite,
  updateGameMetadata,
  updateGameVolume,
  updateSettings,
  updateGameThumbnail,
  uploadGame
} from "./api";
import { FileUp, Settings, Star } from "lucide-react";
import { DropOverlay } from "./components/DropOverlay";
import { GameLibrary } from "./components/GameLibrary";
import { MetadataModal } from "./components/MetadataModal";
import { PlayerPanel } from "./components/PlayerPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ShellLayoutButton } from "./components/ShellLayoutButton";
import type { AppSettings, Game, LayoutMode, MetadataFormState, ShellLayoutMode } from "./types";

type ModalState =
  | {
      type: "upload";
      swf: File;
      initialValue: MetadataFormState;
    }
  | {
      type: "edit";
      game: Game;
      initialValue: MetadataFormState;
    }
  | null;

export function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(() => localStorage.getItem("flash-ui-favorite-only") === "1");
  const [layout, setLayout] = useState<LayoutMode>(() => {
    return localStorage.getItem("flash-ui-layout") === "list" ? "list" : "grid";
  });
  const [shellLayout, setShellLayout] = useState<ShellLayoutMode>(() => {
    const saved = localStorage.getItem("flash-ui-shell-layout");
    return saved === "compact" || saved === "library" || saved === "split" ? saved : "split";
  });
  const [modal, setModal] = useState<ModalState>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshGames();
    refreshSettings();
  }, []);

  useEffect(() => {
    localStorage.setItem("flash-ui-layout", layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem("flash-ui-shell-layout", shellLayout);
  }, [shellLayout]);

  useEffect(() => {
    localStorage.setItem("flash-ui-favorite-only", favoriteOnly ? "1" : "0");
  }, [favoriteOnly]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visibleGames = favoriteOnly ? games.filter((game) => game.favorite) : games;

    if (!normalizedQuery) {
      return visibleGames;
    }

    return visibleGames.filter((game) => {
      return [
        game.name,
        game.description,
        game.notes,
        game.relativePath,
        game.version,
        game.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [favoriteOnly, games, query]);

  const selectedGame = useMemo(() => {
    return games.find((game) => game.id === selectedId) || null;
  }, [games, selectedId]);

  async function refreshGames() {
    try {
      const nextGames = await fetchGames();
      setGames(nextGames);

      setSelectedId((current) => {
        if (current && nextGames.some((game) => game.id === current)) {
          return current;
        }

        return nextGames[0]?.id || null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load games.");
    }
  }

  async function refreshSettings() {
    try {
      setSettings(await fetchSettings());
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Could not load settings.");
    }
  }

  function openUploadPicker() {
    fileInputRef.current?.click();
  }

  function cycleShellLayout() {
    setShellLayout((current) => {
      if (current === "compact") {
        return "split";
      }

      if (current === "split") {
        return "library";
      }

      return "compact";
    });
  }

  function stageUpload(file: File | null | undefined) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".swf")) {
      setError("Only .swf files can be uploaded.");
      return;
    }

    setError(null);
    setModal({
      type: "upload",
      swf: file,
      initialValue: createFormState(undefined, file)
    });
  }

  async function saveModal(metadata: MetadataFormState, thumbnail: File | null) {
    if (!modal) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (modal.type === "upload") {
        const uploaded = await uploadGame(modal.swf, metadata, thumbnail);
        upsertGame(uploaded);
        setSelectedId(uploaded.id);
      } else {
        const updated = await updateGameMetadata(modal.game.id, metadata);
        const withThumbnail = thumbnail
          ? await updateGameThumbnail(updated.id, thumbnail)
          : updated;
        upsertGame(withThumbnail);
        setSelectedId(withThumbnail.id);
      }

      setModal(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save metadata.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedGame(game: Game) {
    const confirmed = window.confirm(
      `Delete "${game.name || game.fileName}" from the library and remove the SWF from disk?`
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const deletedId = await deleteGame(game.id);
      const remainingGames = games.filter((item) => item.id !== deletedId);
      setGames(remainingGames);
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId !== deletedId) {
          return currentSelectedId;
        }

        return remainingGames[0]?.id || null;
      });
      setModal(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete game.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(gamesDir: string, settingsPath: string) {
    setBusy(true);
    setError(null);

    try {
      const nextSettings = await updateSettings(gamesDir, settingsPath);
      setSettings(nextSettings);
      setSettingsModalOpen(false);
      setSelectedId(null);
      await refreshGames();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportMetadata() {
    try {
      const blob = await exportMetadata();
      downloadBlob(blob, `flash-ui-metadata-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : "Could not export metadata.");
    }
  }

  async function handleImportMetadata(file: File) {
    const confirmed = window.confirm("Import this metadata file and replace the current metadata JSON?");

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const importedGames = await importMetadata(file);
      setGames(importedGames);
      setSelectedId(importedGames[0]?.id || null);
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : "Could not import metadata.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearBrowserStorage() {
    setBusy(true);
    setError(null);

    try {
      await clearBrowserStorage();
      setLayout("grid");
      setShellLayout("split");
      setFavoriteOnly(false);
      setSettingsModalOpen(false);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear browser storage.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearFavorites() {
    const confirmed = window.confirm("Clear favorites from every game in the current library?");

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextGames = await clearFavorites();
      setGames(nextGames);
      setFavoriteOnly(false);
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : "Could not clear favorites.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(game: Game) {
    setError(null);

    try {
      const updated = await updateGameFavorite(game.id, !game.favorite);
      upsertGame(updated);
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : "Could not update favorite.");
    }
  }

  async function changeGameVolume(game: Game, volume: number) {
    const nextVolume = clampVolume(volume);
    upsertGame({
      ...game,
      volume: nextVolume
    });

    try {
      const updated = await updateGameVolume(game.id, nextVolume);
      upsertGame(updated);
    } catch (volumeError) {
      setError(volumeError instanceof Error ? volumeError.message : "Could not save game volume.");
    }
  }

  function upsertGame(game: Game) {
    setGames((current) => {
      const existing = current.some((item) => item.id === game.id);
      const next = existing
        ? current.map((item) => (item.id === game.id ? game : item))
        : [...current, game];

      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    stageUpload(event.dataTransfer.files?.[0]);
  }

  return (
    <main
      className={`appShell shell-${shellLayout}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className="hiddenInput"
        type="file"
        accept=".swf,application/x-shockwave-flash"
        onChange={(event) => {
          stageUpload(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {shellLayout === "compact" && (
        <LayoutRail
          shellLayout={shellLayout}
          favoriteOnly={favoriteOnly}
          onUploadClick={openUploadPicker}
          onShellLayoutChange={cycleShellLayout}
          onFavoriteFilterToggle={() => setFavoriteOnly((current) => !current)}
          onSettingsClick={() => setSettingsModalOpen(true)}
        />
      )}

      {shellLayout !== "compact" && (
        <GameLibrary
          games={filteredGames}
          selectedId={selectedId}
          layout={layout}
          shellLayout={shellLayout}
          favoriteOnly={favoriteOnly}
          query={query}
          onQueryChange={setQuery}
          onLayoutChange={setLayout}
          onShellLayoutChange={cycleShellLayout}
          onFavoriteFilterToggle={() => setFavoriteOnly((current) => !current)}
          onSelect={(game) => {
            setSelectedId(game.id);
            if (shellLayout === "library") {
              setShellLayout("compact");
            }
          }}
          onFavoriteToggle={toggleFavorite}
          onEdit={(game) => setModal({ type: "edit", game, initialValue: createFormState(game) })}
          onUploadClick={openUploadPicker}
          onSettingsClick={() => setSettingsModalOpen(true)}
        />
      )}

      {shellLayout !== "library" && (
        <PlayerPanel
          game={selectedGame}
          volume={selectedGame?.volume ?? 0.5}
          onVolumeChange={(nextVolume) => {
            if (selectedGame) {
              changeGameVolume(selectedGame, nextVolume);
            }
          }}
          onGameUpdated={upsertGame}
          onEdit={(game) => setModal({ type: "edit", game, initialValue: createFormState(game) })}
        />
      )}

      {error && (
        <div className="toast" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {modal && (
        <MetadataModal
          mode={modal.type}
          game={modal.type === "edit" ? modal.game : undefined}
          swf={modal.type === "upload" ? modal.swf : undefined}
          initialValue={modal.initialValue}
          busy={busy}
          onCancel={() => setModal(null)}
          onSave={saveModal}
          onDelete={deleteSelectedGame}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          settings={settings}
          busy={busy}
          onCancel={() => setSettingsModalOpen(false)}
          onSave={saveSettings}
          onExportMetadata={handleExportMetadata}
          onImportMetadata={handleImportMetadata}
          onClearFavorites={handleClearFavorites}
          onClearBrowserStorage={handleClearBrowserStorage}
        />
      )}

      <DropOverlay visible={isDragging} />
    </main>
  );
}

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, value));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function clearBrowserStorage() {
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  if ("indexedDB" in window && "databases" in indexedDB) {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .map((name) => new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error || new Error(`Could not delete ${name}`));
          request.onblocked = () => resolve();
        }))
    );
  }

  document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter(Boolean)
    .forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });

  localStorage.clear();
  sessionStorage.clear();
}

function LayoutRail({
  shellLayout,
  favoriteOnly,
  onUploadClick,
  onShellLayoutChange,
  onFavoriteFilterToggle,
  onSettingsClick
}: {
  shellLayout: ShellLayoutMode;
  favoriteOnly: boolean;
  onUploadClick: () => void;
  onShellLayoutChange: () => void;
  onFavoriteFilterToggle: () => void;
  onSettingsClick: () => void;
}) {
  return (
    <nav className="layoutRail" aria-label="Library controls">
      <button className="iconButton primary" type="button" onClick={onUploadClick} title="Upload SWF">
        <FileUp size={19} />
      </button>
      <button className="iconButton" type="button" onClick={onSettingsClick} title="Options">
        <Settings size={19} />
      </button>
      <button
        className={`iconButton ${favoriteOnly ? "active" : ""}`}
        type="button"
        onClick={onFavoriteFilterToggle}
        title={favoriteOnly ? "Show all games" : "Show favorites only"}
      >
        <Star size={19} />
      </button>
      <ShellLayoutButton mode={shellLayout} onClick={onShellLayoutChange} />
    </nav>
  );
}
