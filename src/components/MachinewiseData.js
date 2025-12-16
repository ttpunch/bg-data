import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const MachinewiseData = ({ number }) => {
  const [mongodata, getData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/machineroute/${number}`);
        getData(response.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, [number]);

  return (
    <div className="w-full mt-4">
      {mongodata.length > 0 ? (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">S/No</TableHead>
                <TableHead>Machine No</TableHead>
                <TableHead>Breakdown Detail</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mongodata.map((res, index) => (
                <TableRow key={res._id || Math.random()}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="font-medium">{res.machine_no}</TableCell>
                  <TableCell>{res.breakdown}</TableCell>
                  <TableCell className="min-w-[120px]">
                    {new Date(res.bgdate).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex justify-center p-8 bg-muted/20 rounded-md">
          <p className="text-muted-foreground">No breakdown records found for this machine.</p>
        </div>
      )}
    </div>
  );
};

export default MachinewiseData;
