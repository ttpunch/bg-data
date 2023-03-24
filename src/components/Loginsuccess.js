import { useEffect, useState } from "react";
import jwt_decode from "jwt-decode";
import App from "../App";
import Login from "./Login";

function LoginSuccess() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if the user has a valid JWT token
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwt_decode(token);
        // If the token is valid, set isLoggedIn to true
        setIsLoggedIn(true);
      } catch (error) {
        // If the token is invalid, remove it from local storage
        localStorage.removeItem("token");
      }
    }
  }, []);

  return (
    <div>
      {isLoggedIn ? (
        <App/>
      ) : (
        <Login/>
      )}
    </div>
  );
}

export default LoginSuccess;
