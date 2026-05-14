import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';

import { DropZone } from './components/DropZone';
import { ReceiveCode } from './components/ReceiveCode';
import { TransferProgress } from './components/TransferProgress';
import { WebRTCManager, ProgressStats, TransferMetadata } from './lib/webrtc';

const SIGNALING_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`;

const TRANSLATIONS = {
  en: {
    appName: "SkyTransfer",
    sendFile: "Send File",
    receiveFile: "Receive File",
    signalingOnline: "Signaling Online",
    connecting: "Connecting...",
    readyToSend: "Ready to Send",
    shareDesc: "Share this PIN, scan the QR Code, or copy the direct transfer link.",
    waitingReceiver: "Waiting for receiver to join...",
    copy: "Copy",
    copied: "Copied",
    share: "Share",
    transferAnother: "Transfer Another File",
    streamingFile: "Streaming File...",
    dropTitle: "Drag & Drop your file here",
    dropDesc: "Zero-server WebRTC streaming with AES-256-GCM encryption. Size limit is unlimited.",
    dropBtn: "Select from device",
    recvTitle: "Receive Files",
    recvSubtitle: "Enter the 6-digit secure room PIN",
    recvConnecting: "Connecting to Peer...",
    recvBtn: "Connect & Receive",
    finished: "Finished",
    streaming: "Streaming",
    transferSpeed: "Transfer Speed",
    estimatedTime: "Estimated Time"
  },
  tr: {
    appName: "SkyTransfer",
    sendFile: "Dosya Gönder",
    receiveFile: "Dosya Al",
    signalingOnline: "Sinyal Aktif",
    connecting: "Bağlanıyor...",
    readyToSend: "Gönderime Hazır",
    shareDesc: "Bu PIN'i paylaşın, QR Kodu okutun veya transfer linkini kopyalayın.",
    waitingReceiver: "Alıcının katılması bekleniyor...",
    copy: "Kopyala",
    copied: "Kopyalandı",
    share: "Paylaş",
    transferAnother: "Başka Dosya Aktar",
    streamingFile: "Dosya Akıyor...",
    dropTitle: "Dosyanızı buraya sürükleyip bırakın",
    dropDesc: "AES-256-GCM şifrelemeli sıfır sunucu WebRTC aktarımı. Boyut sınırı yoktur.",
    dropBtn: "Cihazdan seç",
    recvTitle: "Dosya Al",
    recvSubtitle: "6 haneli güvenli oda PIN'ini girin",
    recvConnecting: "Eş Cihaza Bağlanıyor...",
    recvBtn: "Bağlan & Teslim Al",
    finished: "Tamamlandı",
    streaming: "Aktarılıyor",
    transferSpeed: "Aktarım Hızı",
    estimatedTime: "Kalan Süre"
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [lang, setLang] = useState<'en' | 'tr'>('en');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Transfer State
  const [roomPIN, setRoomPIN] = useState<string | null>(null);
  const [isWaitingPeer, setIsWaitingPeer] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Metadata / Stats
  const [metadata, setMetadata] = useState<TransferMetadata | null>(null);
  const [progressStats, setProgressStats] = useState<ProgressStats>({
    percentage: 0,
    speedMBps: 0,
    etaSeconds: 0,
    bytesTransferred: 0,
    totalBytes: 0
  });

  const rtcManagerRef = useRef<WebRTCManager | null>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const newSocket = io(SIGNALING_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Auto-connect if ?code=XXXXXX is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && socket && isConnected) {
      setActiveTab('receive');
      handleReceiveConnect(codeParam);
    }
  }, [socket, isConnected]);

  const handleFileSelect = (file: File) => {
    if (!socket) return;

    setMetadata({
      type: 'metadata',
      name: file.name,
      size: file.size,
      mimeType: file.type
    });

    socket.emit('create-room', (response: { success: boolean; pin?: string; error?: string }) => {
      if (response.success && response.pin) {
        setRoomPIN(response.pin);
        setIsWaitingPeer(true);

        const manager = new WebRTCManager(socket, response.pin, 'sender', file);
        setupManagerCallbacks(manager);
        rtcManagerRef.current = manager;
      } else {
        setError(response.error || 'Failed to create secure room.');
      }
    });
  };

  const handleReceiveConnect = (pin: string) => {
    if (!socket) return;
    setIsWaitingPeer(true);
    setError(null);

    socket.emit('join-room', pin, (response: { success: boolean; error?: string }) => {
      if (response.success) {
        setRoomPIN(pin);
        const manager = new WebRTCManager(socket, pin, 'receiver');
        setupManagerCallbacks(manager);
        rtcManagerRef.current = manager;
      } else {
        setIsWaitingPeer(false);
        setError(response.error || 'Failed to join room.');
      }
    });
  };

  const setupManagerCallbacks = (manager: WebRTCManager) => {
    manager.onConnected = () => {
      setIsWaitingPeer(false);
      setIsTransferring(true);
    };

    manager.onProgress = (stats) => {
      setProgressStats(stats);
    };

    manager.onComplete = (fileBlob, meta) => {
      setIsTransferring(false);
      setIsComplete(true);
      if (meta) setMetadata(meta);

      if (fileBlob && meta) {
        const url = URL.createObjectURL(fileBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = meta.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };

    manager.onError = (errMsg) => {
      setError(errMsg);
      resetState();
    };
  };

  const resetState = () => {
    if (rtcManagerRef.current) {
      rtcManagerRef.current.disconnect();
      rtcManagerRef.current = null;
    }
    setRoomPIN(null);
    setIsWaitingPeer(false);
    setIsTransferring(false);
    setIsComplete(false);
    setMetadata(null);
    setProgressStats({ percentage: 0, speedMBps: 0, etaSeconds: 0, bytesTransferred: 0, totalBytes: 0 });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-6 pb-20">
      {/* Header */}
      <header className="w-full max-w-5xl py-8 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-neonBlue flex items-center justify-center shadow-neonBlue">
            <Share2 className="w-6 h-6 text-background font-black" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-white bg-clip-text">
            {t.appName}
          </span>
        </div>

        <div className="flex items-center space-x-2 bg-surface p-1 rounded-2xl border border-gray-800">
          <button
            onClick={() => { resetState(); setActiveTab('send'); }}
            className={`py-2 px-6 rounded-xl font-bold text-sm transition-all duration-200 ${
              activeTab === 'send'
                ? 'bg-gradient-to-r from-primary to-neonBlue text-background shadow-neonBlue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.sendFile}
          </button>
          <button
            onClick={() => { resetState(); setActiveTab('receive'); }}
            className={`py-2 px-6 rounded-xl font-bold text-sm transition-all duration-200 ${
              activeTab === 'receive'
                ? 'bg-gradient-to-r from-primary to-neonBlue text-background shadow-neonBlue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.receiveFile}
          </button>
        </div>

        <div className="flex items-center space-x-4">
          {/* Status */}
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_#10B981]' : 'bg-rose-500'}`} />
            <span>{isConnected ? t.signalingOnline : t.connecting}</span>
          </div>

          {/* Language / Country Flags */}
          <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-primary text-white shadow-md' : 'opacity-50 hover:opacity-100'}`}
              title="English"
            >
              🇬🇧 EN
            </button>
            <button
              onClick={() => setLang('tr')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'tr' ? 'bg-primary text-white shadow-md' : 'opacity-50 hover:opacity-100'}`}
              title="Türkçe"
            >
              🇹🇷 TR
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-5xl mt-12 flex flex-col items-center justify-center flex-1">
        {error && (
          <div className="w-full max-w-xl mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center space-x-3 text-rose-400 animate-shake">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {isTransferring || isComplete ? (
          <div className="w-full">
            <TransferProgress
              fileName={metadata?.name || t.streamingFile}
              fileSize={metadata?.size || 0}
              stats={progressStats}
              isComplete={isComplete}
              t={t}
            />
            {isComplete && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={resetState}
                  className="py-3 px-8 bg-surface border border-gray-700 hover:border-primary text-white font-bold rounded-2xl shadow-xl flex items-center space-x-2 transition-all"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>{t.transferAnother}</span>
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'send' ? (
          !roomPIN ? (
            <DropZone onFileSelect={handleFileSelect} t={t} />
          ) : (
            <div className="w-full max-w-xl bg-surface border border-gray-800 p-10 rounded-3xl shadow-2xl flex flex-col items-center relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-neonBlue animate-pulse" />

              <h3 className="text-2xl font-bold text-white mb-2">{t.readyToSend}</h3>
              <p className="text-xs text-gray-400 mb-6 text-center">
                {t.shareDesc}
              </p>

              <div className="bg-background border-2 border-gray-800 py-4 px-12 rounded-2xl mb-6 flex items-center justify-center shadow-inner">
                <span className="text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-neonBlue">
                  {roomPIN}
                </span>
              </div>

              <div className="p-4 bg-white rounded-2xl mb-6 shadow-xl">
                <QRCodeSVG
                  value={`${window.location.origin}/?code=${roomPIN}`}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </div>

              {/* Share & Copy URL Bar */}
              <div className="w-full bg-background border border-gray-800 p-2 rounded-2xl flex items-center justify-between mb-8 space-x-2">
                <span className="text-xs text-gray-400 truncate px-2 font-mono">
                  {`${window.location.origin}/?code=${roomPIN}`}
                </span>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/?code=${roomPIN}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2 bg-surface hover:bg-surfaceHover text-gray-300 rounded-xl border border-gray-700 flex items-center space-x-1 text-xs font-semibold transition-all"
                    title={t.copy}
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500 animate-bounce" /> : <Copy className="w-4 h-4 text-primary" />}
                    <span>{copied ? t.copied : t.copy}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'SkyTransfer - Secure P2P Link',
                          text: `Send files securely via WebRTC. Room PIN: ${roomPIN}`,
                          url: `${window.location.origin}/?code=${roomPIN}`
                        });
                      } else {
                        navigator.clipboard.writeText(`${window.location.origin}/?code=${roomPIN}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="p-2 bg-gradient-to-r from-primary to-neonBlue text-background rounded-xl font-bold flex items-center space-x-1 text-xs shadow-neonBlue transition-all hover:opacity-90 cursor-pointer"
                    title={t.share}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t.share}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-3 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>{t.waitingReceiver}</span>
              </div>
            </div>
          )
        ) : (
          <ReceiveCode onConnect={handleReceiveConnect} isLoading={isWaitingPeer} t={t} />
        )}
      </main>
    </div>
  );
}
