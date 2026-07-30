export default function Button({
  children,
  className = '',
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      <span>{loading ? 'Bitte warten …' : children}</span>
    </button>
  );
}
