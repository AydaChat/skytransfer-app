import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Lock } from 'lucide-react';

interface ReceiveCodeProps {
  onConnect: (pin: string) => void;
  isLoading: boolean;
  t: Record<string, string>;
}

export const ReceiveCode: React.FC<ReceiveCodeProps> = ({ onConnect, isLoading, t }) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    if (value !== '' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && digits[index] === '' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = digits.join('');
    if (pin.length === 6) {
      onConnect(pin);
    }
  };

  const isFull = digits.every(d => d !== '');

  return (
    <div className="w-full max-w-lg mx-auto bg-surface border border-gray-800 p-10 rounded-3xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-neonBlue" />

      <div className="flex items-center justify-center space-x-3 mb-6">
        <div className="p-3 bg-blue-500/10 rounded-2xl text-primary">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{t.recvTitle}</h3>
          <p className="text-xs text-gray-400">{t.recvSubtitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col items-center">
        <div className="flex space-x-3 mb-8">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={el => inputsRef.current[index] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              className="w-12 h-16 bg-background border-2 border-gray-800 rounded-2xl text-center text-2xl font-bold text-white focus:border-neonBlue focus:shadow-neon outline-none transition-all duration-200"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={!isFull || isLoading}
          className={`w-full py-4 px-8 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all duration-300 ${
            isFull && !isLoading
              ? 'bg-gradient-to-r from-primary to-neonBlue text-background hover:opacity-90 shadow-neonBlue cursor-pointer'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          <span>{isLoading ? t.recvConnecting : t.recvBtn}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};
