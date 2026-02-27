import { useEffect } from 'react';
import Login from './Login';

const Logout = () => {

  useEffect(() => {
    localStorage.removeItem('token');

  });
  return (
    <>
      <Login />
    </>
  )
}
export default Logout;
