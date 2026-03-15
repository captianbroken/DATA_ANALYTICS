interface BrandImageProps {
  className?: string;
  alt?: string;
}

export const HypersparkMark = ({ className = 'w-8 h-8', alt = 'Hyperspark mark' }: BrandImageProps) => (
  <img src="/hyperspark-favicon.jpeg" alt={alt} className={className} draggable={false} />
);

export const HypersparkWordmark = ({ className = 'h-8 w-auto', alt = 'Hyperspark' }: BrandImageProps) => (
  <img src="/hyperspark-logo.jpeg" alt={alt} className={className} draggable={false} />
);
