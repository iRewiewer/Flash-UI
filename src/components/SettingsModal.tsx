import { Download, RotateCw, Save, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AppSettings, BrowserSettings } from "../types";

type SettingsModalProps = {
  settings: AppSettings | null;
  browserSettings: BrowserSettings;
  busy: boolean;
  onCancel: () => void;
  onSave: (gamesDir: string, settingsPath: string, browserSettings: BrowserSettings) => Promise<void>;
  onExportMetadata: () => Promise<void>;
  onImportMetadata: (file: File) => Promise<void>;
  onClearFavorites: () => Promise<void>;
  onClearBrowserStorage: () => Promise<void>;
};

export function SettingsModal({
  settings,
  browserSettings,
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
  const [defaultPlayerVolume, setDefaultPlayerVolume] = useState(browserSettings.defaultPlayerVolume);
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
    await onSave(gamesDir.trim(), settingsPath.trim(), {
      defaultPlayerVolume
    });
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
            <span>Games folder path (absolute)</span>
            <input
              value={gamesDir}
              onChange={(event) => setGamesDir(event.target.value)}
              placeholder="/data/games"
              required
            />
          </label>
          <label className="wide">
            <span>Settings file path (absolute)</span>
            <input
              value={settingsPath}
              onChange={(event) => setSettingsPath(event.target.value)}
              placeholder="/data/config/settings.json"
              required
            />
          </label>
          <p className="settingsHint">Missing folders and settings files are created automatically.</p>
          <label className="wide">
            <span>Default player volume</span>
            <div className="settingsSlider">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={defaultPlayerVolume}
                onChange={(event) => setDefaultPlayerVolume(clampVolume(Number(event.target.value)))}
              />
              <strong>{Math.round(defaultPlayerVolume * 100)}</strong>
            </div>
          </label>
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

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, value));
}
