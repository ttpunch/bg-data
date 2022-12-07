import React from 'react'

const ReadOnlyEditData = ({data,editData}) => {

 
  return (
    <>
             <tr className="border text-xs whitespace-wrap border-slate-600 border-collapse break-normal">
                <td className="border border-slate-400 border-collapse px-4 py-2 whitespace-wrap  ">{data.machine_no}</td>
                <td className="border border-slate-400 border-collapse px-4 py-2  whitespace-wrap  text-justify">{data.breakdown}</td>
                <td className="border border-slate-400 border-collapse px-4 py-2 whitespace-wrap  ">{(new Date(data.bgdate)).toLocaleString('en-IN',{year: 'numeric', month: 'numeric', day: 'numeric'})}</td>
                <td><button onClick={(e)=>{
                  
                  editData(e,data)
                
                }}
                  
                className="bg-slate-400  px-2 py-1 rounded">Edit</button></td>
                
            </tr>
    </>
  )
}

export default ReadOnlyEditData