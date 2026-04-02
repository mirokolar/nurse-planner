import { useRef, useState, type DragEvent } from 'react';

interface FileUploadProps {
  label: string;
  description: string;
  accept?: string;
  onFileLoaded: (text: string, filename: string) => void;
  status?: 'idle' | 'ok' | 'error';
  statusMessage?: string;
  disabled?: boolean;
}

export function FileUpload({
  label,
  description,
  accept = '.txt',
  onFileLoaded,
  status = 'idle',
  statusMessage,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      onFileLoaded(e.target?.result as string, file.name);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const borderColor =
    status === 'ok'
      ? 'border-green-500'
      : status === 'error'
        ? 'border-red-500'
        : dragging
          ? 'border-blue-400'
          : 'border-gray-300';

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'} ${borderColor} bg-white`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => { if (!disabled) inputRef.current?.click(); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = '';
        }}
      />

      <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
        <div className={`text-3xl ${status === 'ok' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
          {status === 'ok' ? '✓' : status === 'error' ? '✗' : '↑'}
        </div>
        <p className="font-semibold text-gray-800">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
        {statusMessage && (
          <p className={`text-xs mt-1 font-medium ${status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
