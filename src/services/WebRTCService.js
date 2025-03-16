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

    // Signaling state tracking
    this.pendingRemoteDescriptions = {};
    this.pendingIceCandidates = {};

    console.log("WebRTCService initialized");
  }

  setCallbacks(callbacks) {
    this.onPeerConnected = callbacks.onPeerConnected;
    this.onPeerDisconnected = callbacks.onPeerDisconnected;
    this.onFileProgress = callbacks.onFileProgress;
    this.onFileReceived = callbacks.onFileReceived;
    this.onTransferStart = callbacks.onTransferStart;
    this.onTransferComplete = callbacks.onTransferComplete;
    this.onError = callbacks.onError;
    console.log("Callbacks set");
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Check if we're already connected
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log("Already connected to signaling server");
        resolve();
        return;
      }

      console.log("Connecting to signaling server...");

      // For local development
     let wsUrl;
     if (process.env.NODE_ENV === "production") {
       // Production environment - use Render deployed backend
       wsUrl = "wss://airdrop-clone-backend.onrender.com/ws";
     } else {
       // Development environment - use localhost
       wsUrl = "ws://localhost:8080/ws";
     }
      console.log(`WebSocket URL: ${wsUrl}`);

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log("Connected to signaling server");
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Received websocket message:", message);
          this.handleSignalingMessage(message);
        } catch (err) {
          console.error("Error parsing websocket message:", err);
          if (this.onError) this.onError("Failed to parse signaling message");
        }
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
      if (!roomId) {
        reject(new Error("Room ID must be provided"));
        return;
      }

      console.log(`Creating room with ID: ${roomId}`);

      this.connect()
        .then(() => {
          this.sendSignalingMessage({
            type: "create-room",
            roomId: roomId,
          });

          // We'll resolve the promise when we receive the room-created message
          this.pendingCreateRoom = resolve;

          // Add a timeout to reject the promise if we don't get a response
          this.createRoomTimeout = setTimeout(() => {
            if (this.pendingCreateRoom) {
              this.pendingCreateRoom = null;
              reject(new Error("Timeout creating room"));
            }
          }, 10000); // 10 second timeout
        })
        .catch(reject);
    });
  }

  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      if (!roomId) {
        reject(new Error("Room ID must be provided"));
        return;
      }

      console.log(`Joining room with ID: ${roomId}`);

      this.connect()
        .then(() => {
          this.sendSignalingMessage({
            type: "join-room",
            roomId: roomId,
          });

          // We'll resolve the promise when we receive the room-joined message
          this.pendingJoinRoom = resolve;

          // Add a timeout to reject the promise if we don't get a response
          this.joinRoomTimeout = setTimeout(() => {
            if (this.pendingJoinRoom) {
              this.pendingJoinRoom = null;
              reject(new Error("Timeout joining room"));
            }
          }, 10000); // 10 second timeout
        })
        .catch(reject);
    });
  }

  handleSignalingMessage(message) {
    console.log(`Handling signaling message: ${message.type}`);

    switch (message.type) {
      case "room-created":
        this.roomId = message.roomId;
        this.peerId = message.peerId;
        if (this.pendingCreateRoom) {
          clearTimeout(this.createRoomTimeout);
          console.log(`Room created: ${this.roomId}, peer ID: ${this.peerId}`);
          this.pendingCreateRoom({ roomId: this.roomId, peerId: this.peerId });
          this.pendingCreateRoom = null;
        }
        break;

      case "room-joined":
        this.roomId = message.roomId;
        this.peerId = message.peerId;
        if (this.pendingJoinRoom) {
          clearTimeout(this.joinRoomTimeout);
          console.log(`Room joined: ${this.roomId}, peer ID: ${this.peerId}`);
          this.pendingJoinRoom({ roomId: this.roomId, peerId: this.peerId });
          this.pendingJoinRoom = null;
        }
        break;

      case "new-peer":
        console.log(`New peer: ${message.from}`);
        if (!this.peerConnections[message.from]) {
          this.createPeerConnection(message.from);
          if (this.onPeerConnected) this.onPeerConnected(message.from);
        }
        break;

      case "peer-left":
        console.log(`Peer left: ${message.from}`);
        this.closePeerConnection(message.from);
        if (this.onPeerDisconnected) this.onPeerDisconnected(message.from);
        break;

      case "offer":
        console.log(`Received offer from: ${message.from}`);
        this.handleOffer(message.from, message.data);
        break;

      case "answer":
        console.log(`Received answer from: ${message.from}`);
        this.handleAnswer(message.from, message.data);
        break;

      case "ice-candidate":
        console.log(`Received ICE candidate from: ${message.from}`);
        this.handleIceCandidate(message.from, message.data);
        break;

      case "error":
        console.error(`Signaling error: ${message.data}`);
        if (this.onError) this.onError(message.data);
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  // Create a peer connection and offer to the remote peer
  createPeerConnection(remotePeerId) {
    console.log(`Creating peer connection with: ${remotePeerId}`);

    // If there's already a connection, close it first
    if (this.peerConnections[remotePeerId]) {
      console.log(
        `Closing existing connection with ${remotePeerId} before creating a new one`
      );
      this.closePeerConnection(remotePeerId);
    }

    // Initialize pending ice candidates array
    this.pendingIceCandidates[remotePeerId] = [];

    // Define ICE servers including TURN servers for better connectivity
    const iceServers = {
      iceServers: [
        // STUN servers
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        // Public TURN servers - for better NAT traversal
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    };

    try {
      // Create a new RTCPeerConnection
      const peerConnection = new RTCPeerConnection(iceServers);
      this.peerConnections[remotePeerId] = peerConnection;

      // Log ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state changed to: ${peerConnection.iceConnectionState} for peer: ${remotePeerId}`
        );

        if (
          peerConnection.iceConnectionState === "failed" ||
          peerConnection.iceConnectionState === "disconnected"
        ) {
          console.error(`ICE connection failed for peer: ${remotePeerId}`);

          // Try resetting the connection
          this.resetConnection(remotePeerId);
        }
      };

      // Log connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(
          `Connection state changed to: ${peerConnection.connectionState} for peer: ${remotePeerId}`
        );

        if (peerConnection.connectionState === "connected") {
          console.log(`Connection established with peer: ${remotePeerId}`);
        } else if (peerConnection.connectionState === "failed") {
          console.error(`Connection failed for peer: ${remotePeerId}`);

          // Try resetting the connection
          this.resetConnection(remotePeerId);
        }
      };

      // Log signaling state changes
      peerConnection.onsignalingstatechange = () => {
        console.log(
          `Signaling state changed to: ${peerConnection.signalingState} for peer: ${remotePeerId}`
        );

        // Check if we can apply any pending remote description
        if (peerConnection.signalingState === "stable") {
          if (this.pendingRemoteDescriptions[remotePeerId]) {
            console.log(
              `Applying pending remote description for peer: ${remotePeerId}`
            );
            this.applyPendingRemoteDescription(remotePeerId);
          }

          // Also apply any pending ICE candidates
          this.applyPendingIceCandidates(remotePeerId);
        }
      };

      // Create a data channel for file transfer with specific options for reliability
      const dataChannel = peerConnection.createDataChannel("fileTransfer", {
        ordered: true, // Guaranteed delivery
        maxRetransmits: 30, // Maximum number of retransmission attempts
      });

      this.setupDataChannel(dataChannel, remotePeerId);

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`Generated ICE candidate for peer: ${remotePeerId}`);
          this.sendSignalingMessage({
            type: "ice-candidate",
            to: remotePeerId,
            data: event.candidate,
          });
        } else {
          console.log(`All ICE candidates gathered for peer: ${remotePeerId}`);
        }
      };

      // Handle data channels created by the remote peer
      peerConnection.ondatachannel = (event) => {
        console.log(
          `Received data channel from peer: ${remotePeerId}, label: ${event.channel.label}`
        );
        this.setupDataChannel(event.channel, remotePeerId);
      };

      // Create an offer
      peerConnection
        .createOffer()
        .then((offer) => {
          console.log(`Created offer for peer: ${remotePeerId}`);
          return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
          console.log(`Set local description for peer: ${remotePeerId}`);
          this.sendSignalingMessage({
            type: "offer",
            to: remotePeerId,
            data: peerConnection.localDescription,
          });
        })
        .catch((error) => {
          console.error(
            `Error creating offer for peer ${remotePeerId}:`,
            error
          );
          if (this.onError) this.onError("Failed to create connection offer");
        });

      return peerConnection;
    } catch (error) {
      console.error(
        `Error creating peer connection with ${remotePeerId}:`,
        error
      );
      if (this.onError)
        this.onError(`Failed to create peer connection: ${error.message}`);
      return null;
    }
  }

  // Try to reset a failed connection
  resetConnection(remotePeerId) {
    console.log(`Attempting to reset connection with peer: ${remotePeerId}`);

    // Close existing connection
    this.closePeerConnection(remotePeerId);

    // Wait a short time before recreating
    setTimeout(() => {
      // Only create new connection if we're still connected to signaling server
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log(`Recreating connection with peer: ${remotePeerId}`);
        this.createPeerConnection(remotePeerId);
      }
    }, 1000);
  }

  // Apply any pending remote description when in the right state
  applyPendingRemoteDescription(remotePeerId) {
    const peerConnection = this.peerConnections[remotePeerId];
    const pendingDescription = this.pendingRemoteDescriptions[remotePeerId];

    if (!peerConnection || !pendingDescription) return;

    console.log(
      `Applying pending ${pendingDescription.type} for peer: ${remotePeerId}`
    );

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(pendingDescription))
      .then(() => {
        console.log(
          `Successfully applied pending remote description for peer: ${remotePeerId}`
        );

        // Clear the pending description
        delete this.pendingRemoteDescriptions[remotePeerId];

        // If this was an offer, we need to create an answer
        if (pendingDescription.type === "offer") {
          console.log(`Creating answer for peer: ${remotePeerId}`);
          return peerConnection.createAnswer();
        }
      })
      .then((answer) => {
        if (answer) {
          console.log(
            `Setting local description (answer) for peer: ${remotePeerId}`
          );
          return peerConnection.setLocalDescription(answer);
        }
      })
      .then(() => {
        if (
          peerConnection.localDescription &&
          peerConnection.localDescription.type === "answer"
        ) {
          console.log(`Sending answer to peer: ${remotePeerId}`);
          this.sendSignalingMessage({
            type: "answer",
            to: remotePeerId,
            data: peerConnection.localDescription,
          });
        }
      })
      .catch((error) => {
        console.error(
          `Error applying pending remote description for peer ${remotePeerId}:`,
          error
        );
      });
  }

  // Apply any pending ICE candidates when in the right state
  applyPendingIceCandidates(remotePeerId) {
    const peerConnection = this.peerConnections[remotePeerId];
    const candidates = this.pendingIceCandidates[remotePeerId];

    if (!peerConnection || !candidates || candidates.length === 0) return;

    console.log(
      `Applying ${candidates.length} pending ICE candidates for peer: ${remotePeerId}`
    );

    candidates.forEach((candidate) => {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .then(() => {
          console.log(`Added pending ICE candidate for peer: ${remotePeerId}`);
        })
        .catch((error) => {
          console.error(
            `Error adding pending ICE candidate for peer ${remotePeerId}:`,
            error
          );
        });
    });

    // Clear the pending candidates
    this.pendingIceCandidates[remotePeerId] = [];
  }

  // Set up a data channel for file transfer
  setupDataChannel(dataChannel, remotePeerId) {
    console.log(
      `Setting up data channel for peer: ${remotePeerId}, label: ${dataChannel.label}`
    );

    this.dataChannels[remotePeerId] = dataChannel;
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
      console.log(`Data channel with peer ${remotePeerId} opened`);
      // Notify that a new peer is available for data transfer
      if (this.onPeerConnected) {
        this.onPeerConnected(remotePeerId);
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel with peer ${remotePeerId} closed`);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with peer ${remotePeerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      // Log the type of message received
      const messageType = typeof event.data === "string" ? "string" : "binary";
      console.log(`Received ${messageType} message from peer: ${remotePeerId}`);

      this.handleDataChannelMessage(event.data, remotePeerId);
    };
  }

  // Check if we have any open data channels
  hasOpenDataChannels() {
    const peerIds = Object.keys(this.dataChannels);
    if (peerIds.length === 0) return false;

    // Check if any data channel is in the "open" state
    const openChannels = peerIds.filter((peerId) => {
      const dataChannel = this.dataChannels[peerId];
      return dataChannel && dataChannel.readyState === "open";
    });

    console.log(`Open data channels: ${openChannels.length}/${peerIds.length}`);
    return openChannels.length > 0;
  }

  // Wait for data channels to open
  waitForDataChannels(timeout = 5000) {
    return new Promise((resolve, reject) => {
      // If we already have open channels, resolve immediately
      if (this.hasOpenDataChannels()) {
        resolve();
        return;
      }

      // Create a check interval
      const interval = setInterval(() => {
        if (this.hasOpenDataChannels()) {
          clearInterval(interval);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 100);

      // Create a timeout to fail if it takes too long
      const timeoutId = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("No peers ready for data transfer"));
      }, timeout);
    });
  }

  // Handle incoming data channel messages
  handleDataChannelMessage(data, remotePeerId) {
    // If the message is a string, it's a control message
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);
        console.log(
          `Received control message type: ${message.type} from peer: ${remotePeerId}`
        );

        // Handle file start message
        if (message.type === "file-start") {
          // Initialize the file chunks array
          this.fileChunks[message.fileId] = [];
          console.log(
            `Starting to receive file: ${message.fileName}, size: ${message.fileSize}, chunks: ${message.totalChunks}`
          );
        }

        // Handle file end message
        if (message.type === "file-end") {
          console.log(
            `File transfer of ${message.fileName} completed, reassembling...`
          );
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
      try {
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

        // Print log only for first chunk, last chunk, and every 10th chunk
        if (
          currentChunk === 0 ||
          currentChunk === totalChunks - 1 ||
          currentChunk % 10 === 0
        ) {
          console.log(
            `Received chunk ${
              currentChunk + 1
            }/${totalChunks} for file: ${fileName}`
          );
        }

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
          console.log(`First chunk received for file: ${fileName}`);
          if (this.onTransferStart) this.onTransferStart();
        }

        // If we've received all chunks, reassemble the file
        if (this.fileChunks[fileId].length === totalChunks) {
          console.log(
            `All ${totalChunks} chunks received for file: ${fileName}, reassembling...`
          );
          this.reassembleFile(fileId, fileName, fileType);
        }
      } catch (error) {
        console.error("Error processing file chunk:", error);
      }
    }
  }

  // Reassemble file from chunks
  reassembleFile(fileId, fileName, fileType) {
    console.log(`Starting file reassembly for: ${fileName}, type: ${fileType}`);

    try {
      // Get all chunks for this file
      const chunks = this.fileChunks[fileId];

      if (!chunks || chunks.length === 0) {
        throw new Error(`No chunks found for file: ${fileName}`);
      }

      // Log chunk information
      console.log(`Reassembling file from ${chunks.length} chunks`);

      // Sort chunks by index to ensure correct order
      chunks.sort((a, b) => a.currentChunk - b.currentChunk);

      // Calculate total size
      const totalSize = chunks[0].size;
      console.log(`File size: ${totalSize} bytes`);

      // Create a buffer for the entire file
      const fileBuffer = new Uint8Array(totalSize);
      console.log(`Created buffer of size: ${fileBuffer.length} bytes`);

      // Copy each chunk into the file buffer
      let offset = 0;
      for (const chunk of chunks) {
        const chunkData = new Uint8Array(chunk.data);
        fileBuffer.set(chunkData, offset);
        offset += chunkData.length;
      }
      console.log(`All chunks copied to buffer, total bytes: ${offset}`);

      // Create a Blob from the buffer
      const blob = new Blob([fileBuffer], { type: fileType });
      console.log(
        `Created blob of type: ${fileType}, size: ${blob.size} bytes`
      );

      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      console.log(`Created blob URL: ${url}`);

      // Test the URL
      try {
        const testUrl = new URL(url);
        console.log(`URL is valid: ${testUrl.toString()}`);
      } catch (err) {
        console.error(`Invalid URL created: ${err.message}`);
      }

      // Signal that the file has been received
      if (this.onFileReceived) {
        const file = {
          name: fileName,
          url: url,
          size: totalSize,
          type: fileType,
          blob: blob,
          // Add timestamp to ensure the object is unique
          timestamp: new Date().getTime(),
        };

        // Log before calling callback
        console.log(
          `Calling onFileReceived with file: ${fileName}, URL: ${url.substring(
            0,
            30
          )}...`
        );

        // We use setTimeout to ensure this runs outside the current execution context
        setTimeout(() => {
          console.log(`Executing onFileReceived callback for: ${fileName}`);
          this.onFileReceived(file);
        }, 100);
      }

      // Signal that transfer is complete
      if (this.onTransferComplete) {
        this.onTransferComplete();
      }

      // Clean up
      delete this.fileChunks[fileId];
      console.log(`File reassembly complete for: ${fileName}`);

      // Return file info (for testing)
      return {
        name: fileName,
        size: totalSize,
        type: fileType,
        url: url,
      };
    } catch (error) {
      console.error(`Error reassembling file: ${fileName}`, error);
      if (this.onError)
        this.onError(`Failed to reassemble file: ${error.message}`);
      return null;
    }
  }

  // Handle an offer from a remote peer
  handleOffer(remotePeerId, sdp) {
    console.log(`Handling offer from peer: ${remotePeerId}`);

    // Create a new peer connection if one doesn't exist
    let peerConnection = this.peerConnections[remotePeerId];

    if (!peerConnection) {
      console.log(
        `Creating new peer connection for offer from: ${remotePeerId}`
      );
      peerConnection = this.createPeerConnection(remotePeerId);
      if (this.onPeerConnected) this.onPeerConnected(remotePeerId);
    }

    // Check signaling state to determine if we can set remote description now
    if (peerConnection.signalingState === "stable") {
      console.log(
        `Setting remote description (offer) for peer: ${remotePeerId}`
      );

      peerConnection
        .setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => {
          console.log(`Remote description set for peer: ${remotePeerId}`);
          return peerConnection.createAnswer();
        })
        .then((answer) => {
          console.log(`Answer created for peer: ${remotePeerId}`);
          return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
          console.log(`Local description set for peer: ${remotePeerId}`);
          this.sendSignalingMessage({
            type: "answer",
            to: remotePeerId,
            data: peerConnection.localDescription,
          });

          // Apply any pending ICE candidates
          this.applyPendingIceCandidates(remotePeerId);
        })
        .catch((error) => {
          console.error(`Error handling offer from ${remotePeerId}:`, error);
          if (this.onError)
            this.onError(`Failed to handle connection offer: ${error.message}`);
        });
    } else {
      // Save the offer for later - we're not in the right state
      console.log(
        `Peer ${remotePeerId} not in 'stable' state (currently ${peerConnection.signalingState}), saving offer for later`
      );
      this.pendingRemoteDescriptions[remotePeerId] = sdp;
    }
  }

  // Handle an answer from a remote peer
  handleAnswer(remotePeerId, sdp) {
    console.log(`Handling answer from peer: ${remotePeerId}`);

    const peerConnection = this.peerConnections[remotePeerId];

    if (!peerConnection) {
      console.error(`No peer connection found for ${remotePeerId}`);
      return;
    }

    // Check if we're in the right state to apply this answer
    if (peerConnection.signalingState === "have-local-offer") {
      console.log(
        `Setting remote description (answer) for peer: ${remotePeerId}`
      );

      peerConnection
        .setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => {
          console.log(`Remote description set for peer: ${remotePeerId}`);

          // Apply any pending ICE candidates
          this.applyPendingIceCandidates(remotePeerId);
        })
        .catch((error) => {
          console.error(`Error handling answer from ${remotePeerId}:`, error);
          if (this.onError)
            this.onError(`Failed to establish connection: ${error.message}`);
        });
    } else {
      // Save the answer for later - we're not in the right state
      console.log(
        `Peer ${remotePeerId} not in 'have-local-offer' state (currently ${peerConnection.signalingState}), saving answer for later`
      );
      this.pendingRemoteDescriptions[remotePeerId] = sdp;
    }
  }

  // Handle an ICE candidate from a remote peer
  handleIceCandidate(remotePeerId, candidate) {
    console.log(`Handling ICE candidate for peer: ${remotePeerId}`);

    const peerConnection = this.peerConnections[remotePeerId];

    if (!peerConnection) {
      console.error(`No peer connection found for ${remotePeerId}`);
      return;
    }

    // Save candidates if we're not in the right state yet
    if (peerConnection.currentRemoteDescription === null) {
      console.log(
        `Remote description not set yet for peer: ${remotePeerId}, storing ICE candidate for later`
      );

      if (!this.pendingIceCandidates[remotePeerId]) {
        this.pendingIceCandidates[remotePeerId] = [];
      }
      this.pendingIceCandidates[remotePeerId].push(candidate);
      return;
    }

    peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .then(() => {
        console.log(`Added ICE candidate for peer: ${remotePeerId}`);
      })
      .catch((error) => {
        console.error(
          `Error handling ICE candidate for ${remotePeerId}:`,
          error
        );
      });
  }

  // Close a peer connection
  closePeerConnection(remotePeerId) {
    console.log(`Closing peer connection with: ${remotePeerId}`);

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

    // Clear any pending state for this peer
    delete this.pendingRemoteDescriptions[remotePeerId];
    delete this.pendingIceCandidates[remotePeerId];
  }

  // Send a signaling message
  sendSignalingMessage(message) {
    // If roomId is not provided in the message but is set in the class, add it
    if (!message.roomId && this.roomId) {
      message.roomId = this.roomId;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(`Sending signaling message: ${message.type}`);
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("WebSocket not connected");
      if (this.onError) this.onError("Not connected to signaling server");
    }
  }

  // Send a file to all connected peers
  async sendFile(file) {
    try {
      console.log(`Attempting to send file: ${file.name}, size: ${file.size}`);

      // First, check if we have open data channels
      if (!this.hasOpenDataChannels()) {
        console.log(
          "No data channels are currently open. Waiting for channels to open..."
        );

        // Try to wait for data channels to open
        try {
          await this.waitForDataChannels();
        } catch (err) {
          console.error("Failed to wait for data channels:", err);
          throw new Error("No peers ready for data transfer");
        }
      }

      // Get channels that are actually open
      const peerIds = Object.keys(this.dataChannels).filter((peerId) => {
        const dataChannel = this.dataChannels[peerId];
        return dataChannel && dataChannel.readyState === "open";
      });

      console.log(`Sending file to ${peerIds.length} peers:`, peerIds);

      if (peerIds.length === 0) {
        throw new Error("No peers ready for data transfer");
      }

      // Generate a unique ID for this file transfer
      const fileId = uuidv4();
      console.log(`Generated file ID: ${fileId}`);

      // Read the file as an ArrayBuffer
      const fileBuffer = await file.arrayBuffer();
      console.log(
        `File read into buffer, size: ${fileBuffer.byteLength} bytes`
      );

      // Calculate chunk size (64 KB)
      const chunkSize = 64 * 1024;

      // Calculate total number of chunks
      const totalChunks = Math.ceil(fileBuffer.byteLength / chunkSize);
      console.log(
        `File will be sent in ${totalChunks} chunks of ${chunkSize} bytes each`
      );

      // Notify peers about the file transfer start
      for (const peerId of peerIds) {
        const dataChannel = this.dataChannels[peerId];

        if (dataChannel && dataChannel.readyState === "open") {
          console.log(`Sending file-start message to peer: ${peerId}`);
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
        } else {
          console.error(`Data channel for peer ${peerId} is not open`);
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

        // Print log for first chunk, last chunk, and every 10th chunk
        if (i === 0 || i === totalChunks - 1 || i % 10 === 0) {
          console.log(`Sending chunk ${i + 1}/${totalChunks}`);
        }

        // Send chunk to all peers
        for (const peerId of peerIds) {
          const dataChannel = this.dataChannels[peerId];

          if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(messageBuffer);
          } else {
            console.error(
              `Data channel for peer ${peerId} is not open while sending chunk ${i}`
            );
          }
        }

        // Update progress
        if (this.onFileProgress) {
          const progress = ((i + 1) / totalChunks) * 100;
          this.onFileProgress(progress);
        }

        // Add a small delay between chunks to avoid flooding the data channel
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Notify peers about the file transfer end
      for (const peerId of peerIds) {
        const dataChannel = this.dataChannels[peerId];

        if (dataChannel && dataChannel.readyState === "open") {
          console.log(`Sending file-end message to peer: ${peerId}`);
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

      console.log(`File send completed for: ${file.name}`);
    } catch (error) {
      console.error(`Error sending file: ${file.name}`, error);
      if (this.onError) this.onError(`Failed to send file: ${error.message}`);
      throw error;
    }
  }

  // Disconnect from the signaling server and clean up
  disconnect() {
    console.log("Disconnecting from WebRTC service");

    // Clear any pending timeouts
    if (this.createRoomTimeout) {
      clearTimeout(this.createRoomTimeout);
    }
    if (this.joinRoomTimeout) {
      clearTimeout(this.joinRoomTimeout);
    }

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
    this.pendingRemoteDescriptions = {};
    this.pendingIceCandidates = {};

    console.log("Disconnected and cleaned up");
  }
}

export default WebRTCService;
