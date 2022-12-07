import React from 'react'
import {useState} from 'react'
import DataSaved from './DataSaved'



const RecordData = () => {

const[recorded,setrecorded]=useState(false)

const handleSubmit=(e)=>{
  // e.preventDefault()
  setrecorded(true)
}

  return (
   
   <div className="bg-blue-300 w-72 h-100 ml-96 mt-10 flex justify-evenly rounded-lg shadow-xl p-2">
    <form className="main flex flex-col justify-center" action="/submit-form" method="POST"  >
      <label> <b>Machine No.</b> </label>
      <input  className=" border border-stone-500 mb-3  w-60 rounded-md text-sm"   type="text" placeholder="Enter M/c No.." name='mcdata'  required/>
      <label> <b> Breakdown Detail </b> </label>
      <textarea className="border border-stone-500 mb-3 w-60 rounded-sm text-sm" placeholder="Enter Detail.." rows="6" cols="20" name="bgdetail" required></textarea>
      <label> <b> Breakdown Date </b> </label>
      <input   type="date" name="bgdate" required/>
      <div className="flex justify-evenly mt-3 ">
        <button className="bg-slate-500 px-2 rounded text-white"  onClick={handleSubmit} > Submit </button>
        <button className="bg-slate-500 px-2 rounded text-white" type="reset" onClick={()=>setrecorded(false)}> Reset</button>
      </div>
           
      <div>
          
          {recorded===true&&<DataSaved/>}

      </div>
     
    </form>
    </div>



  
  )
}

export default RecordData