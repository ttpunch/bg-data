import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import Contact from "./Contact";
import RecordData from "./RecordData";
import Editdata from "./Editdata";
import TotalData from "./TotalData";
import Searchmachine from "./Searchmachine";
import Home from "./Home";



const Layout = () => {
  return (
    
        <div className="overflow-x-clip">
          
           <Navbar />
          
          <div className="flex flex-row ">
            <div className="fixed overflow-hidden">
            
            <Sidebar />
            
            </div>
            <div >
              <Routes>
                <Route path="/machinedata" element={<TotalData />} />
                <Route path="/contact" element={<Contact/>} />
                <Route path="/recorddata" element={<RecordData/>} />
                <Route path="/editdata" element={<Editdata/>} />
                <Route path="/machineroute" element={<Searchmachine/>}/>
                <Route path="/" element={<Home/>}/>
               
             
             
               </Routes>
            </div>
          </div>
        </div>
    
  );
};

export default Layout;
