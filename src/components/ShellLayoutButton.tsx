import { Columns2, GalleryVerticalEnd, PanelLeftClose } from "lucide-react";
import type { ShellLayoutMode } from "../types";

type ShellLayoutButtonProps = {
  mode: ShellLayoutMode;
  onClick: () => void;
  className?: string;
};

const modeDetails: Record<ShellLayoutMode, { label: string; title: string; icon: typeof PanelLeftClose }> = {
  compact: {
    label: "Compact",
    title: "Layout: compact player",
    icon: PanelLeftClose
  },
  split: {
    label: "Split",
    title: "Layout: library and player",
    icon: Columns2
  },
  library: {
    label: "Library",
    title: "Layout: full library",
    icon: GalleryVerticalEnd
  }
};

export function ShellLayoutButton({ mode, onClick, className = "iconButton" }: ShellLayoutButtonProps) {
  const details = modeDetails[mode];
  const Icon = details.icon;

  return (
    <button className={className} type="button" onClick={onClick} title={`${details.title}. Click to change.`}>
      <Icon size={19} />
      <span className="srOnly">{details.label}</span>
    </button>
  );
}
