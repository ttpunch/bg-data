import React, { useState } from "react";
import { Link } from "react-router-dom";
import jwt_decode from "jwt-decode";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("token"));
  let user = null;

  if (token) {
    const decoded = jwt_decode(token);
    user = decoded.userId;
  
  }


  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="bg-black w-screen h-10 flex justify-between shadow-xl sticky top-0 z-50 uppercase overflow-hidden">
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/b/b8/BHEL_logo.svg"
        className="ml-8 cursor-pointer scale-75 animate-bounce rounded-full"
        alt="scene"
      />
      <h1 className="text-black font-bold ml-48 uppercase mt-2 bg-white rounded-sm px-3 mb-2">
         Breakdown Tracker
      </h1>
      <div className="flex flex-row text-white list-none justify-end scale-75 ">
        {/* Hamburger menu icon */}
        <div className="md:hidden" onClick={toggleMenu}>
          <svg
            className="fill-current h-6 w-6 cursor-pointer"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Menu</title>
            {isOpen ? (
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 6h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 6h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2z"
              />
            ) : (
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0 3a1 1 0 011-1h18a1 1 0 110 2H1a1 1 0 01-1-1zM1 9a1 1 0 011-1h18a1 1 0 110 2H2a1 1 0 01-1-1zM1 15a1 1 0 011-1h18a1 1 0 110 2H2a1 1 0 01-1-1z"
              />
            )}
          </svg>
        </div>

        {/* Navigation links */}
        <div
          className={`${
            isOpen ? "block" : "hidden"
          } flex-grow md:flex md:items-center md:w-auto`}
        >
          <Link
            to="/home"
            className="bg-white w-18 h-6 mx-10 px-2 rounded text-black font-bold mt-2"
          >
            User: {user}
          </Link>
          <Link
            to="/logout"
            className=" bg-white w-18 h-6 mx-5 px-2 rounded text-black font-bold mt-2"
          >
            Logout
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
