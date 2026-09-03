import { Icon } from "@iconify/react";
import type { CSSProperties } from "react";
import {
  DEFAULT_ICONIFY_ID,
  ensureIconifyCollections,
  toIconifyId,
} from "./iconify";

ensureIconifyCollections();

type Props = {
  name?: string | null;
  image?: string | null;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Passed through to Iconify for CSS currentColor inheritance */
  color?: string;
};

const SVG_DATA_URL = /^data:image\/svg\+xml/i;

/**
 * Renders a custom image, an Iconify id (`mdi:home`), or a legacy Lucide
 * PascalCase name (`Home`) mapped to `lucide:home`.
 */
export function AppIcon({
  name,
  image,
  size = 24,
  className,
  style,
  color = "currentColor",
}: Props) {
  const px = typeof size === "number" ? size : Number(size) || 24;

  if (image) {
    // An <img> renders the SVG in its own document, where `currentColor`
    // falls back to black. Paint monochrome glyphs as a mask so key styles
    // (and CSS `color`) can tint them; leave multi-color art as an image.
    if (SVG_DATA_URL.test(image) && image.includes("currentColor")) {
      return (
        <span
          aria-hidden="true"
          className={className ? `app-icon-mask ${className}` : "app-icon-mask"}
          style={{
            display: "inline-block",
            width: px,
            height: px,
            backgroundColor: color,
            WebkitMaskImage: `url("${image}")`,
            maskImage: `url("${image}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            ...style,
          }}
        />
      );
    }

    return (
      <img
        src={image}
        alt=""
        className={className}
        style={{
          width: px,
          height: px,
          objectFit: "contain",
          borderRadius: 8,
          ...style,
        }}
      />
    );
  }

  return (
    <Icon
      icon={toIconifyId(name) || DEFAULT_ICONIFY_ID}
      width={px}
      height={px}
      className={className}
      style={style}
      color={color}
    />
  );
}
