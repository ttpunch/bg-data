import React, { useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";

const Login = () => {
  const [loginError, setLoginError] = useState("");
  const [isloading, setisloading] = useState(false);

  const [login, setLogin] = useState({
    username: "",
    password: "",
  });

  const handleLogin = (e) => {
    setLogin({ ...login, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setisloading(true);

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/login`,
        login
      );
      setisloading(false);

      console.log(response.data);
      // Save token to localStorage and redirect to home page
      localStorage.setItem("token", response.data.token);
      window.location.href = "/machinedata";
    } catch (error) {
      console.error(error);
      setisloading(false);
      setLoginError(error.response?.data?.message || "Login failed");
    }
  }

  return (
    <div className="flex justify-center items-center w-full min-h-screen bg-muted/20">
      <Card className="w-full max-w-sm shadow-lg mx-4">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Login</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access the breakdown tracker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="username" className="text-sm font-medium leading-none">Username</label>
              <Input
                id="username"
                type="text"
                name="username"
                value={login.username}
                onChange={handleLogin}
                placeholder="Enter username"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium leading-none">Password</label>
              <Input
                id="password"
                type="password"
                name="password"
                value={login.password}
                onChange={handleLogin}
                placeholder="Enter password"
                required
              />
            </div>
            {loginError && (
              <div className="text-destructive text-sm text-center font-medium">{loginError}</div>
            )}
            <Button className="w-full" type="submit" disabled={isloading}>
              {isloading && (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {isloading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
