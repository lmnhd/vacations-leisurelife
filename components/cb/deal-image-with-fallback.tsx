"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Image, { type ImageProps } from "next/image";

interface DealImageSource {
  imageUrl: string;
  imageAlt?: string;
}

type DealImageWithFallbackProps = Omit<ImageProps, "src" | "alt" | "onError"> & {
  primary?: DealImageSource;
  fallbacks?: DealImageSource[];
  alt: string;
  placeholderStyle?: CSSProperties;
};

function buildImageQueue(primary: DealImageSource | undefined, fallbacks: DealImageSource[]): DealImageSource[] {
  const seen = new Set<string>();
  const queue: DealImageSource[] = [];
  for (const image of [primary, ...fallbacks]) {
    if (!image?.imageUrl || seen.has(image.imageUrl)) continue;
    seen.add(image.imageUrl);
    queue.push(image);
  }
  return queue;
}

export function DealImageWithFallback({
  primary,
  fallbacks = [],
  alt,
  placeholderStyle,
  ...imageProps
}: DealImageWithFallbackProps) {
  const [index, setIndex] = useState(0);
  const images = useMemo(() => buildImageQueue(primary, fallbacks), [fallbacks, primary]);
  const firstImageUrl = images[0]?.imageUrl;
  const current = images[index];

  useEffect(() => {
    setIndex(0);
  }, [firstImageUrl]);

  if (!current) {
    if (placeholderStyle) return <div aria-hidden="true" style={placeholderStyle} />;
    return null;
  }

  return (
    <Image
      key={current.imageUrl}
      {...imageProps}
      src={current.imageUrl}
      alt={current.imageAlt ?? alt}
      onError={() => setIndex((currentIndex) => currentIndex + 1)}
    />
  );
}
