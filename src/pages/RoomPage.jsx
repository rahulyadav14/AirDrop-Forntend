import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import WebRTCService from "../services/WebRTCService";
import Dropzone from "react-dropzone";

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [peers, setPeers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [transferProgress, setTransferProgress] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState(null);

  const webrtcRef = useRef(null);

  // Determine if there's a successful transfer or connection
  const hasSuccessfulTransfers = receivedFiles.length > 0;
  const canSendFile = selectedFile && isConnected && !isTransferring;

  useEffect(() => {
    console.log("Initializing WebRTC service");

    // Initialize WebRTC service
    const webrtcService = new WebRTCService();
    webrtcRef.current = webrtcService;

    // Set callbacks
    webrtcService.setCallbacks({
      onPeerConnected: (peerId) => {
        console.log(`Peer connected: ${peerId}`);
        setPeers((prev) => {
          if (prev.includes(peerId)) return prev;
          return [...prev, peerId];
        });
        setIsConnected(true);
        setError(null); // Clear any errors when a peer connects
      },
      onPeerDisconnected: (peerId) => {
        console.log(`Peer disconnected: ${peerId}`);
        setPeers((prev) => prev.filter((id) => id !== peerId));
      },
      onFileProgress: (progress) => {
        setTransferProgress(progress);
      },
      onFileReceived: (file) => {
        console.log(`File received: ${file.name}`);
        setReceivedFiles((prev) => [...prev, file]);
        setIsTransferring(false);
        setTransferProgress(0);
        setError(null); // Clear any errors when a file is received
      },
      onTransferStart: () => {
        setIsTransferring(true);
        setTransferProgress(0);
      },
      onTransferComplete: () => {
        setIsTransferring(false);
        setTransferProgress(100);
      },
      onError: (message) => {
        console.log(`WebRTC error: ${message}`);

        // Don't show "Room doesn't exist" error if we have successful transfers
        if (
          (message.includes("Room doesn't exist") ||
            message.includes("connection")) &&
          (hasSuccessfulTransfers || isConnected)
        ) {
          console.log(
            "Ignoring error because we're connected or have transfers"
          );
          return;
        }

        setError(message);
      },
    });

    // Connect to room
    const connectToRoom = async () => {
      try {
        setIsConnecting(true);

        // First connect to signaling server
        await webrtcService.connect();

        // Try to join the room
        try {
          console.log(`Attempting to join room: ${roomId}`);
          await webrtcService.joinRoom(roomId);
          console.log(`Successfully joined room: ${roomId}`);
          setIsHost(false);
          setIsConnected(true);
          setError(null);

          // If we successfully joined, we're definitely connected to at least the host
          setPeers(["host"]);
        } catch (joinErr) {
          console.log(`Failed to join room, attempting to create instead`);

          // If joining fails, try to create the room
          try {
            await webrtcService.createRoom(roomId);
            console.log(`Successfully created room: ${roomId}`);
            setIsHost(true);
            setIsConnected(true);
            setError(null);
          } catch (createErr) {
            console.error(`Failed to create room: ${createErr.message}`);
            setError("Failed to create or join room");
            setIsConnected(false);
          }
        }
      } catch (err) {
        console.error(`Connection error: ${err?.message || "Unknown error"}`);
        setError("Failed to connect to signaling server");
        setIsConnected(false);
      } finally {
        setIsConnecting(false);
      }
    };

    connectToRoom();

    // Cleanup on unmount
    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
      }
    };
  }, [roomId, hasSuccessfulTransfers]);

  const handleFileSelect = (files) => {
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleSendFile = async () => {
    if (!selectedFile || !webrtcRef.current || isTransferring) return;

    try {
      await webrtcRef.current.sendFile(selectedFile);
    } catch (err) {
      setError(`Failed to send file: ${err.message}`);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert("Room ID copied to clipboard");
  };

  const leaveRoom = () => {
    if (webrtcRef.current) {
      webrtcRef.current.disconnect();
    }
    navigate("/");
  };

  // A guest is connected to the host by definition
  const effectivePeerCount = isHost ? peers.length : Math.max(1, peers.length);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333] mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-white">Room: {roomId}</h1>
          <div className="flex space-x-2">
            <button
              onClick={copyRoomId}
              className="bg-[#333] text-[#2ecc71] px-4 py-2 rounded-md hover:bg-[#444] transition-colors"
            >
              Copy Room ID
            </button>
            <button
              onClick={leaveRoom}
              className="bg-[#3a1a1a] text-red-400 px-4 py-2 rounded-md hover:bg-[#4a2a2a] transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>

        <div className="bg-[#1e1f20] p-4 rounded-md border border-[#333] mb-4">
          <h2 className="font-semibold mb-2 text-white">Connection Status</h2>
          <p>
            {isConnecting ? (
              <span className="text-yellow-400">⟳ Connecting...</span>
            ) : isConnected ? (
              <span className="text-green-400">✓ Connected to room</span>
            ) : (
              <span className="text-red-400">✗ Not connected</span>
            )}
          </p>
          <p className="text-gray-300">
            You are the {isHost ? "host" : "guest"}
          </p>
          <p className="text-gray-300">
            Connected peers: {effectivePeerCount}
            {!isHost && " (including host)"}
          </p>
        </div>

        {/* Only show error if we don't have successful transfers */}
        {error && !hasSuccessfulTransfers && !isConnected && (
          <div className="bg-[#2c1f1f] p-4 rounded-md border border-red-900 text-red-400 mb-4">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333]">
          <h2 className="text-xl font-semibold mb-4 text-white">Send Files</h2>

          <Dropzone onDrop={handleFileSelect} disabled={isTransferring}>
            {({ getRootProps, getInputProps }) => (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer mb-4 ${
                  isTransferring
                    ? "bg-[#222] border-[#444]"
                    : "border-[#444] hover:bg-[#2a2b2c]"
                }`}
              >
                <input {...getInputProps()} />
                {selectedFile ? (
                  <div>
                    <p className="font-semibold text-white">
                      {selectedFile.name}
                    </p>
                    <p className="text-gray-400">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-400">
                    Drag &amp; drop a file here, or click to select a file
                  </p>
                )}
              </div>
            )}
          </Dropzone>

          {isTransferring && (
            <div className="mb-4">
              <div className="h-2 bg-[#333] rounded-full mb-2">
                <div
                  className="h-full bg-[#2ecc71] rounded-full"
                  style={{ width: `${transferProgress}%` }}
                ></div>
              </div>
              <p className="text-center text-sm text-gray-400">
                {transferProgress.toFixed(0)}% Complete
              </p>
            </div>
          )}

          <button
            onClick={handleSendFile}
            disabled={!canSendFile}
            className={`w-full py-3 px-4 rounded-md transition-colors ${
              !canSendFile
                ? "bg-[#333] text-gray-500 cursor-not-allowed"
                : "bg-[#2ecc71] text-white hover:bg-[#27ae60]"
            }`}
          >
            {isTransferring ? "Sending..." : "Send to All Peers"}
          </button>

          {!isConnected && (
            <p className="mt-4 text-center text-sm text-gray-500">
              Not connected yet. Wait for connection or share your room ID.
            </p>
          )}
        </div>

        <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333]">
          <h2 className="text-xl font-semibold mb-4 text-white">
            Received Files
          </h2>

          {receivedFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No files received yet
            </div>
          ) : (
            <div className="divide-y divide-[#333]">
              {receivedFiles.map((file, index) => (
                <div
                  key={index}
                  className="py-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-white">{file.name}</p>
                    <p className="text-sm text-gray-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <a
                    href={file.url}
                    download={file.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#333] text-[#2ecc71] px-4 py-2 rounded-md hover:bg-[#444] transition-colors"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
