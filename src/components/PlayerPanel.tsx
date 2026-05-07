import { ExternalLink, Maximize2, Pencil, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recordGamePlay } from "../api";
import type { Game } from "../types";
import { GameThumb } from "./GameLibrary";

type PlayerPanelProps = {
  game: Game | null;
  onGameUpdated: (game: Game) => void;
  onEdit: (game: Game) => void;
};

type RufflePlayerApi = {
  load: (options: Record<string, unknown> | string) => Promise<void>;
  requestFullscreen: () => void;
  fullscreenEnabled: boolean;
};

type RuffleElement = HTMLElement & {
  ruffle: () => RufflePlayerApi;
};

declare global {
  interface Window {
    RufflePlayer?: {
      config?: Record<string, unknown>;
      newest?: () => {
        createPlayer: () => RuffleElement;
      };
    };
  }
}

let ruffleScriptPromise: Promise<void> | null = null;

export function PlayerPanel({ game, onGameUpdated, onEdit }: PlayerPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<RuffleElement | null>(null);
  const lastRecordedGameIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const launchOptionsKey = game ? JSON.stringify(game.launchOptions) : "";

  useEffect(() => {
    let cancelled = false;

    async function mountPlayer() {
      if (!game || !containerRef.current) {
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setError(null);
      containerRef.current.replaceChildren();

      try {
        await loadRuffleScript();

        if (cancelled || !containerRef.current) {
          return;
        }

        const ruffle = window.RufflePlayer?.newest?.();

        if (!ruffle) {
          throw new Error("Ruffle API is not available.");
        }

        const player = ruffle.createPlayer();
        player.className = "rufflePlayer";
        containerRef.current.appendChild(player);
        playerRef.current = player;

        await player.ruffle().load({
          ...game.launchOptions,
          url: game.swfUrl,
          allowFullscreen: true,
          publicPath: "/ruffle/"
        });

        if (!cancelled && lastRecordedGameIdRef.current !== game.id) {
          lastRecordedGameIdRef.current = game.id;
          recordGamePlay(game.id)
            .then(onGameUpdated)
            .catch((playError) => console.warn("Could not update play count", playError));
        }

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the SWF.");
          setStatus("error");
        }
      }
    }

    mountPlayer();

    return () => {
      cancelled = true;
      playerRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, [game?.id, game?.swfUrl, launchOptionsKey]);

  async function handleFullscreen() {
    const player = playerRef.current;

    if (player?.ruffle().fullscreenEnabled) {
      player.ruffle().requestFullscreen();
      return;
    }

    await containerRef.current?.requestFullscreen?.();
  }

  return (
    <section className="playerPanel">
      {game ? (
        <>
          <div className="playerHeader">
            <div className="selectedGame">
              <GameThumb game={game} />
              <div>
                <p className="eyebrow">Now playing</p>
                <h2>{game.name || game.fileName}</h2>
                <p>{game.description || game.relativePath}</p>
              </div>
            </div>
            <div className="playerActions">
              <button type="button" onClick={() => onEdit(game)} title="Edit metadata">
                <Pencil size={17} />
                Edit
              </button>
              <a href={game.swfUrl} target="_blank" rel="noreferrer" title="Open SWF">
                <ExternalLink size={17} />
                SWF
              </a>
              <button type="button" onClick={handleFullscreen} disabled={status !== "ready"} title="Fullscreen">
                <Maximize2 size={17} />
                Fullscreen
              </button>
            </div>
          </div>

          <div className="stageShell">
            <div className="stage" ref={containerRef} />
            {status === "loading" && (
              <div className="stageOverlay">
                <RotateCw className="spin" size={22} />
                Loading
              </div>
            )}
            {status === "error" && (
              <div className="stageOverlay errorState">
                {error}
              </div>
            )}
          </div>

          <div className="detailsBand">
            <dl>
              <div>
                <dt>Times played</dt>
                <dd>{game.timesPlayed}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{game.version || "Unspecified"}</dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>{game.relativePath}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(game.sizeBytes)}</dd>
              </div>
            </dl>
            {game.tags.length > 0 && (
              <div className="tagsRow">
                {game.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            {game.notes && <p className="notes">{game.notes}</p>}
          </div>
        </>
      ) : (
        <div className="emptyPlayer">
          <h2>Select a game</h2>
          <p>Drop SWFs into the games folder or upload one from this page.</p>
        </div>
      )}
    </section>
  );
}

function loadRuffleScript() {
  if (window.RufflePlayer?.newest) {
    return Promise.resolve();
  }

  if (!ruffleScriptPromise) {
    ruffleScriptPromise = new Promise((resolve, reject) => {
      const rufflePlayer = window.RufflePlayer || {};
      window.RufflePlayer = rufflePlayer;
      rufflePlayer.config = {
        publicPath: "/ruffle/",
        polyfills: false,
        autoplay: "auto"
      };

      const script = document.createElement("script");
      script.src = "/ruffle/ruffle.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Ruffle could not be loaded."));
      document.head.appendChild(script);
    });
  }

  return ruffleScriptPromise;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
