import axios from "axios";
import React, { useState } from "react";

const EditDataRow = ({ idData }) => {
  const [saveData, setBreakdown] = useState({
    breakdown: "",
  });

  const handleBgClick = (e) => {
    setBreakdown({ ...saveData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (data) => {
    
    axios.put(`https://data-api-d6lk.onrender.com/editdata/${data}`, saveData).then(()=>alert("Data Edited"));
  };

  return (
    <div>
      <form  onSubmit={handleSubmit(idData)}>
          <textarea
          className="border  border-slate-800 w-auto resize p-1"
          name="breakdown"
          type="text"
          value={saveData.breakdown}
          onChange={handleBgClick}
        />
        <button
          className="bg-slate-400 ml-10 mt-2 mb-2 rounded-lg p-1"
          type="submit"
        >
          save
        </button>
       
      </form>
    </div>
  );
};

export default EditDataRow;

//axios put?
