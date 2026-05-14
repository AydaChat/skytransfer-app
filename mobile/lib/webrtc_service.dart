import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class WebRTCService {
  late IO.Socket socket;
  RTCPeerConnection? peerConnection;
  RTCDataChannel? dataChannel;
  final String signalingUrl = 'http://localhost:3001';
  
  Function(int progress, double speed, int eta)? onProgress;
  Function(Uint8List fileBytes, String fileName)? onComplete;
  Function(String error)? onError;

  List<Uint8List> receivedChunks = [];
  int totalBytesReceived = 0;
  int expectedSize = 0;
  String expectedFileName = '';

  void init(String pin, String role) {
    socket = IO.io(signalingUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
    });

    socket.onConnect((_) {
      print('[Socket Connected]: ${socket.id}');
      if (role == 'receiver') {
        socket.emit('join-room', [pin, (response) {
          if (response['success'] == false) {
            onError?.call(response['error']);
          }
        }]);
      }
    });

    socket.on('peer-joined', (data) => _setupWebRTC(pin, role, data['receiverSocketId']));
    socket.on('webrtc-signaling', _handleSignaling);
  }

  Future<void> _setupWebRTC(String pin, String role, String targetSocketId) async {
    Map<String, dynamic> configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
      ]
    };

    peerConnection = await createPeerConnection(configuration);

    peerConnection?.onIceCandidate = (RTCIceCandidate candidate) {
      socket.emit('webrtc-signaling', {
        'targetSocketId': targetSocketId,
        'type': 'ice-candidate',
        'payload': candidate.toMap(),
      });
    };

    if (role == 'sender') {
      RTCDataChannelInit dataChannelDict = RTCDataChannelInit()
        ..ordered = true;
      dataChannel = await peerConnection?.createDataChannel('fileTransfer', dataChannelDict);
      _setupDataChannel(dataChannel!);

      RTCSessionDescription offer = await peerConnection!.createOffer();
      await peerConnection!.setLocalDescription(offer);
      socket.emit('webrtc-signaling', {
        'targetSocketId': targetSocketId,
        'type': 'offer',
        'payload': offer.toMap(),
      });
    } else {
      peerConnection?.onDataChannel = (RTCDataChannel channel) {
        dataChannel = channel;
        _setupDataChannel(channel);
      };
    }
  }

  void _setupDataChannel(RTCDataChannel channel) {
    channel.onMessage = (RTCDataChannelMessage message) {
      if (message.isBinary) {
        Uint8List bytes = message.binary;
        receivedChunks.add(bytes);
        totalBytesReceived += bytes.length;
        
        if (expectedSize > 0) {
          int progress = ((totalBytesReceived / expectedSize) * 100).round();
          onProgress?.call(progress, 0.0, 0);

          if (totalBytesReceived >= expectedSize) {
            BytesBuilder builder = BytesBuilder();
            for (var chunk in receivedChunks) {
              builder.add(chunk);
            }
            onComplete?.call(builder.toBytes(), expectedFileName);
          }
        }
      } else {
        Map<String, dynamic> meta = jsonDecode(message.text);
        if (meta['type'] == 'metadata') {
          expectedSize = meta['size'];
          expectedFileName = meta['name'];
        }
      }
    };
  }

  Future<void> _handleSignaling(dynamic data) async {
    String type = data['type'];
    var payload = data['payload'];

    if (type == 'offer') {
      await peerConnection?.setRemoteDescription(RTCSessionDescription(payload['sdp'], payload['type']));
      RTCSessionDescription answer = await peerConnection!.createAnswer();
      await peerConnection!.setLocalDescription(answer);
      socket.emit('webrtc-signaling', {
        'targetSocketId': data['senderSocketId'],
        'type': 'answer',
        'payload': answer.toMap(),
      });
    } else if (type == 'answer') {
      await peerConnection?.setRemoteDescription(RTCSessionDescription(payload['sdp'], payload['type']));
    } else if (type == 'ice-candidate') {
      await peerConnection?.addCandidate(RTCIceCandidate(payload['candidate'], payload['sdpMid'], payload['sdpMLineIndex']));
    }
  }

  void dispose() {
    dataChannel?.close();
    peerConnection?.close();
    socket.disconnect();
  }
}
