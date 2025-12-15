import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const SearchData = () => {
  const [mongodata, getData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/search/search?search=${searchTerm}`
      );
      getData(response.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm === "") {
      toast.error("Please enter a search term");
    }
    else {
      fetchData();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 mt-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Search Data</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex w-full items-center space-x-2">
            <Input
              type="text"
              placeholder="Search by description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : mongodata.length > 0 ? (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine No</TableHead>
                <TableHead>Breakdown Detail</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mongodata.map((res, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{res.machine_no}</TableCell>
                  <TableCell>{res.breakdown}</TableCell>
                  <TableCell>
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
        !initialLoad && (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-muted/20 rounded-lg">
            <p>No matching data found.</p>
          </div>
        )
      )}
    </div>
  );
};

export default SearchData;
