import React from "react";
import MachinewiseData from "./MachinewiseData";
import { useState } from "react";


const Searchmachine = () => {
  const [data, setData] = useState([]);
  const[finalData,setFinalData]=useState("")
  const [active, setActive] = useState(false);

  const handleIsubmit = (e) => {
     setData(e.target.value)
     console.log(e.target.value)
  };

 const handleSubmit=(e)=>{
  e.preventDefault()
  setActive(true)
  setFinalData(data)

 }

  return (
    <div >
      <div className="bg-blue-300  h-100 ml-60 mt-10 flex  flex-row rounded-lg shadow-xl p-2">
        <form onSubmit={handleSubmit} >
          <lable className="font-bold"> Enter Machine No..</lable>
          <input className=" rounded-xl ml-4 px-2  text-black " type="text"  value={data} onChange={handleIsubmit} />
          <button className="bg-[#ffffff] rounded-xl px-2 py-1 mx-5 shadow-lg focus:ring-2 transform active:scale-95 transition-transform"type="submit">Submit</button>
     
        </form>
      </div>
       <div>
        {active === true && <MachinewiseData number={finalData} />}
      </div> 
    </div>
  );
};

export default Searchmachine;
