import axios from "axios";
import React from "react";
import { useState } from "react";
import DataSaved from "./DataSaved";

const RecordData = () => {
  const [recorded, setrecorded] = useState(false);
  const [file, setFile] = useState(null);
  const [pushData, setPushData] = useState({
    mcdata: "",
    bgdetail: "",
    bgdate: "",
    image: "",
  });

  const handleInput = (e) => {
    const newData = { ...pushData, [e.target.name]: e.target.value };
    setPushData(newData);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    

    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await axios.post("https://data-api-d6lk.onrender.com/image", formData);
      
      console.log(response.data);
      console.log(pushData)

      if(response){
        setPushData({ ...pushData, image: response.data.link });
        await axios.post("https://data-api-d6lk.onrender.com/submit-form", pushData)
      .then(() => alert("data Entered"));
      }
    } catch (error) {
      console.error("Error uploading image: ", error);
      // Handle error, show message, etc.
    }
      setrecorded(true);
      setFile(null);
  };

  return (
    <div className="flex flex-col p-2 mt-10 bg-blue-300 rounded-lg shadow-xl w-72 h-100 ml-96 justify-evenly">
      <form
        className="flex flex-col justify-center main"
        onSubmit={handleSubmit}
      >
        <label>
          
          <b>Machine No.</b> </label>
        <input
          className="px-2 py-1 mb-3 text-sm border rounded-md border-stone-500 w-60"
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
          className="px-2 py-1 mb-3 text-sm border rounded-sm border-stone-500 w-60"
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

        <div className="flex mt-3 justify-evenly ">
          <button
            className="px-2 text-white rounded bg-slate-500"
            onClick={handleSubmit}
          >
            Submit
          </button>
          <button
            className="px-2 text-white rounded bg-slate-500"
            type="reset"
            onClick={() => setrecorded(false)}
          >
            Reset
          </button>
        </div>

        <div>{recorded === true && <DataSaved />}</div>

        <div className="flex flex-col mx-auto mt-3 mb-3">
          <input type="file" onChange={handleFileChange} />
        </div>
      </form>
    </div>
  );
};

export default RecordData;
