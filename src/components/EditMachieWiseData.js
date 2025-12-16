import React, { useEffect, useState } from "react";
import axios from "axios";
import SaveEditDataModal from "./SaveEditDataModal";
import DeleteModal from "./DeleteModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const EditMachineWiseData = ({ machine_no }) => {
  const [mongodata, getData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/machineroute/${machine_no}`);
        getData(response.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, [machine_no]);

  return (
    <div className="w-full max-w-5xl mx-auto mt-10 px-4">
      {mongodata.length > 0 ? (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">S/No</TableHead>
                <TableHead>Machine No</TableHead>
                <TableHead>Breakdown Detail</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Edit Data</TableHead>
                <TableHead>Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mongodata.map((res, index) => (
                <TableRow key={res._id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="font-medium">{res.machine_no}</TableCell>
                  <TableCell>{res.breakdown}</TableCell>
                  <TableCell className="min-w-[120px]">
                    {new Date(res.bgdate).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <SaveEditDataModal machine_id={res._id} />
                  </TableCell>
                  <TableCell>
                    <DeleteModal machine_id={res._id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-muted/20 rounded-lg">
          <p>No data found for this machine.</p>
        </div>
      )}
    </div>
  );
};

export default EditMachineWiseData;
