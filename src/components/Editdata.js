import React, { useState } from "react";
import EditMachineWiseData from "./EditMachieWiseData";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";

const Editdata = () => {
  const [data, setData] = useState([]);
  const [finalData, setFinalData] = useState("")
  const [active, setActive] = useState(false);

  const handleIsubmit = (e) => {
    setData(e.target.value)

  };

  const handleSubmit = (e) => {
    e.preventDefault()
    setActive(true)
    setFinalData(data)

  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Data</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-4 items-end" >
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <label htmlFor="machineNo" className="text-sm font-medium">Enter Machine No to Edit Data</label>
              <Input
                type="text"
                id="machineNo"
                value={data}
                onChange={handleIsubmit}
                placeholder="Machine No..."
              />
            </div>
            <Button type="submit">Submit</Button>
          </form>
        </CardContent>
      </Card>

      <div>
        {active === true && <EditMachineWiseData machine_no={finalData} />}
      </div>
    </div>
  );
};

export default Editdata;
