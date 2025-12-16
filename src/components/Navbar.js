import React, { useState } from "react";
import { Link } from "react-router-dom";
import jwt_decode from "jwt-decode";
import { Menu, User, LogOut, X, FileSpreadsheet, LayoutDashboard, Database, Edit, HardDrive, Search } from "lucide-react";
import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";
import axios from "axios";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "../lib/utils";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const token = localStorage.getItem("token");
  let user = null;

  const links = [
    { name: "Breakdown Data", path: "/machinedata", icon: LayoutDashboard },
    { name: "Record Data", path: "/recorddata", icon: Database },
    { name: "Edit Data", path: "/editdata", icon: Edit },
    { name: "Machine Data", path: "/machineroute", icon: HardDrive },
    { name: "Keyword Search", path: "/search", icon: Search },
  ];

  if (token) {
    try {
      const decoded = jwt_decode(token);
      user = decoded.userId;
    } catch (e) {
      console.error("Invalid token");
    }
  }

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleExport = async () => {
    const promise = new Promise(async (resolve, reject) => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/machinedata`);
        const workSheet = XLSX.utils.json_to_sheet(res.data);
        const workBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workBook, workSheet, "Breakdown Data");
        XLSX.writeFile(workBook, "Breakdown_Data.xlsx");
        resolve("Data exported successfully");
      } catch (error) {
        console.error("Export failed:", error);
        reject("Failed to export data");
      }
    });

    toast.promise(promise, {
      loading: 'Generating Excel Report...',
      success: (data) => `${data}`,
      error: 'Error exporting data',
    });
  };

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="flex h-16 items-center px-4 md:px-6">
        <div className="flex items-center gap-2">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/b/b8/BHEL_logo.svg"
            className="h-8 w-8 rounded-full"
            alt="Logo"
          />
          <h1 className="text-xl font-bold tracking-tight">
            Breakdown Tracker
          </h1>
        </div>

        <div className="ml-auto flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4" />
                <span>User: {user}</span>
              </div>
            )}
            <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden lg:inline">Export Report</span>
            </Button>
            <ModeToggle />
            <Link to="/logout">
              <Button variant="ghost" size="sm">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </Link>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="icon" onClick={toggleMenu}>
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="absolute top-16 left-0 w-full z-50 border-b p-4 space-y-2 bg-background shadow-lg md:hidden">
          {user && (
            <div className="flex items-center gap-2 text-sm font-medium mb-4 p-2">
              <User className="h-4 w-4" />
              <span>{user}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 mb-4">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = window.location.pathname.includes(link.path);
              return (
                <Link key={link.path} to={link.path} onClick={() => setIsOpen(false)}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn("w-full justify-start", isActive && "bg-secondary")}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {link.name}
                  </Button>
                </Link>
              )
            })}
          </div>
          <Button onClick={handleExport} variant="ghost" size="sm" className="w-full justify-start">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Link to="/logout" onClick={() => setIsOpen(false)} className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
