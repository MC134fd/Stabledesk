export function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="StableDesk"
      width={size}
      height={size}
      className="object-contain"
    />
  );
}
