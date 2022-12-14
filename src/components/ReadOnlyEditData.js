import React from "react";

const ReadOnlyEditData = ({ data, editData,deleteData }) => {
  return (
    <>
      <tr className="border text-xs whitespace-wrap border-slate-600 border-collapse break-normal">
        <td className="border border-slate-400 border-collapse px-4 py-2 whitespace-wrap  ">
          {data.machine_no}
        </td>
        <td className="border border-slate-400 border-collapse px-4 py-2  whitespace-wrap  text-justify">
          {data.breakdown}
        </td>
        <td className="border border-slate-400 border-collapse px-4 py-2 whitespace-wrap  ">
          {new Date(data.bgdate).toLocaleString("en-IN", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
          })}
        </td>
        <td>
          <button
            onClick={(e) => {
              editData(e, data);
            }}
            className="bg-slate-400  px-2 py-1 rounded cursor-pointer"
          >
            Edit
          </button>
        </td>
        <td>
          <button
            onClick={(e) => {
              deleteData(e, data);
            }}
            className="bg-slate-400  px-2 py-1 rounded cursor-pointer"
          >
            Delete
          </button>
        </td>
      </tr>
    </>
  );
};

export default ReadOnlyEditData;
