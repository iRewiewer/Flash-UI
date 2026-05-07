import { FileUp } from "lucide-react";

type DropOverlayProps = {
  visible: boolean;
};

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="dropOverlay">
      <div>
        <FileUp size={34} />
        <strong>Drop SWF</strong>
      </div>
    </div>
  );
}
