import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function TextField({
  label,
  error,
  hint,
  type = 'text',
  id: providedId,
  ...props
}) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && !error && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
      <div className="field__control">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          {...props}
        />
        {isPassword && (
          <button
            className="field__toggle"
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Passwort ausblenden' : 'Passwort anzeigen'}
          >
            {visible ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        )}
      </div>
      {error && <span className="field__error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  );
}
