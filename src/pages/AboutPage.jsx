import React from "react";

const AboutPage = () => {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-white">
        About AirDrop Clone
      </h1>

      <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333] mb-8">
        <h2 className="text-xl font-semibold mb-4 text-white">How It Works</h2>
        <p className="mb-4 text-gray-300">
          AirDrop Clone is a web-based peer-to-peer file sharing application
          that uses WebRTC technology to transfer files directly between
          browsers without going through a server.
        </p>
        <p className="mb-4 text-gray-300">
          When you create or join a room, your browser connects to our signaling
          server to help discover other peers in the same room. Once connected,
          all file transfers happen directly between browsers, ensuring fast
          transfers and privacy.
        </p>
      </div>

      <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333] mb-8">
        <h2 className="text-xl font-semibold mb-4 text-white">Technology</h2>
        <ul className="list-disc ml-6 space-y-2 text-gray-300">
          <li>
            <strong className="text-[#2ecc71]">Frontend:</strong> React,
            Tailwind CSS
          </li>
          <li>
            <strong className="text-[#2ecc71]">Backend:</strong> Spring Boot
          </li>
          <li>
            <strong className="text-[#2ecc71]">Real-time Communication:</strong>{" "}
            WebSockets
          </li>
          <li>
            <strong className="text-[#2ecc71]">P2P File Transfer:</strong>{" "}
            WebRTC Data Channels
          </li>
        </ul>
      </div>

      <div className="bg-[#252627] p-6 rounded-lg shadow-lg border border-[#333]">
        <h2 className="text-xl font-semibold mb-4 text-white">
          Privacy & Security
        </h2>
        <p className="mb-4 text-gray-300">
          Your files never touch our servers - they're transferred directly
          between browsers using encrypted WebRTC connections. This means your
          data stays private and transfers are as fast as your network allows.
        </p>
        <p className="text-gray-300">
          Room IDs are randomly generated and not stored permanently. Once all
          participants leave a room, it's automatically deleted from our system.
        </p>
      </div>
    </div>
  );
};

export default AboutPage;
