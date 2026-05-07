import { Download, RotateCw, Save, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AppSettings } from "../types";

type SettingsModalProps = {
  settings: AppSettings | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (gamesDir: string, settingsPath: string) => Promise<void>;
  onExportMetadata: () => Promise<void>;
  onImportMetadata: (file: File) => Promise<void>;
  onClearFavorites: () => Promise<void>;
  onClearBrowserStorage: () => Promise<void>;
};

export function SettingsModal({
  settings,
  busy,
  onCancel,
  onSave,
  onExportMetadata,
  onImportMetadata,
  onClearFavorites,
  onClearBrowserStorage
}: SettingsModalProps) {
  const metadataInputRef = useRef<HTMLInputElement | null>(null);
  const [gamesDir, setGamesDir] = useState(settings?.gamesDir || "");
  const [settingsPath, setSettingsPath] = useState(settings?.settingsPath || "");
  const [error, setError] = useState<string | null>(null);
  const gamesDirChanged = gamesDir.trim() !== (settings?.gamesDir || "");
  const settingsPathChanged = settingsPath.trim() !== (settings?.settingsPath || "");
  const storagePathChanged = gamesDirChanged || settingsPathChanged;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!gamesDir.trim()) {
      setError("Games folder path is required.");
      return;
    }

    if (!settingsPath.trim()) {
      setError("Settings file path is required.");
      return;
    }

    setError(null);
    await onSave(gamesDir.trim(), settingsPath.trim());
  }

  async function handleClearStorage() {
    const confirmed = window.confirm(
      "Clear browser cache, cookies, local storage, and Flash/Ruffle browser storage for this site?"
    );

    if (!confirmed) {
      return;
    }

    await onClearBrowserStorage();
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <form className="modal settingsModal" onSubmit={handleSubmit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Options</p>
            <h2>Settings</h2>
          </div>
          <button className="iconButton" type="button" onClick={onCancel} title="Close">
            <X size={19} />
          </button>
        </div>

        <div className="formGrid">
          <label className="wide">
            <span>Games folder path (container absolute)</span>
            <input
              value={gamesDir}
              onChange={(event) => setGamesDir(event.target.value)}
              placeholder="/data/games"
              required
            />
          </label>
          <label className="wide">
            <span>Settings file path (container absolute)</span>
            <input
              value={settingsPath}
              onChange={(event) => setSettingsPath(event.target.value)}
              placeholder="/data/config/settings.json"
              required
            />
          </label>
          <p className="settingsHint">
            Docker paths are inside the container. Mount host folders in compose, then point these fields at the mounted path.
            Missing folders and settings files are created automatically.
          </p>
          <div className="settingsButtonGroup">
            <input
              ref={metadataInputRef}
              className="hiddenInput"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) {
                  onImportMetadata(file);
                }
              }}
            />
            <button type="button" onClick={onExportMetadata} disabled={busy}>
              <Download size={17} />
              Export metadata
            </button>
            <button type="button" onClick={() => metadataInputRef.current?.click()} disabled={busy}>
              <Upload size={17} />
              Import metadata
            </button>
            <button className="dangerAction" type="button" onClick={handleClearStorage} disabled={busy}>
              <Trash2 size={17} />
              Clear cache
            </button>
            <button className="dangerAction" type="button" onClick={onClearFavorites} disabled={busy}>
              <Trash2 size={17} />
              Clear favorites
            </button>
          </div>
        </div>

        {error && <p className="formError">{error}</p>}

        <div className="modalActions">
          <div />
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            {storagePathChanged && (
              <button className="primaryAction" type="submit" disabled={busy}>
                <RotateCw size={17} />
                {busy ? "Reloading" : "Reload"}
              </button>
            )}
            <button className="primaryAction" type="submit" disabled={busy}>
              <Save size={17} />
              {busy ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
