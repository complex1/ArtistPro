import type { CSSProperties } from "react";
import { AppIcon } from "../../shared/AppIcon";

type Props = {
  name?: string | null;
  image?: string | null;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  color?: string;
  /** Accepted for Lucide API compatibility; ignored. */
  strokeWidth?: number;
};

/** Desktop wrapper around the shared Iconify renderer. */
export function DynamicIcon(props: Props) {
  const { strokeWidth: _strokeWidth, ...rest } = props;
  return <AppIcon {...rest} />;
}
