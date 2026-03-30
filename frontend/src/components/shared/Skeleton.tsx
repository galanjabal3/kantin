interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 rounded animate-pulse ${className}`}
      style={style}
    />
  );
}
