
import { useState } from 'react';
import Modal from 'react-modal';
import axios from 'axios';



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

const DeleteModal = ({machine_id}) => {
  const [isOpen, setIsOpen] = useState(false);


  
  const openModal = () => {
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleOk = async() => {

   await axios.delete(`${process.env.REACT_APP_API_URL}/editdata/${machine_id}`)
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
      <button className="bg-red-200 rounded-sm px-2"onClick={openModal}>Delete</button>
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
          <div className="modal-footer mt-4">
            <button className="bg-red-400 rounded-lg px-2"type="button" onClick={handleCancel}>Cancel</button>
            <button className="bg-teal-200 rounded-lg px-2 ml-4 "type="submit">Are you sure !!</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DeleteModal;