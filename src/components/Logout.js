import React from 'react'


const Logout = () => {

const handleLogout=()=>{
  window.render('/');
}

 
return (
    <div>
        <button onClick={handleLogout}>Logout</button>
    </div>
  )
}

export default Logout