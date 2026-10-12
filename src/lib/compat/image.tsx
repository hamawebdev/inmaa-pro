import * as React from "react";

import { useUploadSrc } from "@/lib/use-upload-src";

/**
 * Stand-in for next/image.
 *
 * There is no image optimiser here — files are read straight off disk — so this
 * is an <img> that additionally resolves stored-file addresses
 * (/uploads/...) into the asset-protocol URLs the webview can actually
 * load. Next-only props are accepted and ignored so call sites need no edit.
 */
export type ImageProps = Omit<React.ComponentProps<"img">, "src" | "width" | "height"> & {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  /** Accepted and ignored — optimiser-only concepts. */
  unoptimized?: boolean;
  priority?: boolean;
  quality?: number;
  fill?: boolean;
  sizes?: string;
};

export default function Image({
  src,
  alt,
  width,
  height,
  unoptimized: _unoptimized,
  priority: _priority,
  quality: _quality,
  fill,
  sizes: _sizes,
  style,
  ...props
}: ImageProps) {
  const resolved = useUploadSrc(src);

  return (
    <img
      src={resolved ?? undefined}
      alt={alt}
      width={width}
      height={height}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
      {...props}
    />
  );
}

export { Image };
