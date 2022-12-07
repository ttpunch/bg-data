import React, { Fragment, useEffect } from "react";
import { useState } from "react";
import axios from "axios";
import ReadOnlyEditData from "./ReadOnlyEditData";
import EditDataRow from "./EditDataRow";


const Editdata = () => {
 
 
  const [mongodata, getData] = useState([]);
  const [editenable,setEditEnable]=useState('')

 const handleEditableClick=(e,data)=>{
  e.preventDefault();  
  setEditEnable(data._id)
  console.log(data._id)

 }

  useEffect(() => {
    axios.get("https://data-api-d6lk.onrender.com/machinedata").then((res) => {
      getData(res.data);
      console.log(res.data)
    });
  }, []);



  return (
   
    <div className="mt-2 ml-64 mr-60  ">    
        <table className="table-auto  text-left">
          <thead className="border text-sm bg-white whitespace-nowrap  border-collapse uppercase">
            <tr>
              <th className="border border-slate-400 border-collapse px-4 py-2 break-normal text-center">Machine No</th>
              <th className="border border-slate-400 border-collapse px-4 py-2 break-normal text-center" >Breakdown Detail</th>
              <th className="border border-slate-400 border-collapse px-4 py-2 break-normal text-center ">Date</th>
              <th className="border border-slate-400   border-collapse px-4 py-2 break-normal text-center">Edit</th>
              
            </tr>
          </thead>
      <tbody>
        {mongodata.map((res) => (     
               <Fragment>  
                 {editenable===res._id ? <EditDataRow  data={res} idData={res._id}  /> : <ReadOnlyEditData  editData={handleEditableClick} data={res}/>}
               </Fragment> 
            
        ))}
        
      </tbody>
    </table>
  </div>
    
        
  );
};

export default Editdata;

