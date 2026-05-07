import { ImagePlus, Save, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { validateLaunchOptions } from "../api";
import type { Game, MetadataFormState } from "../types";

type MetadataModalProps = {
  mode: "upload" | "edit";
  game?: Game;
  swf?: File;
  initialValue: MetadataFormState;
  busy: boolean;
  onCancel: () => void;
  onSave: (metadata: MetadataFormState, thumbnail: File | null) => Promise<void>;
  onDelete?: (game: Game) => Promise<void>;
};

export function MetadataModal({
  mode,
  game,
  swf,
  initialValue,
  busy,
  onCancel,
  onSave,
  onDelete
}: MetadataModalProps) {
  const [metadata, setMetadata] = useState(initialValue);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launchOptionsError = useMemo(
    () => validateLaunchOptions(metadata.launchOptions),
    [metadata.launchOptions]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateLaunchOptions(metadata.launchOptions);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    await onSave(metadata, thumbnail);
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">{mode === "upload" ? "New SWF" : "Metadata"}</p>
            <h2>{mode === "upload" ? swf?.name : game?.fileName}</h2>
          </div>
          <button className="iconButton" type="button" onClick={onCancel} title="Close">
            <X size={19} />
          </button>
        </div>

        <div className="formGrid">
          <label>
            <span>Name</span>
            <input
              value={metadata.name}
              onChange={(event) => setMetadata({ ...metadata, name: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Version</span>
            <input
              value={metadata.version}
              onChange={(event) => setMetadata({ ...metadata, version: event.target.value })}
              placeholder="1.0, hacked, original"
            />
          </label>
          <label>
            <span>Tags</span>
            <input
              value={metadata.tags}
              onChange={(event) => setMetadata({ ...metadata, tags: event.target.value })}
              placeholder="arcade, puzzle, favorite"
            />
          </label>
          <label>
            <span>Date added</span>
            <input
              type="datetime-local"
              value={toDateTimeLocal(metadata.dateAdded)}
              onChange={(event) => {
                const value = event.target.value;
                setMetadata({
                  ...metadata,
                  dateAdded: value ? new Date(value).toISOString() : new Date().toISOString()
                });
              }}
            />
          </label>
          <label className="wide">
            <span>Short description</span>
            <textarea
              rows={3}
              value={metadata.description}
              onChange={(event) => setMetadata({ ...metadata, description: event.target.value })}
            />
          </label>
          <label className="wide">
            <span>Notes</span>
            <textarea
              rows={4}
              value={metadata.notes}
              onChange={(event) => setMetadata({ ...metadata, notes: event.target.value })}
            />
          </label>
          <label className="wide">
            <span>Ruffle launch options</span>
            <textarea
              className={launchOptionsError ? "invalid" : ""}
              rows={8}
              spellCheck={false}
              value={metadata.launchOptions}
              onChange={(event) => setMetadata({ ...metadata, launchOptions: event.target.value })}
            />
          </label>
          <label className="thumbnailPicker">
            <span>
              <ImagePlus size={17} />
              Thumbnail
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => setThumbnail(event.target.files?.[0] || null)}
            />
            <strong>{thumbnail?.name || game?.thumbnail || "No file selected"}</strong>
          </label>
        </div>

        {(error || launchOptionsError) && (
          <p className="formError">{error || launchOptionsError}</p>
        )}

        <div className="modalActions">
          <div>
            {mode === "edit" && game && onDelete && (
              <button className="dangerAction" type="button" onClick={() => onDelete(game)} disabled={busy}>
                <Trash2 size={17} />
                Delete
              </button>
            )}
          </div>
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button className="primaryAction" type="submit" disabled={busy || Boolean(launchOptionsError)}>
              {mode === "upload" ? <Upload size={17} /> : <Save size={17} />}
              {busy ? "Saving" : mode === "upload" ? "Upload" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
