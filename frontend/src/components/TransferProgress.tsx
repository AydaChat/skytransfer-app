import React from 'react';
import { FileText, Clock, Zap, CheckCircle2 } from 'lucide-react';
import { ProgressStats } from '../lib/webrtc';

interface TransferProgressProps {
  fileName: string;
  fileSize: number;
  stats: ProgressStats;
  isComplete: boolean;
  t: Record<string, string>;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  fileName,
  fileSize,
  stats,
  isComplete,
  t
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-surface border border-gray-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
      <div className="flex items-center space-x-4 mb-8 bg-background p-4 rounded-2xl border border-gray-800/80">
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          <FileText className="w-8 h-8" />
        </div>
        <div className="flex-1 overflow-hidden">
          <h4 className="text-white font-bold truncate">{fileName}</h4>
          <p className="text-xs text-gray-400">{formatBytes(fileSize)}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center my-8">
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Circular Progress SVG */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="#1B2536"
              strokeWidth="12"
              fill="transparent"
            />
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke={isComplete ? '#10B981' : '#00F0FF'}
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={502}
              strokeDashoffset={502 - (502 * (isComplete ? 100 : stats.percentage)) / 100}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            {isComplete ? (
              <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-bounce" />
            ) : (
              <>
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {stats.percentage}%
                </span>
                <span className="text-xs text-neonBlue font-semibold animate-pulse">{t.streaming}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Linear Progress Bar */}
      <div className="w-full bg-background rounded-full h-3 mb-6 overflow-hidden border border-gray-800">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isComplete ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-gradient-to-r from-primary to-neonBlue shadow-neon'
          }`}
          style={{ width: `${isComplete ? 100 : stats.percentage}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 bg-background p-4 rounded-2xl border border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-primary">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.transferSpeed}</p>
            <p className="text-sm font-bold text-white">
              {isComplete ? t.finished : `${stats.speedMBps} MB/s`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.estimatedTime}</p>
            <p className="text-sm font-bold text-white">
              {isComplete ? '0s' : formatTime(stats.etaSeconds)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
