import {
  CalendarDays,
  FileUp,
  Grid3X3,
  List,
  Pencil,
  Search,
  Tags
} from "lucide-react";
import type { Game, LayoutMode } from "../types";

type GameLibraryProps = {
  games: Game[];
  selectedId: string | null;
  layout: LayoutMode;
  query: string;
  onQueryChange: (query: string) => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onSelect: (game: Game) => void;
  onEdit: (game: Game) => void;
  onUploadClick: () => void;
};

export function GameLibrary({
  games,
  selectedId,
  layout,
  query,
  onQueryChange,
  onLayoutChange,
  onSelect,
  onEdit,
  onUploadClick
}: GameLibraryProps) {
  return (
    <aside className="library">
      <div className="libraryHeader">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Flash UI</h1>
        </div>
        <button className="iconButton primary" type="button" onClick={onUploadClick} title="Upload SWF">
          <FileUp size={19} />
        </button>
      </div>

      <div className="toolbar">
        <label className="searchBox">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search games"
          />
        </label>
        <div className="segmented" aria-label="Layout">
          <button
            className={layout === "grid" ? "active" : ""}
            type="button"
            onClick={() => onLayoutChange("grid")}
            title="Grid"
          >
            <Grid3X3 size={17} />
          </button>
          <button
            className={layout === "list" ? "active" : ""}
            type="button"
            onClick={() => onLayoutChange("list")}
            title="List"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className={`gameCollection ${layout}`}>
        {games.map((game) => (
          <button
            className={`gameItem ${selectedId === game.id ? "selected" : ""}`}
            key={game.id}
            type="button"
            onClick={() => onSelect(game)}
          >
            <GameThumb game={game} />
            <span className="gameText">
              <span className="gameName">{game.name || game.fileName}</span>
              <span className="gameDescription">{game.description || game.relativePath}</span>
              <span className="gameMeta">
                <span>
                  <CalendarDays size={14} />
                  {formatDate(game.dateAdded)}
                </span>
                {game.tags.length > 0 && (
                  <span>
                    <Tags size={14} />
                    {game.tags.slice(0, 2).join(", ")}
                  </span>
                )}
              </span>
            </span>
            <span
              className="inlineEdit"
              role="button"
              tabIndex={0}
              title="Edit metadata"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(game);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onEdit(game);
                }
              }}
            >
              <Pencil size={15} />
            </span>
          </button>
        ))}
      </div>

      {games.length === 0 && (
        <div className="emptyLibrary">
          <p>No games found.</p>
          <button type="button" onClick={onUploadClick}>
            <FileUp size={17} />
            Upload SWF
          </button>
        </div>
      )}
    </aside>
  );
}

export function GameThumb({ game }: { game: Game }) {
  if (game.thumbnailUrl) {
    return (
      <span className="gameThumb imageThumb">
        <img src={game.thumbnailUrl} alt="" />
      </span>
    );
  }

  return (
    <span className="gameThumb letterThumb">
      {getInitials(game.name || game.fileName)}
    </span>
  );
}

function getInitials(value: string) {
  const words = value
    .replace(/\.swf$/i, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (words[0]?.[0] || "F").concat(words[1]?.[0] || "").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
