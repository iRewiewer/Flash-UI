import { Save, X } from "lucide-react";
import { useState } from "react";
import type { AppSettings } from "../types";

type SettingsModalProps = {
  settings: AppSettings | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (gamesDir: string) => Promise<void>;
};

export function SettingsModal({ settings, busy, onCancel, onSave }: SettingsModalProps) {
  const [gamesDir, setGamesDir] = useState(settings?.gamesDir || "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!gamesDir.trim()) {
      setError("Games folder path is required.");
      return;
    }

    setError(null);
    await onSave(gamesDir.trim());
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
            <span>Games folder path</span>
            <input
              value={gamesDir}
              onChange={(event) => setGamesDir(event.target.value)}
              placeholder="/data/games"
              required
            />
          </label>
          {settings?.settingsPath && (
            <p className="settingsHint">Settings file: {settings.settingsPath}</p>
          )}
        </div>

        {error && <p className="formError">{error}</p>}

        <div className="modalActions">
          <div />
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
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
