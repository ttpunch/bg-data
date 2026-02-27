import React, { useState } from "react";
import MachinewiseData from "./MachinewiseData";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";

const Searchmachine = () => {
  const [data, setData] = useState("");
  const [finalData, setFinalData] = useState("");
  const [active, setActive] = useState(false);

  const handleInput = (e) => {
    setData(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (data.trim() !== "") {
      setActive(true);
      setFinalData(data);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 mt-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Check Machine Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
            <Input
              type="text"
              placeholder="Enter Machine No..."
              value={data}
              onChange={handleInput}
            />
            <Button type="submit">Submit</Button>
          </form>
        </CardContent>
      </Card>

      <div>
        {active && <MachinewiseData number={finalData} />}
      </div>
    </div>
  );
};

export default Searchmachine;
