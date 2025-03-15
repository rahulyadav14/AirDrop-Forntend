// src/services/WebRTCService.js
import { v4 as uuidv4 } from "uuid";

class WebRTCService {
  constructor() {
    this.socket = null;
    this.peerConnections = {};
    this.dataChannels = {};
    this.roomId = null;
    this.peerId = null;

    // Callbacks
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onFileProgress = null;
    this.onFileReceived = null;
    this.onTransferStart = null;
    this.onTransferComplete = null;
    this.onError = null;

    // File transfer tracking
    this.fileChunks = {};
    this.isTransferring = false;
  }

  setCallbacks(callbacks) {
    this.onPeerConnected = callbacks.onPeerConnected;
    this.onPeerDisconnected = callbacks.onPeerDisconnected;
    this.onFileProgress = callbacks.onFileProgress;
    this.onFileReceived = callbacks.onFileReceived;
    this.onTransferStart = callbacks.onTransferStart;
    this.onTransferComplete = callbacks.onTransferComplete;
    this.onError = callbacks.onError;
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Check if we're already connected
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      // Connect to the signaling server
      const protocol =
        window.location.protocol === "https:" ? "wss://" : "ws://";
     // const wsUrl = `${protocol}${window.location.host}/api/ws`;

      // For local development, uncomment and use this instead:
      const wsUrl = "ws://localhost:8080/ws";

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log("Connected to signaling server");
        resolve();
      };

