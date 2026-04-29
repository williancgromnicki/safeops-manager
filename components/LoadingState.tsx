type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Carregando dados...' }: LoadingStateProps) {
  return (
    <div className="card flex items-center gap-3">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" />
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
