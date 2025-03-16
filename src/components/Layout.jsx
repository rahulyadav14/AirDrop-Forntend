import React from "react";
import { Link, Outlet } from "react-router-dom";

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-600 text-white shadow-md">
        <div className="container mx-auto py-4 px-6 flex justify-between items-center">
          <Link to="/" className="text-xl font-bold">
            AirDrop Clone
          </Link>
          <nav>
            <ul className="flex space-x-4">
              <li>
                <Link to="/" className="hover:text-blue-200">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-blue-200">
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

      <footer className="bg-gray-100 border-t border-gray-800/30">
        <div className="container mx-auto py-4 px-6 text-center text-gray-600">
          &copy; {new Date().getFullYear()} AirDrop Clone. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
