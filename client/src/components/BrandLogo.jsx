export default function BrandLogo({ className = '', decorative = false }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src="/assets/guildora-mark.png"
      alt={decorative ? '' : 'Guildora'}
      aria-hidden={decorative ? 'true' : undefined}
    />
  );
}
