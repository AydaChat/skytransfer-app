import { Socket } from 'socket.io-client';
import { deriveKey, encryptChunk, decryptChunk } from './crypto';

export interface TransferMetadata {
  type: 'metadata';
  name: string;
  size: number;
  mimeType: string;
}

export interface ProgressStats {
  percentage: number;
  speedMBps: number;
  etaSeconds: number;
  bytesTransferred: number;
  totalBytes: number;
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private socket: Socket;
  private pin: string;
  private role: 'sender' | 'receiver';
  private targetSocketId: string | null = null;
  private cryptoKey: CryptoKey | null = null;

  // Callbacks
  public onConnected: () => void = () => {};
  public onProgress: (stats: ProgressStats) => void = () => {};
  public onComplete: (file?: Blob, metadata?: TransferMetadata) => void = () => {};
  public onError: (error: string) => void = () => {};

  // Transfer State
  private fileToSend: File | null = null;
  private receivedBuffers: ArrayBuffer[] = [];
  private receivedMetadata: TransferMetadata | null = null;
  private totalReceivedBytes: number = 0;
  private startTime: number = 0;
  private lastChunkTime: number = 0;
  private lastChunkBytes: number = 0;

  constructor(socket: Socket, pin: string, role: 'sender' | 'receiver', file?: File) {
    this.socket = socket;
    this.pin = pin;
    this.role = role;
    if (file) this.fileToSend = file;

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.setupWebRTC();
    this.setupSignaling();
  }

  private async setupWebRTC() {
    this.cryptoKey = await deriveKey(this.pin);

    if (this.role === 'sender') {
      this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
        ordered: true
      });
      this.setupDataChannel(this.dataChannel);
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetSocketId) {
        this.socket.emit('webrtc-signaling', {
          targetSocketId: this.targetSocketId,
          type: 'ice-candidate',
          payload: event.candidate
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log(`[ICE State]: ${this.peerConnection.connectionState}`);
      if (this.peerConnection.connectionState === 'failed') {
        this.onError('P2P connection failed. Peers may be blocked by strict firewall/NAT.');
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 1024 * 1024 * 2; // 2MB

    channel.onopen = () => {
      console.log('[DataChannel Open] Ready to stream.');
      this.onConnected();
      this.startTime = Date.now();
      this.lastChunkTime = Date.now();

      if (this.role === 'sender' && this.fileToSend) {
        this.sendMetadata(this.fileToSend);
        this.startFileStream(this.fileToSend);
      }
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'metadata') {
            this.receivedMetadata = msg as TransferMetadata;
            console.log('[Metadata Received]', this.receivedMetadata);
          }
        } catch (err) {
          console.error('Failed to parse text message', err);
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (!this.cryptoKey || !this.receivedMetadata) return;

        try {
          const decryptedChunk = await decryptChunk(this.cryptoKey, event.data);
          this.receivedBuffers.push(decryptedChunk);
          this.totalReceivedBytes += decryptedChunk.byteLength;

          this.updateProgress(this.totalReceivedBytes, this.receivedMetadata.size);

          if (this.totalReceivedBytes >= this.receivedMetadata.size) {
            const blob = new Blob(this.receivedBuffers, { type: this.receivedMetadata.mimeType });
            this.socket.emit('transfer-complete');
            this.onComplete(blob, this.receivedMetadata);
          }
        } catch (err) {
          console.error('[Decryption Error]:', err);
          this.onError('Failed to decrypt data chunk. Invalid key or corrupted stream.');
        }
      }
    };

    channel.onerror = (err) => {
      console.error('[DataChannel Error]:', err);
      this.onError('Data channel connection lost.');
    };
  }

  private setupSignaling() {
    this.socket.on('peer-joined', async ({ receiverSocketId }: { receiverSocketId: string }) => {
      console.log('[Peer Joined] Target:', receiverSocketId);
      this.targetSocketId = receiverSocketId;

      try {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        this.socket.emit('webrtc-signaling', {
          targetSocketId: this.targetSocketId,
          type: 'offer',
          payload: offer
        });
      } catch (err) {
        console.error('Create offer error', err);
      }
    });

    this.socket.on('webrtc-signaling', async ({ senderSocketId, type, payload }: { senderSocketId: string; type: string; payload: any }) => {
      if (!this.targetSocketId) this.targetSocketId = senderSocketId;

      try {
        if (type === 'offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);

          this.socket.emit('webrtc-signaling', {
            targetSocketId: senderSocketId,
            type: 'answer',
            payload: answer
          });
        } else if (type === 'answer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
        } else if (type === 'ice-candidate') {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        }
      } catch (err) {
        console.error(`Signaling error handling [${type}]:`, err);
      }
    });

    this.socket.on('peer-disconnected', () => {
      this.onError('Peer disconnected prematurely.');
    });
  }

  private sendMetadata(file: File) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
    const metadata: TransferMetadata = {
      type: 'metadata',
      name: file.name,
      size: file.size,
      mimeType: file.type
    };
    this.dataChannel.send(JSON.stringify(metadata));
  }

  private async startFileStream(file: File) {
    const CHUNK_SIZE = 64 * 1024; // 64KB
    let offset = 0;

    const readAndSend = async () => {
      while (offset < file.size) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

        // Backpressure management
        if (this.dataChannel.bufferedAmount > channelBufferLimit(this.dataChannel)) {
          await new Promise<void>((resolve) => {
            this.dataChannel!.onbufferedamountlow = () => {
              resolve();
            };
          });
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const arrayBuffer = await slice.arrayBuffer();

        if (this.cryptoKey) {
          const encrypted = await encryptChunk(this.cryptoKey, arrayBuffer);
          this.dataChannel.send(encrypted);
        }

        offset += arrayBuffer.byteLength;
        this.updateProgress(offset, file.size);
      }

      this.onComplete(undefined, {
        type: 'metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type
      });
    };

    readAndSend();
  }

  private updateProgress(bytesTransferred: number, totalBytes: number) {
    const now = Date.now();
    const timeDiff = (now - this.lastChunkTime) / 1000;
    const bytesDiff = bytesTransferred - this.lastChunkBytes;

    let speedMBps = 0;
    if (timeDiff > 0.2) {
      speedMBps = parseFloat((bytesDiff / (1024 * 1024) / timeDiff).toFixed(2));
      this.lastChunkTime = now;
      this.lastChunkBytes = bytesTransferred;
    } else if (this.lastChunkBytes > 0) {
      const totalTimeDiff = (now - this.startTime) / 1000;
      speedMBps = parseFloat((bytesTransferred / (1024 * 1024) / totalTimeDiff).toFixed(2));
    }

    const percentage = Math.min(Math.round((bytesTransferred / totalBytes) * 100), 100);
    const remainingBytes = totalBytes - bytesTransferred;
    const etaSeconds = speedMBps > 0 ? Math.round(remainingBytes / (speedMBps * 1024 * 1024)) : 0;

    this.onProgress({
      percentage,
      speedMBps,
      etaSeconds,
      bytesTransferred,
      totalBytes
    });
  }

  public disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peerConnection) this.peerConnection.close();
    this.socket.off('peer-joined');
    this.socket.off('webrtc-signaling');
    this.socket.off('peer-disconnected');
  }
}

function channelBufferLimit(channel: RTCDataChannel): number {
  return channel.bufferedAmountLowThreshold ? channel.bufferedAmountLowThreshold * 2 : 1024 * 1024 * 4;
}
