import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, Leaf } from 'lucide-react';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFileSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndPassFile(files[0]);
    }
  }, [disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndPassFile(files[0]);
    }
  }, []);

  const validateAndPassFile = (file: File) => {
    setError(null);
    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      file.name.endsWith('.docx')
    ) {
      onFileSelected(file);
    } else {
      setError("Proszę przesłać poprawny dokument Word (.docx).");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto group">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ease-in-out text-center overflow-hidden
          ${isDragging 
            ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-xl dark:bg-emerald-950/30' 
            : 'border-stone-300 bg-white hover:border-emerald-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800/40 dark:hover:bg-stone-800'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <input
          type="file"
          accept=".docx"
          onChange={handleFileInput}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        />
        
        {/* Background Decorative Element */}
        <div className="absolute -bottom-10 -right-10 text-emerald-50 dark:text-emerald-900/20 pointer-events-none transition-transform duration-500 group-hover:scale-110">
          <Leaf size={180} strokeWidth={0.5} />
        </div>

        <div className="relative z-0 flex flex-col items-center justify-center space-y-6 pointer-events-none">
          <div className={`
            p-5 rounded-2xl shadow-sm transition-colors duration-300
            ${isDragging ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'}
          `}>
            {isDragging ? <Upload size={40} /> : <FileText size={40} />}
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-medium text-stone-800 dark:text-stone-200">
              {isDragging ? "Upuść plik kosztorysu" : "Prześlij plik inwentaryzacji"}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xs mx-auto">
              Kliknij lub przeciągnij dokument .docx, aby rozpocząć automatyczną wycenę.
            </p>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 flex items-center gap-3 text-red-700 bg-red-50 border border-red-100 p-4 rounded-xl text-sm shadow-sm dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default Dropzone;