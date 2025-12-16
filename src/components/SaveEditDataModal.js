
import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Textarea } from './ui/textarea';


const SaveEditDataModal = ({ machine_id, initialData }) => {
  const [updating, setupdating] = useState(false)
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(initialData || '');

  useEffect(() => {
    if (isOpen) {
      setInputValue(initialData || '');
    }
  }, [isOpen, initialData]);


  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  const handleOk = async (e) => {
    e.preventDefault();
    setupdating(true)

    await axios.put(`${process.env.REACT_APP_API_URL}/api/editdata/${machine_id}`, { breakdown: inputValue })
      .then(response => {

        alert('Data updated successfully!');
        setIsOpen(false);
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => {
        setupdating(false);
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleOk}>
          <DialogHeader>
            <DialogTitle>Edit Breakdown Data</DialogTitle>
            <DialogDescription>
              Make changes to the breakdown details below. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="breakdown" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Breakdown Detail
              </label>
              <Textarea
                id="breakdown"
                value={inputValue}
                onChange={handleInputChange}
                className="col-span-3 min-h-[100px]"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updating}>
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SaveEditDataModal;
