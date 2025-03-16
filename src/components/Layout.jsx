import React from "react";
import { Link, Outlet } from "react-router-dom";

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#1a1b1c] text-gray-200">
      <header className="bg-[#111213] text-white shadow-md border-b border-[#333]">
        <div className="container mx-auto py-4 px-6 flex justify-between items-center">
          <Link to="/" className="text-xl font-bold text-[#2ecc71]">
            AirDrop Clone
          </Link>
          <nav>
            <ul className="flex space-x-4">
              <li>
                <Link to="/" className="hover:text-[#2ecc71] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="hover:text-[#2ecc71] transition-colors"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-6 py-8">
        <Outlet />
      </main>

      <footer className="bg-[#111213] border-t border-[#333]">
        <div className="container mx-auto py-4 px-6 text-center text-gray-500">
          &copy; {new Date().getFullYear()} AirDrop Clone. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
