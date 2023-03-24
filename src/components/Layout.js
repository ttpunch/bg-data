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

const Layout = () => {
  const location = useLocation();
  const isLogoutPage = location.pathname === "/logout";
  if (isLogoutPage){
    localStorage.removeItem('token');
  }
      return  (
      <>
        {isLogoutPage ? (
          <Login />
        ) : (
          <div className="overflow-x-clip">
            <Navbar />
            <div className="flex flex-row ">
              <div className="fixed overflow-hidden">
                <Sidebar />
              </div>
              <div>
                <Routes>
                  <Route path="/machinedata" element={<TotalData />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/recorddata" element={<RecordData />} />
                  <Route path="/editdata" element={<Editdata />} />
                  <Route path="/machineroute" element={<Searchmachine />} />
                  <Route path="/" element={<Home />} />
                  <Route path='/logout' element={<Logout/>}/>
                </Routes>
              </div>
            </div>
          </div>
        )}
      </>
    );
};

export default Layout;
