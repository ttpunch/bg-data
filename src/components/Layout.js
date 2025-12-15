import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import Contact from "./Contact";
import RecordData from "./RecordData";
import Editdata from "./Editdata";
import TotalData from "./TotalData";
import Searchmachine from "./Searchmachine";
import Home from "./Home";
import Logout from "./Logout";
import Login from "./Login";
import SearchData from "./SearchData";


const Layout = () => {
  const location = useLocation();
  const isLogoutPage = location.pathname === "/logout";
  if (isLogoutPage) {
    localStorage.removeItem('token');
  }
  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      {isLogoutPage ? (
        <Login />
      ) : (
        <div className="flex flex-col h-screen overflow-hidden">
          <Navbar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 p-4 md:p-6 overflow-y-auto">
              <Routes>
                <Route path="/machinedata" element={<TotalData />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/recorddata" element={<RecordData />} />
                <Route path="/editdata" element={<Editdata />} />
                <Route path="/machineroute" element={<Searchmachine />} />
                <Route path="/" element={<Home />} />
                <Route path='/logout' element={<Logout />} />
                <Route path='/search' element={<SearchData />} />
              </Routes>
            </main>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
