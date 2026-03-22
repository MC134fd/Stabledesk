export function Logo({ size = 32 }: { size?: number }) {
  // Image is 3:2 ratio (1536x1024), so width = height * 1.5
  const height = size;
  const width = Math.round(size * 1.5);

  return (
    <img
      src="/logo.png"
      alt="StableDesk"
      width={width}
      height={height}
      className="object-contain"
      style={{ minWidth: width, minHeight: height }}
    />
  );
}
