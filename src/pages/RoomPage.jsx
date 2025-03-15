import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import WebRTCService from '../services/WebRTCService';
import Dropzone from 'react-dropzone';

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [transferProgress, setTransferProgress] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState(null);
  
  const webrtcRef = useRef(null);

  useEffect(() => {
    // Initialize WebRTC service
    const webrtcService = new WebRTCService();
    webrtcRef.current = webrtcService;
    
    // Set callbacks
    webrtcService.setCallbacks({
      onPeerConnected: (peerId) => {
        setPeers(prev => [...prev, peerId]);
        console.log(`Peer connected: ${peerId}`);
      },
      onPeerDisconnected: (peerId) => {
        setPeers(prev => prev.filter(id => id !== peerId));
        console.log(`Peer disconnected: ${peerId}`);
      },
      onFileProgress: (progress) => {
        setTransferProgress(progress);
      },
      onFileReceived: (file) => {
        setReceivedFiles(prev => [...prev, file]);
        setIsTransferring(false);
        setTransferProgress(0);
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
        setError(message);
        console.error(message);
      }
    });
    
    // Try to join the room first
    webrtcService.joinRoom(roomId)
      .then(() => {
        console.log('Joined room', roomId);
        setIsHost(false);
        setIsConnected(true);
      })
      .catch(err => {
        // If joining fails, create the room
        console.log('Failed to join room, creating instead', err);
        return webrtcService.createRoom(roomId)
          .then(() => {
            console.log('Created room', roomId);
            setIsHost(true);
            setIsConnected(true);
          });
      })
      .catch(err => {
        console.error('Failed to create or join room', err);
        setError('Failed to connect to room. Please try again.');
      });
    
    // Cleanup on unmount
    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
      }
    };
  }, [roomId]);
  
  const handleFileSelect = (files) => {
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };
  
  const handleSendFile = async () => {
    if (!selectedFile || peers.length === 0 || !webrtcRef.current) return;
    
    try {
      await webrtcRef.current.sendFile(selectedFile);
    } catch (err) {
      setError(`Failed to send file: ${err.message}`);
    }
  };
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    // You could add a toast notification here
    alert('Room ID copied to clipboard');
  };
  
  const leaveRoom = () => {
    if (webrtcRef.current) {
      webrtcRef.current.disconnect();
    }
    navigate('/');
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Room: {roomId}</h1>
          <div className="flex space-x-2">
            <button
              onClick={copyRoomId}
              className="bg-blue-100 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-200 transition-colors"
            >
              Copy Room ID
            </button>
            <button
              onClick={leaveRoom}
              className="bg-red-100 text-red-700 px-4 py-2 rounded-md hover:bg-red-200 transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
        
        <div className="bg-blue-50 p-4 rounded-md border border-blue-100 mb-4">
          <h2 className="font-semibold mb-2">Connection Status</h2>
          <p>
            {isConnected ? (
              <span className="text-green-600">✓ Connected to room</span>
            ) : (
              <span className="text-yellow-600">⟳ Connecting...</span>
            )}
          </p>
          <p>You are the {isHost ? 'host' : 'guest'}</p>
          <p>Connected peers: {peers.length}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 p-4 rounded-md border border-red-100 text-red-700 mb-4">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Send Files</h2>
          
          <Dropzone onDrop={handleFileSelect} disabled={isTransferring}>
            {({getRootProps, getInputProps}) => (
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer mb-4 ${
                  isTransferring ? 'bg-gray-100 border-gray-300' : 'border-blue-300 hover:bg-blue-50'
                }`}
              >
                <input {...getInputProps()} />
                {selectedFile ? (
                  <div>
                    <p className="font-semibold">{selectedFile.name}</p>
                    <p className="text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <p>Drag & drop a file here, or click to select a file</p>
                )}
              </div>
            )}
          </Dropzone>
          
          {isTransferring && (
            <div className="mb-4">
              <div className="h-2 bg-gray-200 rounded-full mb-2">
                <div 
                  className="h-full bg-blue-600 rounded-full" 
                  style={{width: `${transferProgress}%`}}
                ></div>
              </div>
              <p className="text-center text-sm text-gray-600">{transferProgress.toFixed(0)}% Complete</p>
            </div>
          )}
          
          <button
            onClick={handleSendFile}
            disabled={!selectedFile || peers.length === 0 || isTransferring}
            className={`w-full py-3 px-4 rounded-md ${
              !selectedFile || peers.length === 0 || isTransferring
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isTransferring ? 'Sending...' : 'Send to All Peers'}
          </button>
          
          {peers.length === 0 && (
            <p className="mt-4 text-center text-sm text-gray-600">
              No peers connected yet. Share your room ID to connect.
            </p>
          )}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Received Files</h2>
          
          {receivedFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No files received yet
            </div>
          ) : (
            <div className="divide-y">
              {receivedFiles.map((file, index) => (
                <div key={index} className="py-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <a
                    href={file.url}
                    download={file.name}
                    className="bg-green-100 text-green-700 px-4 py-2 rounded-md hover:bg-green-200 transition-colors"
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