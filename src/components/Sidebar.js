import React from 'react'
import {Link} from 'react-router-dom'

const Sidebar = () => {
  return (
    <aside className="bg-blue-300 w-48 h-screen flex sticky top-0">
        <div className="flex flex-col mx-5">
          <Link to="machinedata" className="bg-white rounded px-2 my-2 cursor-pointer shadow-xl  hover:bg-slate-300 hover:scale-105  active:bg-zinc-400">
            Breakdown Data
          </Link>
          <Link to="recorddata"className="bg-white rounded px-2  my-2 cursor-pointer shadow-xl hover:bg-slate-300 hover:scale-105 active:bg-zinc-400">
            Record Data
          </Link>
          <Link to="editdata" className="bg-white rounded px-2  my-2 cursor-pointer shadow-xl hover:bg-slate-300 hover:scale-105 active:bg-zinc-400">
            Edit Data
          </Link>
          <Link to="machineroute" className="bg-white rounded px-2  my-2 cursor-pointer shadow-xl hover:bg-slate-300 hover:scale-105 active:bg-zinc-400">
            Machine Data
          </Link>
          <Link to="search" className="bg-white rounded px-2  my-2 cursor-pointer shadow-xl hover:bg-slate-300 hover:scale-105 active:bg-zinc-400">
            Keyword Search
          </Link>
        </div>
      </aside>
  )
}

export default Sidebar