import React, { useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  t: Record<string, string>;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelect, t }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative w-full max-w-2xl mx-auto rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer border-2 transition-all duration-300 ${
        isDragging
          ? 'border-neonBlue bg-surfaceHover shadow-neon'
          : 'border-dashed border-gray-700 bg-surface hover:border-primary hover:shadow-neonBlue'
      }`}
    >
      <input
        type="file"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="w-20 h-20 mb-6 rounded-full bg-blue-500/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
        <UploadCloud className="w-10 h-10 animate-bounce" />
      </div>
      <h3 className="text-2xl font-bold mb-2 tracking-wide text-white">
        {t.dropTitle}
      </h3>
      <p className="text-gray-400 text-sm mb-6 text-center max-w-md">
        {t.dropDesc}
      </p>
      <div className="flex items-center space-x-2 bg-background py-2 px-6 rounded-full border border-gray-800">
        <FileText className="w-4 h-4 text-neonBlue" />
        <span className="text-xs font-semibold text-gray-300">{t.dropBtn}</span>
      </div>
    </div>
  );
};
