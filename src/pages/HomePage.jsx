import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import WebRTCService from "../services/WebRTCService";

const HomePage = () => {
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const createRoom = () => {
    const newRoomId = uuidv4().substring(0, 8);
    setIsCreating(true);
    setError(null);

    // First create the room via WebRTC service
    const webrtcService = new WebRTCService();

    webrtcService
      .connect()
      .then(() => {
        return webrtcService.createRoom(newRoomId);
      })
      .then(() => {
        // Disconnect the service - it will be recreated in RoomPage
        webrtcService.disconnect();
        // Navigate after successful room creation
        navigate(`/room/${newRoomId}`);
      })
      .catch((err) => {
        console.error("Failed to create room:", err);
        setError("Failed to create room. Please try again.");
        setIsCreating(false);
      });
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 text-white">
          Share Files Instantly
        </h1>
        <p className="text-xl text-gray-400">
          Peer-to-peer file sharing with WebRTC - no uploads, no waiting
        </p>
      </div>

      {error && (
        <div className="bg-[#2c1f1f] p-4 rounded-md border border-red-900 text-red-400 mb-6">
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#252627] p-8 rounded-lg shadow-lg border border-[#333]">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Create a Room
          </h2>
          <p className="mb-6 text-gray-400">
            Start a new sharing room and invite others to join
          </p>
          <button
            onClick={createRoom}
            disabled={isCreating}
            className={`w-full ${
              isCreating
                ? "bg-[#1e1e1e] text-gray-500 cursor-not-allowed"
                : "bg-[#2ecc71] text-white hover:bg-[#27ae60]"
            } py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2ecc71] focus:ring-opacity-50 transition-colors`}
          >
            {isCreating ? "Creating Room..." : "Create Room"}
          </button>
        </div>

        <div className="bg-[#252627] p-8 rounded-lg shadow-lg border border-[#333]">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Join a Room
          </h2>
          <p className="mb-6 text-gray-400">
            Enter a room code to connect with others
          </p>
          <form onSubmit={joinRoom}>
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full mb-4 p-3 bg-[#1a1b1c] border border-[#444] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2ecc71] focus:border-transparent"
              required
            />
            <button
              type="submit"
              className="w-full bg-[#2ecc71] text-white py-3 px-4 rounded-md hover:bg-[#27ae60] focus:outline-none focus:ring-2 focus:ring-[#2ecc71] focus:ring-opacity-50 transition-colors"
            >
              Join Room
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12 bg-[#252627] p-6 rounded-lg border border-[#333]">
        <h2 className="text-xl font-semibold mb-2 text-white">How It Works</h2>
        <ol className="list-decimal ml-6 space-y-2 text-gray-300">
          <li>Create a new room or join an existing one</li>
          <li>Share the room ID with people you want to connect with</li>
          <li>Select files to share once connected</li>
          <li>Files are transferred directly between browsers</li>
          <li>No data passes through our servers</li>
        </ol>
      </div>
    </div>
  );
};

export default HomePage;