      this.socket.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (this.onError) this.onError("Failed to connect to signaling server");
        reject(error);
      };

      this.socket.onclose = () => {
        console.log("Disconnected from signaling server");
        // Clean up peer connections
        Object.keys(this.peerConnections).forEach((peerId) => {
          this.closePeerConnection(peerId);
        });
      };
    });
  }

  createRoom(roomId) {
    return new Promise((resolve, reject) => {
      this.connect()
        .then(() => {
          this.sendSignalingMessage({
            type: "create-room",
            roomId: roomId,
          });

          // We'll resolve the promise when we receive the room-created message
          this.pendingCreateRoom = resolve;
        })
        .catch(reject);
    });
  }

  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      this.connect()
        .then(() => {
          this.sendSignalingMessage({
            type: "join-room",
            roomId: roomId,
          });

          // We'll resolve the promise when we receive the room-joined message
          this.pendingJoinRoom = resolve;
        })
        .catch(reject);
    });
  }

  handleSignalingMessage(message) {
    console.log("Received message:", message);

    switch (message.type) {
      case "room-created":
        this.roomId = message.roomId;
        this.peerId = message.peerId;
        if (this.pendingCreateRoom) {
          this.pendingCreateRoom({ roomId: this.roomId, peerId: this.peerId });
          this.pendingCreateRoom = null;
        }
        break;

      case "room-joined":
        this.roomId = message.roomId;
        this.peerId = message.peerId;
        if (this.pendingJoinRoom) {
          this.pendingJoinRoom({ roomId: this.roomId, peerId: this.peerId });
          this.pendingJoinRoom = null;
        }
        break;

      case "new-peer":
        this.createPeerConnection(message.from);
        if (this.onPeerConnected) this.onPeerConnected(message.from);
        break;

      case "peer-left":
        this.closePeerConnection(message.from);
        if (this.onPeerDisconnected) this.onPeerDisconnected(message.from);
        break;

      case "offer":
        this.handleOffer(message.from, message.data);
        break;

      case "answer":
        this.handleAnswer(message.from, message.data);
        break;

      case "ice-candidate":
        this.handleIceCandidate(message.from, message.data);
        break;

      case "error":
        console.error("Signaling error:", message.data);
        if (this.onError) this.onError(message.data);
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  // Create a peer connection and offer to the remote peer
  createPeerConnection(remotePeerId) {
    // ICE servers for NAT traversal
    const iceServers = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    };

    // Create a new RTCPeerConnection
    const peerConnection = new RTCPeerConnection(iceServers);
    this.peerConnections[remotePeerId] = peerConnection;

    // Create a data channel for file transfer
    const dataChannel = peerConnection.createDataChannel("fileTransfer", {
      ordered: true,
    });

    this.setupDataChannel(dataChannel, remotePeerId);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: "ice-candidate",
          to: remotePeerId,
          data: event.candidate,
        });
      }
    };

    // Handle data channels created by the remote peer
    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, remotePeerId);
    };

    // Create an offer
    peerConnection
      .createOffer()
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        this.sendSignalingMessage({
          type: "offer",
          to: remotePeerId,
          data: peerConnection.localDescription,
        });
      })
      .catch((error) => {
        console.error("Error creating offer:", error);
        if (this.onError) this.onError("Failed to create connection offer");
      });
  }

  // Set up a data channel for file transfer
  setupDataChannel(dataChannel, remotePeerId) {
    this.dataChannels[remotePeerId] = dataChannel;
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
      console.log(`Data channel with peer ${remotePeerId} opened`);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel with peer ${remotePeerId} closed`);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with peer ${remotePeerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, remotePeerId);
    };
  }

  // Handle incoming data channel messages
  handleDataChannelMessage(data, remotePeerId) {
    // If the message is a string, it's a control message
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);

        // Handle file start message
        if (message.type === "file-start") {
          // Initialize the file chunks array
          this.fileChunks[message.fileId] = [];
          console.log(`Starting to receive file: ${message.fileName}`);
        }

        // Handle file end message
        if (message.type === "file-end") {
          this.reassembleFile(
            message.fileId,
            message.fileName,
            message.fileType
          );
        }
      } catch (error) {
        console.error("Error parsing data channel message:", error);
      }
    }
    // If the message is binary data, it's a file chunk
    else if (data instanceof ArrayBuffer) {
      // Parse the file chunk metadata
      const headerView = new DataView(data.slice(0, 28));
      const fileIdBytes = new Uint8Array(data.slice(0, 16));
      const fileIdDecoder = new TextDecoder();
      const fileId = fileIdDecoder.decode(fileIdBytes);

      const currentChunk = headerView.getUint32(16, true);
      const totalChunks = headerView.getUint32(20, true);
      const fileNameLengthBytes = headerView.getUint32(24, true);

      const fileNameBytes = new Uint8Array(
        data.slice(28, 28 + fileNameLengthBytes)
      );
      const fileNameDecoder = new TextDecoder();
      const fileName = fileNameDecoder.decode(fileNameBytes);

      const fileTypeStartByte = 28 + fileNameLengthBytes;
      const fileTypeLengthBytes = new DataView(
        data.slice(fileTypeStartByte, fileTypeStartByte + 4)
      ).getUint32(0, true);
      const fileTypeBytes = new Uint8Array(
        data.slice(
          fileTypeStartByte + 4,
          fileTypeStartByte + 4 + fileTypeLengthBytes
        )
      );
      const fileTypeDecoder = new TextDecoder();
      const fileType = fileTypeDecoder.decode(fileTypeBytes);

      const fileSizeStartByte = fileTypeStartByte + 4 + fileTypeLengthBytes;
      const fileSize = new DataView(
        data.slice(fileSizeStartByte, fileSizeStartByte + 8)
      ).getBigUint64(0, true);

      const chunkData = data.slice(fileSizeStartByte + 8);

      // Store the chunk
      if (!this.fileChunks[fileId]) {
        this.fileChunks[fileId] = [];
      }

      this.fileChunks[fileId].push({
        id: fileId,
        name: fileName,
        type: fileType,
        size: Number(fileSize),
        totalChunks,
        currentChunk,
        data: chunkData,
      });

      // Calculate progress
      const progress = (this.fileChunks[fileId].length / totalChunks) * 100;
      if (this.onFileProgress) this.onFileProgress(progress);

      // If this is the first chunk, signal the start of transfer
      if (currentChunk === 0) {
        if (this.onTransferStart) this.onTransferStart();
      }

      // If we've received all chunks, reassemble the file
      if (this.fileChunks[fileId].length === totalChunks) {
        this.reassembleFile(fileId, fileName, fileType);
      }
    }
  }

  // Reassemble file from chunks
  reassembleFile(fileId, fileName, fileType) {
    try {
      // Get all chunks for this file
      const chunks = this.fileChunks[fileId];

      if (!chunks || chunks.length === 0) {
        throw new Error("No chunks found for file");
      }

      // Sort chunks by index to ensure correct order
      chunks.sort((a, b) => a.currentChunk - b.currentChunk);

      // Calculate total size
      const totalSize = chunks[0].size;

      // Create a buffer for the entire file
      const fileBuffer = new Uint8Array(totalSize);

      // Copy each chunk into the file buffer
      let offset = 0;
      for (const chunk of chunks) {
        const chunkData = new Uint8Array(chunk.data);
        fileBuffer.set(chunkData, offset);
        offset += chunkData.length;
      }

      // Create a Blob from the buffer
      const blob = new Blob([fileBuffer], { type: fileType });

      // Create a URL for the blob
      const url = URL.createObjectURL(blob);

      // Signal that the file has been received
      if (this.onFileReceived) {
        this.onFileReceived({
          name: fileName,
          url,
          size: totalSize,
        });
      }

      // Clean up
      delete this.fileChunks[fileId];
    } catch (error) {
      console.error("Error reassembling file:", error);
      if (this.onError) this.onError("Failed to reassemble file");
    }
  }

  // Handle an offer from a remote peer
  handleOffer(remotePeerId, sdp) {
    // Create a new peer connection if one doesn't exist
    if (!this.peerConnections[remotePeerId]) {
      const iceServers = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      };

      const peerConnection = new RTCPeerConnection(iceServers);
      this.peerConnections[remotePeerId] = peerConnection;

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalingMessage({
            type: "ice-candidate",
            to: remotePeerId,
            data: event.candidate,
          });
        }
      };

      // Handle data channels created by the remote peer
      peerConnection.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, remotePeerId);
      };

      if (this.onPeerConnected) this.onPeerConnected(remotePeerId);
    }

    const peerConnection = this.peerConnections[remotePeerId];

    // Set the remote description
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => peerConnection.createAnswer())
      .then((answer) => peerConnection.setLocalDescription(answer))
      .then(() => {
        this.sendSignalingMessage({
          type: "answer",
          to: remotePeerId,
          data: peerConnection.localDescription,
        });
      })
      .catch((error) => {
        console.error("Error handling offer:", error);
        if (this.onError) this.onError("Failed to handle connection offer");
      });
  }

  // Handle an answer from a remote peer
  handleAnswer(remotePeerId, sdp) {
    const peerConnection = this.peerConnections[remotePeerId];

    if (!peerConnection) {
      console.error(`No peer connection found for peer ${remotePeerId}`);
      return;
    }

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .catch((error) => {
        console.error("Error handling answer:", error);
        if (this.onError) this.onError("Failed to establish connection");
      });
  }

  // Handle an ICE candidate from a remote peer
  handleIceCandidate(remotePeerId, candidate) {
    const peerConnection = this.peerConnections[remotePeerId];

    if (!peerConnection) {
      console.error(`No peer connection found for peer ${remotePeerId}`);
      return;
    }

    peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch((error) => {
        console.error("Error handling ICE candidate:", error);
      });
  }

  // Close a peer connection
  closePeerConnection(remotePeerId) {
    const dataChannel = this.dataChannels[remotePeerId];
    const peerConnection = this.peerConnections[remotePeerId];

    if (dataChannel) {
      dataChannel.close();
      delete this.dataChannels[remotePeerId];
    }

    if (peerConnection) {
      peerConnection.close();
      delete this.peerConnections[remotePeerId];
    }
  }

  // Send a signaling message
  sendSignalingMessage(message) {
    message.roomId = this.roomId;

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("WebSocket not connected");
      if (this.onError) this.onError("Not connected to signaling server");
    }
  }

  // Send a file to all connected peers
  async sendFile(file) {
    try {
      const peerIds = Object.keys(this.dataChannels);

      if (peerIds.length === 0) {
        throw new Error("No peers connected");
      }

      // Generate a unique ID for this file transfer
      const fileId = uuidv4();

      // Read the file as an ArrayBuffer
      const fileBuffer = await file.arrayBuffer();

      // Calculate chunk size (64 KB)
      const chunkSize = 64 * 1024;

      // Calculate total number of chunks
      const totalChunks = Math.ceil(fileBuffer.byteLength / chunkSize);

      // Notify peers about the file transfer start
      for (const peerId of peerIds) {
        const dataChannel = this.dataChannels[peerId];

        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(
            JSON.stringify({
              type: "file-start",
              fileId,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              totalChunks,
            })
          );
        }
      }

      // Signal that transfer has started
      if (this.onTransferStart) this.onTransferStart();

      // Send chunks to all peers
      for (let i = 0; i < totalChunks; i++) {
        // Create chunk
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileBuffer.byteLength);
        const chunk = fileBuffer.slice(start, end);

        // Create header with metadata
        const fileIdBytes = new TextEncoder()
          .encode(fileId.padEnd(16, "\0"))
          .slice(0, 16);

        const headerBuffer = new ArrayBuffer(28);
        const headerView = new DataView(headerBuffer);

        // Copy fileId into header
        new Uint8Array(headerBuffer, 0, 16).set(fileIdBytes);

        // Set chunk metadata
        headerView.setUint32(16, i, true); // currentChunk
        headerView.setUint32(20, totalChunks, true); // totalChunks

        // Add filename metadata
        const fileNameBytes = new TextEncoder().encode(file.name);
        headerView.setUint32(24, fileNameBytes.length, true); // filenameLength

        // Add filetype metadata
        const fileTypeBytes = new TextEncoder().encode(file.type);

        // Create a buffer for the entire message
        const messageBuffer = new ArrayBuffer(
          headerBuffer.byteLength +
            fileNameBytes.length +
            4 + // fileTypeLength field
            fileTypeBytes.length +
            8 + // fileSize field
            chunk.byteLength
        );

        // Copy header into message
        new Uint8Array(messageBuffer, 0, headerBuffer.byteLength).set(
          new Uint8Array(headerBuffer)
        );

        // Copy filename into message
        new Uint8Array(
          messageBuffer,
          headerBuffer.byteLength,
          fileNameBytes.length
        ).set(fileNameBytes);

        // Add filetype length
        new DataView(
          messageBuffer,
          headerBuffer.byteLength + fileNameBytes.length,
          4
        ).setUint32(0, fileTypeBytes.length, true);

        // Copy filetype into message
        new Uint8Array(
          messageBuffer,
          headerBuffer.byteLength + fileNameBytes.length + 4,
          fileTypeBytes.length
        ).set(fileTypeBytes);

        // Add file size
        new DataView(
          messageBuffer,
          headerBuffer.byteLength +
            fileNameBytes.length +
            4 +
            fileTypeBytes.length,
          8
        ).setBigUint64(0, BigInt(file.size), true);

        // Copy chunk data into message
        new Uint8Array(
          messageBuffer,
          headerBuffer.byteLength +
            fileNameBytes.length +
            4 +
            fileTypeBytes.length +
            8,
          chunk.byteLength
        ).set(new Uint8Array(chunk));

        // Send chunk to all peers
        for (const peerId of peerIds) {
          const dataChannel = this.dataChannels[peerId];

          if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(messageBuffer);
          }
        }

        // Update progress
        if (this.onFileProgress)
          this.onFileProgress(((i + 1) / totalChunks) * 100);

        // Add a small delay between chunks to avoid flooding the data channel
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Notify peers about the file transfer end
      for (const peerId of peerIds) {
        const dataChannel = this.dataChannels[peerId];

        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(
            JSON.stringify({
              type: "file-end",
              fileId,
              fileName: file.name,
              fileType: file.type,
            })
          );
        }
      }

      // Signal that transfer is complete
      if (this.onTransferComplete) this.onTransferComplete();
    } catch (error) {
      console.error("Error sending file:", error);
      if (this.onError) this.onError("Failed to send file: " + error.message);
    }
  }

  // Disconnect from the signaling server and clean up
  disconnect() {
    // Close all peer connections
    Object.keys(this.peerConnections).forEach((peerId) => {
      this.closePeerConnection(peerId);
    });

    // Close the WebSocket connection
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    // Reset state
    this.roomId = null;
    this.peerId = null;
  }
}

export default WebRTCService;
