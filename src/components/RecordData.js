import axios from "axios";
import React from "react";
import { useState } from "react";
import DataSaved from "./DataSaved";

const RecordData = () => {
  const [recorded, setrecorded] = useState(false);
  const [pushData, setPushData] = useState({
    mcdata: "",
    bgdetail: "",
    bgdate: "",
  });

  console.log(pushData);
  const handleInput = (e) => {
    const newData = { ...pushData, [e.target.name]: e.target.value };
    setPushData(newData);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setrecorded(true);
    axios.post("https://data-api-d6lk.onrender.com/submit-form",pushData).then(() => alert("data Entered"));
  };

  return (
    <div className="bg-blue-300 w-72 h-100 ml-96 mt-10 flex justify-evenly rounded-lg shadow-xl p-2">
      <form
        className="main flex flex-col justify-center"
        onSubmit={handleSubmit}
      >
        <label>
          {" "}
          <b>Machine No.</b>{" "}
        </label>
        <input
          className=" border border-stone-500 mb-3  w-60 rounded-md text-sm px-2 py-1"
          type="text"
          placeholder="Enter M/c No.."
          name="mcdata"
          value={pushData.mcdata}
          onChange={handleInput}
          required
        />
        <label>
          {" "}
          <b> Breakdown Detail </b>{" "}
        </label>
        <textarea
          className="border border-stone-500 mb-3 w-60 rounded-sm text-sm px-2 py-1"
          placeholder="Enter Detail.."
          rows="6"
          cols="20"
          name="bgdetail"
          value={pushData.bgdetail}
          onChange={handleInput}
          required
        ></textarea>
        <label>
          {" "}
          <b> Breakdown Date </b>{" "}
        </label>
        <input
          type="date"
          name="bgdate"
          value={pushData.bgdate}
          onChange={handleInput}
          required
        />
        <div className="flex justify-evenly mt-3 ">
          <button
            className="bg-slate-500 px-2 rounded text-white"
            onClick={handleSubmit}
          >
            {" "}
            Submit{" "}
          </button>
          <button
            className="bg-slate-500 px-2 rounded text-white"
            type="reset"
            onClick={() => setrecorded(false)}
          >
            {" "}
            Reset
          </button>
        </div>

        <div>{recorded === true && <DataSaved />}</div>
      </form>
    </div>
  );
};

export default RecordData;
