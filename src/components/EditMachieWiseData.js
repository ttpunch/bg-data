import React, { useEffect } from "react";
import { useState} from "react"
import axios from "axios";
import SaveEditDataModal from "./SaveEditDataModal";
import DeleteModal from "./DeleteModal";


const EditMachineWiseData = ({machine_no}) => {
 const [mongodata, getData] = useState([]);

    const fetchData=async()=>{
    const response= await axios.get(`https://data-api-d6lk.onrender.com/machineroute/${machine_no}`)
    getData(response.data)
    console.log(mongodata);
    }

    useEffect (()=>{
      fetchData();
    },[`${machine_no}`])
        
  
 
  return (
    
    <div className="ml-96  absolute mt-10 mr-64">
      <table className="table-auto text-left  p-10">
        <thead className="border  bg-white text-wrap border-collapse text-xs uppercase">
          <tr>
            <th className="border border-slate-400 px-4 py-2  ">
              Machine No
            </th>
            <th className="border border-slate-400  px-4 py-2">
              Breakdown Detail
            </th>
            <th className="border border-slate-400  px-4 py-2">
              Date
            </th>
            <th className="border border-slate-400  px-4 py-2">
              Edit Data
            </th>
            <th className="border border-slate-400  px-4 py-2">
              Delete
            </th>
           
          </tr>
        </thead>

        <tbody className="shadow-xl bg-slate-200 ">
          {mongodata.map((res) => (
            <tr className="border text-xs  border-slate-600 border-collapse ">
              <td key="{res.machine_no}"className="border border-slate-800 border-collapse  border-opacity-25 px-4 py-1 whitespace-wrap">
                {res.machine_no}
              </td>
              <td key="{res.breakdown}"className="border border-slate-800 border-collapse  border-opacity-25 px-4 py-1 whitespace-wrap">
                {res.breakdown}
              </td>
              <td key="{res.bgdate}"className="border border-slate-800 border-collapse  border-opacity-25 px-4 py-1 whitespace-wrap">
                {(new Date(res.bgdate)).toLocaleString('en-IN',{year: 'numeric', month: 'numeric', day: 'numeric'})}
              </td>
              <td key="{res.bgdate}"className="border border-slate-800 border-collapse  border-opacity-25 px-4 py-1 whitespace-wrap">
                <SaveEditDataModal machine_id={res._id} />
              </td>
              <td key="{res.bgdate}"className="border border-slate-800 border-collapse  border-opacity-25 px-4 py-1 whitespace-wrap">
                <DeleteModal machine_id={res._id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EditMachineWiseData;
