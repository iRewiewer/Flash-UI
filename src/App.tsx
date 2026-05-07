import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFormState,
  fetchGames,
  updateGameMetadata,
  updateGameThumbnail,
  uploadGame
} from "./api";
import { DropOverlay } from "./components/DropOverlay";
import { GameLibrary } from "./components/GameLibrary";
import { MetadataModal } from "./components/MetadataModal";
import { PlayerPanel } from "./components/PlayerPanel";
import type { Game, LayoutMode, MetadataFormState } from "./types";

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
  const [layout, setLayout] = useState<LayoutMode>(() => {
    return localStorage.getItem("flash-ui-layout") === "list" ? "list" : "grid";
  });
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshGames();
  }, []);

  useEffect(() => {
    localStorage.setItem("flash-ui-layout", layout);
  }, [layout]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return games;
    }

    return games.filter((game) => {
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
  }, [games, query]);

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

  function openUploadPicker() {
    fileInputRef.current?.click();
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
      className="appShell"
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

      <GameLibrary
        games={filteredGames}
        selectedId={selectedId}
        layout={layout}
        query={query}
        onQueryChange={setQuery}
        onLayoutChange={setLayout}
        onSelect={(game) => setSelectedId(game.id)}
        onEdit={(game) => setModal({ type: "edit", game, initialValue: createFormState(game) })}
        onUploadClick={openUploadPicker}
      />

      <PlayerPanel
        game={selectedGame}
        onGameUpdated={upsertGame}
        onEdit={(game) => setModal({ type: "edit", game, initialValue: createFormState(game) })}
      />

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
        />
      )}

      <DropOverlay visible={isDragging} />
    </main>
  );
}
