import axios from "axios";
import React, { useState } from "react";
import DataSaved from "./DataSaved";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { toast } from "sonner";

const RecordData = () => {
  const [recorded, setrecorded] = useState(false);
  const [file, setFile] = useState(null);
  const [pushData, setPushData] = useState({
    mcdata: "",
    bgdetail: "",
    bgdate: "",
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
    const promise = new Promise(async (resolve, reject) => {
      try {
        let imageLink = null;
        if (file) {
          const formData = new FormData();
          formData.append("image", file);
          const imgResponse = await axios.post(`${process.env.REACT_APP_API_URL}/image`, formData);
          imageLink = imgResponse.data.link;
        }

        const currentData = { ...pushData, ...(imageLink && { image: imageLink }) };
        setPushData(currentData);

        await axios.post(`${process.env.REACT_APP_API_URL}/submit-form`, currentData);
        setPushData({
          mcdata: "",
          bgdetail: "",
          bgdate: "",
        });
        setFile(null);
        setrecorded(true);
        resolve(file ? "Data entered with image" : "Data entered without image");
      } catch (error) {
        console.error("Error submitting form: ", error);
        reject(error);
      }
    });

    toast.promise(promise, {
      loading: 'Submitting breakdown report...',
      success: (data) => `${data}`,
      error: 'Error submitting report',
    });
  };

  return (
    <div className="flex justify-center mt-10 w-full px-4 mb-10">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Record Breakdown</CardTitle>
          <CardDescription>
            Enter the details of the machine breakdown below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-6">
            <div className="grid gap-2">
              <label htmlFor="mcdata" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Machine No
              </label>
              <Input
                id="mcdata"
                name="mcdata"
                placeholder="Enter M/c No.."
                value={pushData.mcdata}
                onChange={handleInput}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="bgdetail" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Breakdown Detail
              </label>
              <Textarea
                id="bgdetail"
                name="bgdetail"
                placeholder="Describe the issue..."
                rows="4"
                value={pushData.bgdetail}
                onChange={handleInput}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="bgdate" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Breakdown Date
              </label>
              <Input
                id="bgdate"
                type="date"
                name="bgdate"
                value={pushData.bgdate}
                onChange={handleInput}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="image" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Upload Image (Optional)
              </label>
              <Input
                id="image"
                name="image"
                type="file"
                className="cursor-pointer"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex gap-4 justify-end mt-2">
              <Button type="button" variant="ghost" onClick={() => setrecorded(false)}>
                Reset
              </Button>
              <Button type="submit">
                Submit Report
              </Button>
            </div>
          </form>
          <div className="mt-4">
            {recorded === true && <DataSaved />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecordData;
