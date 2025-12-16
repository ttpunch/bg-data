
import { useState } from 'react';
import Modal from 'react-modal';
import axios from 'axios';



const customStyles = {
  content: {
    width: '500px',
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
  },
};

const SaveEditDataModal = ({ machine_id }) => {
  const [updating, setupdating] = useState(false)
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');


  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  const openModal = () => {
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleOk = async (e) => {
    e.preventDefault();
    setupdating(true)

    await axios.put(`${process.env.REACT_APP_API_URL}/api/editdata/${machine_id}`, { breakdown: inputValue })
      .then(response => {

        alert('Data updated successfully!');
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => {
        setupdating(false);
      });

    closeModal();
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <div >
      <button className="bg-red-200 rounded-sm px-2" onClick={openModal}>Edit</button>
      <Modal
        isOpen={isOpen}
        onRequestClose={closeModal}
        contentClassName="custom-modal"
        style={customStyles}
      >
        <form onSubmit={handleOk}>
          <label className='block' >
            Enter Data:
          </label>
          <textarea className="border-2 resize p-2 w-full" type="text" value={inputValue} onChange={handleInputChange} required />
          <div className="modal-footer">
            <button className="bg-red-400 rounded-lg px-2" type="button" onClick={handleCancel}>Cancel</button>
            <button className="bg-teal-200 rounded-lg px-2 ml-4 " type="submit">OK</button>
          </div>
        </form>
      </Modal>
      {updating && <h1 className="bg-slate-600">updating ...</h1>}
    </div>
  );
};

export default SaveEditDataModal;