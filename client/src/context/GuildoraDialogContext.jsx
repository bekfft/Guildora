import { AlertTriangle, HelpCircle, MessageSquareText } from 'lucide-react';
import { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Modal from '../app/Modal.jsx';

const GuildoraDialogContext = createContext(null);

function DialogContent({ dialog, onResolve }) {
  const [value, setValue] = useState(dialog.initialValue || '');
  const [error, setError] = useState('');
  const isPrompt = dialog.kind === 'prompt';
  const Icon = isPrompt ? MessageSquareText : dialog.tone === 'danger' ? AlertTriangle : HelpCircle;

  function submit(event) {
    event.preventDefault();
    if (isPrompt) {
      const validationError = dialog.validate?.(value);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (dialog.required && !value.trim()) {
        setError('Bitte fülle dieses Feld aus.');
        return;
      }
      onResolve(value);
      return;
    }
    onResolve(true);
  }

  return (
    <form className="guildora-dialog" onSubmit={submit}>
      <div className={`guildora-dialog__icon guildora-dialog__icon--${dialog.tone || 'brand'}`}>
        <Icon size={24} aria-hidden="true" />
      </div>
      <p>{dialog.message}</p>
      {isPrompt && (
        <label className="guildora-dialog__field">
          <span>{dialog.label || 'Eingabe'}</span>
          <input
            autoFocus
            type={dialog.inputType || 'text'}
            inputMode={dialog.inputMode}
            min={dialog.min}
            step={dialog.step}
            placeholder={dialog.placeholder || ''}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
          />
          {error && <small role="alert">{error}</small>}
        </label>
      )}
      <div className="guildora-dialog__actions">
        <Button type="button" variant="ghost" onClick={() => onResolve(isPrompt ? null : false)}>
          {dialog.cancelLabel || 'Abbrechen'}
        </Button>
        <Button
          type="submit"
          className={dialog.tone === 'danger' ? 'guildora-dialog__danger' : ''}
        >
          {dialog.confirmLabel || (isPrompt ? 'Bestätigen' : 'Fortfahren')}
        </Button>
      </div>
    </form>
  );
}

export function GuildoraDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const pendingRef = useRef(null);
  const titleId = `guildora-dialog-${useId().replace(/:/g, '')}`;

  const request = useCallback((configuration) => new Promise((resolve) => {
    if (pendingRef.current) {
      resolve(configuration.kind === 'prompt' ? null : false);
      return;
    }
    pendingRef.current = resolve;
    setDialog(configuration);
  }), []);

  const confirm = useCallback((configuration) => request({
    kind: 'confirm',
    title: 'Aktion bestätigen',
    tone: 'danger',
    ...(typeof configuration === 'string' ? { message: configuration } : configuration)
  }), [request]);

  const prompt = useCallback((configuration) => request({
    kind: 'prompt',
    title: 'Eingabe erforderlich',
    tone: 'brand',
    ...(typeof configuration === 'string' ? { message: configuration } : configuration)
  }), [request]);

  const resolveDialog = useCallback((result) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setDialog(null);
    resolve?.(result);
  }, []);

  return (
    <GuildoraDialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <Modal
          title={dialog.title}
          labelledBy={titleId}
          className="app-modal--guildora-dialog"
          onClose={() => resolveDialog(dialog.kind === 'prompt' ? null : false)}
        >
          <DialogContent dialog={dialog} onResolve={resolveDialog} />
        </Modal>
      )}
    </GuildoraDialogContext.Provider>
  );
}

export function useGuildoraDialog() {
  const context = useContext(GuildoraDialogContext);
  if (!context) throw new Error('useGuildoraDialog muss innerhalb des GuildoraDialogProvider verwendet werden.');
  return context;
}
