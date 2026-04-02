interface ProgressBarProps {
  message: string;
  current: number;
  total: number;
}

export function ProgressBar({ message, current, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full max-w-md mx-auto text-center">
      <p className="text-sm text-gray-600 mb-2">{message}</p>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {total > 0 && (
        <p className="text-xs text-gray-400 mt-1">{current} / {total}</p>
      )}
    </div>
  );
}
