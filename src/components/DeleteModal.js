
import { useState } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { Button } from './ui/button';



const customStyles = {
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
  },
};

const DeleteModal = ({ machine_id }) => {
  const [isOpen, setIsOpen] = useState(false);



  const openModal = () => {
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleOk = async () => {

    await axios.delete(`${process.env.REACT_APP_API_URL}/api/editdata/${machine_id}`)
      .then(response => {

        alert('Data Deleted successfully!');
      })
      .catch(error => {
        console.error(error);
      });

    closeModal();
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <div >
      <Button variant="destructive" size="icon" className="h-8 w-8" onClick={openModal}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
      </Button>
      <Modal
        isOpen={isOpen}
        onRequestClose={closeModal}
        contentClassName="custom-modal"
        style={customStyles}
      >
        <form onSubmit={handleOk}>
          <label className='text-red-800 block' >
            Deleting Data..
          </label>
          <div className="modal-footer mt-4 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={handleCancel}>Cancel</Button>
            <Button variant="destructive" type="submit">Delete</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DeleteModal;