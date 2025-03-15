import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const HomePage = () => {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    const newRoomId = uuidv4().substring(0, 8);
    navigate(`/room/${newRoomId}`);
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
        <h1 className="text-4xl font-bold mb-4">Share Files Instantly</h1>
        <p className="text-xl text-gray-600">
          Peer-to-peer file sharing with WebRTC - no uploads, no waiting
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Create a Room</h2>
          <p className="mb-6 text-gray-600">
            Start a new sharing room and invite others to join
          </p>
          <button
            onClick={createRoom}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Create Room
          </button>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Join a Room</h2>
          <p className="mb-6 text-gray-600">
            Enter a room code to connect with others
          </p>
          <form onSubmit={joinRoom}>
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full mb-4 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
            >
              Join Room
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12 bg-blue-50 p-6 rounded-lg border border-blue-100">
        <h2 className="text-xl font-semibold mb-2">How It Works</h2>
        <ol className="list-decimal ml-6 space-y-2">
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
