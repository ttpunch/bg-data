import React from "react";
import {Link} from 'react-router-dom'



const Navbar = () => {
  return (
    <div className="bg-black w-screen h-10 flex justify-between shadow-xl sticky top-0 z-50 uppercase overflow-hidden">
      <img src= "https://upload.wikimedia.org/wikipedia/commons/b/b8/BHEL_logo.svg" className=" ml-8 cursor-pointer scale-75 animate-bounce rounded-full" />
      <h1 className="text-black font-bold  ml-48 uppercase mt-2 bg-white rounded-sm px-3 mb-2"> Breakdown Reporting System </h1>
      <div className="flex flex-row text-white list-none  justify-end scale-75 ">
        <Link to="/home" className=" bg-white w-18 h-6 mx-10 px-2 rounded text-black font-bold mt-2">Home</Link>
        <Link to="/" className=" bg-white w-18 h-6 mx-5 px-2 rounded text-black font-bold mt-2">Logout</Link>
      </div>
    </div>
  );
};

export default Navbar;
