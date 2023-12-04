import React, { useState, useEffect } from "react";
import axios from "axios";

const SearchData = ({ number }) => {
  const [mongodata, getData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `http://localhost:5500/search/search?search=${searchTerm}`
      );
      getData(response.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const handleSearch = () => {
    if(searchTerm===""){
      alert('Please enter a search term')
    }
    else {
    fetchData();
    }
  };

  return (
    <div className="ml-56 absolute mt-10 mr-64">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by description"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="rounded-xl ml-4 px-4 py-2 border border-black"
        />
        <button
          onClick={handleSearch}
          className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-md"
        >
          Search
        </button>
      </div>

      {loading ? (
        <div className="ml-4">Loading...</div>
      ) : mongodata.length > 0 ? (
        <table className="table-auto text-left p-10 ml-4">
          {/* Rest of your table rendering code */}
          <thead className="border bg-white text-wrap border-collapse text-xs uppercase">
            <tr>
              <th className="border border-slate-400 px-4 py-2">Machine No</th>
              <th className="border border-slate-400 px-4 py-2">
                Breakdown Detail
              </th>
              <th className="border border-slate-400 px-4 py-2">Date</th>
            </tr>
          </thead>

          <tbody className="shadow-xl bg-slate-200">
            {mongodata.map((res, index) => (
              <tr
                key={index}
                className="border text-xs border-slate-600 border-collapse"
              >
                <td className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1 whitespace-wrap">
                  {res.machine_no}
                </td>
                <td className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1 whitespace-wrap">
                  {res.breakdown}
                </td>
                <td className="border border-slate-800 border-collapse border-opacity-25 px-4 py-1 whitespace-wrap">
                  {new Date(res.bgdate).toLocaleString("en-IN", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !initialLoad && (
          <div className="ml-4 text-red-400 flex gap-x-4 ">
            <p className="italic">No matching data found !! </p>
            <span className="animate-bounce">&#128527;</span>
          </div>
        )
      )}
    </div>
  );
};

export default SearchData;
