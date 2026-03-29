import type { CSSProperties } from 'react';

interface BrandImageProps {
  className?: string;
  alt?: string;
  style?: CSSProperties;
}

export const HypersparkMark = ({ className = 'w-8 h-8', alt = 'Hyperspark mark', style }: BrandImageProps) => (
  <img src="/company_logo_clean.png" alt={alt} className={className} style={style} draggable={false} />
);

export const HypersparkWordmark = ({ className = 'h-8 w-auto', alt = 'Hyperspark', style }: BrandImageProps) => (
  <img src="/company_logo_clean.png" alt={alt} className={className} style={style} draggable={false} />
);
