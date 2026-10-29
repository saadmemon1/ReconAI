'use client';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

export function BrandLogo({ width = 100, height = 32, className }: { width?: number; height?: number; className?: string }) {
  const { resolvedTheme } = useTheme();
  // false on the server and during hydration, true afterwards (avoids a theme mismatch)
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const src = mounted && resolvedTheme === 'dark' ? '/images/logo-white.png' : '/images/logo-color.png';
  return <Image src={src} alt="Providus" width={width} height={height} className={className} priority />;
}
