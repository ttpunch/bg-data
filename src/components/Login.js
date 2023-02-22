import React, { useState } from "react";
import App from "../App";
import image from "../asset/unsplash.jpg";
import Logout from "./Logout";

const Login = () => {
  const [isLoggedin, setisLoddedin] = useState();
  const [login, setLogin] = useState({
    username: "",
    password: "",
  });

  const [loginpass, setLoginpass] = useState({
    username: "",
    password: "",
  });

  const handleLogin = (e) => {
    setLogin({ ...login, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoginpass({ ...login });
    sessionStorage.setItem("islogin", true);
    // setTimeout(()=>{
    //   localStorage.clear()
    // },5000)
  };

  if (
    (loginpass.username === "vinod" && login.password === "kumar") ||
    sessionStorage.getItem("islogin")
  ) {
    return <App />;
  } else
    return (
      <div className="bg-[#d8cdc7] flex justify-center items-center w-screen h-screen">
      <div className="bg-white h-4/5 w-full sm:w-1/2 rounded-md flex shadow-xl overflow-hidden justify-center">
        <div className="bg-green-200 w-1/2 h-full rounded-l-md hidden sm:block">
          <img className="h-full rounded-l-md" src={image} alt="image" />
        </div>
        <div className="bg-[#fb7660] w-1/2 h-full flex flex-col justify-center rounded-r-md p-4 sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col items-center">
        <h1 className="font-bold text-lg mb-8 text-[#174660] text-center">Login</h1>
        <input
          className="rounded-md shadow-md text-xs p-1 mb-4"
          type="text"
          name="username"
          value={login.username}
          onChange={handleLogin}
          placeholder="Username.."
          required
        />
        <input
          className="rounded-md shadow-md text-xs p-1 mb-4"
          type="password"
          name="password"
          value={login.password}
          onChange={handleLogin}
          placeholder="Password.."
          required
        />
        <button className="bg-[#174660] px-4 py-1 text-white rounded-xl mt-5 focus shadow-md cursor-pointer" type="submit">
          Login
        </button>
      </form>
        </div>
      </div>
    </div>
    )    
};

export default Login;
