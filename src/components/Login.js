import React, { useState } from "react";
import image from "../asset/unsplash.jpg";
import axios from "axios";

const Login = () => {
   const [loginError, setLoginError] = useState("");
   const [isloading,setisloading]=useState(false)

   const [login, setLogin] = useState({
    username: "",
    password: "",
  });

  const handleLogin = (e) => {
    setLogin({ ...login, [e.target.name]: e.target.value });
  };

 const handleSubmit = async(e) => {
  e.preventDefault();
  setisloading(true)

   try {
    const response = await axios.post("https://data-api-d6lk.onrender.com/login",login);
    setisloading(false)

    console.log(response.data);
    // Save token to localStorage and redirect to home page
    localStorage.setItem("token", response.data.token);
    window.location.href = "/";
  } catch (error) {
    console.error(error);
    setLoginError(error.response.data.message);
  }
}
    return (
      <div className="bg-[#d8cdc7] flex justify-center items-center w-screen h-screen">
      <div className="bg-white h-4/5 w-full sm:w-1/2 rounded-md flex shadow-xl overflow-hidden justify-center">
        <div className="bg-green-200 w-1/2 h-full rounded-l-md hidden sm:block">
          <img className="h-full rounded-l-md" src={image} alt={"img"}/>
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
        {(isloading && !loginError) && (<div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-secondary align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] mt-4"></div>)}
        {loginError && (
          <div className="text-red-500 text-sm mt-2">{loginError}</div>
        )}
      </form>
        </div>
      </div>
    </div>
    )    
};

export default Login;
