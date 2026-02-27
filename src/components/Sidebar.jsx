import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Database, Edit, HardDrive, Search, Settings } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"

const Sidebar = () => {
  const location = useLocation();

  const links = [
    { name: "Breakdown Data", path: "/machinedata", icon: LayoutDashboard },
    { name: "Record Data", path: "/recorddata", icon: Database },
    { name: "Edit Data", path: "/editdata", icon: Edit },
    { name: "Machine Data", path: "/machineroute", icon: HardDrive },
    { name: "Machine Details", path: "/machine-details", icon: Settings },
    { name: "Keyword Search", path: "/search", icon: Search },
  ];

  return (
    <aside className="w-64 border-r bg-muted/40 h-full hidden md:block">
      <div className="flex flex-col gap-2 p-4">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname.includes(link.path);

          return (
            <Link key={link.path} to={link.path}>
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
    </aside>
  )
}

export default Sidebar