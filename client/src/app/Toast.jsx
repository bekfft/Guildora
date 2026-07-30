import { CheckCircle2, Info, XCircle } from 'lucide-react';

export default function Toast({ toast }) {
  if (!toast) return null;
  const Icon = toast.type === 'error' ? XCircle : toast.type === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`app-toast app-toast--${toast.type || 'info'} ${toast.closing ? 'is-closing' : ''}`} role="status">
      <Icon size={18} />
      <span>{toast.message}</span>
    </div>
  );
}
