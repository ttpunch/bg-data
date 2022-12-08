import React, { useEffect } from "react";
import { useState } from "react";
import axios from "axios";

const TotalData = () => {
  const [mongodata, getData] = useState([]);

  useEffect(() => {
    const url="https://data-api-d6lk.onrender.com/"
     axios.get(url+"/machinedata").then((res) => {
      getData(res.data);
    });
  }, );
  return (
   
    <div className="mt-2 ml-64 mr-60 ">    
        <table className="table-auto text-left shadow-xl bg-blue-100 border-opacity-75">
          <thead className="border  bg-white whitespace-nowrap  border-collapse text-xs uppercase ">
            <tr>
              <th className="border border-slate-600 border-collapse border-opacity-75 px-4 py-2 text-center">Machine No</th>
              <th className="border border-slate-600 border-collapse border-opacity-75  px-4 py-2 text-center " >Breakdown Detail</th>
              <th className="border border-slate-600 border-collapse  border-opacity-75 px-4 py-2 text-center">Date</th>
            </tr>
          </thead>
      <tbody>
        {mongodata.map((res) => (       
              <tr className="border text-xs  border-slate-600 border-collapse ">
              <td key="{res.machine_no}}"className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1">{res.machine_no}</td>
              <td  key="{res.breakdown}" className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1 text-justify">{res.breakdown}</td>
              <td  key="{res.bgdate}" className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1">{(new Date(res.bgdate)).toLocaleString('en-IN',{year: 'numeric', month: 'numeric', day: 'numeric'})}</td>
              
            </tr>
            ))}
      </tbody>
    </table>
  </div>
    
        
  );
};

export default TotalData;



