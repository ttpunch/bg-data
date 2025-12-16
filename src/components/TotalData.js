import { useState, useEffect } from "react";
import axios from "axios";
import { useTable, usePagination, useGlobalFilter } from "react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const columns = [
  {
    Header: "S/No",
    id: "serial",
    Cell: ({ row }) => {
      return <span>{parseInt(row.id) + 1}</span>;
    },
    width: 60, // Optional: specific width for S/No
  },
  {
    Header: "Machine No",
    accessor: "machine_no",
  },
  {
    Header: "Breakdown",
    accessor: "breakdown",
  },
  {
    Header: "Date",
    accessor: "bgdate",
    Cell: ({ value }) => {
      return (
        <div className="min-w-[120px]">
          {new Date(value).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      );
    },
  },
  {
    Header: "Image",
    accessor: "image",
    Cell: ({ value }) =>
      value ? (
        <a href={value} target="_blank" rel="noopener noreferrer">
          <img src={value} alt="Thumbnail" className="h-10 w-10 object-cover rounded-md border" />
        </a>
      ) : (
        <span className="text-muted-foreground text-xs">No Image</span>
      ),
  },
];

const TotalData = () => {
  const [mongodata, getData] = useState([]);
  const [isLoading, setisLoading] = useState(true);


  useEffect(() => {
    axios.get(`${process.env.REACT_APP_API_URL}/api/machinedata`).then((res) => {
      getData(res.data);
      setisLoading(false);
    });
  }, []);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    nextPage,
    previousPage,
    canPreviousPage,
    canNextPage,
    pageOptions,
    setPageSize,
    setGlobalFilter,
    state: { pageIndex, pageSize, globalFilter }
  } = useTable({
    columns,
    data: mongodata,
    initialState: { pageSize: 12 }
  },
    useGlobalFilter,
    usePagination);

  if (isLoading) {
    // ... loading state
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-muted-foreground">Loading Data...</span>
        </div>
      </div>
    );
  } else {
    return (
      <div className="w-full space-y-4">
        <div className="flex items-center py-4">
          <Input
            placeholder="Search all columns..."
            value={globalFilter || ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="rounded-md border bg-card">
          <Table {...getTableProps()}>
            <TableHeader>
              {headerGroups.map((hg) => (
                <TableRow {...hg.getHeaderGroupProps()}>
                  {hg.headers.map((header) => (
                    <TableHead {...header.getHeaderProps()}>
                      {header.render("Header")}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody {...getTableBodyProps()}>
              {page.map((row) => {
                prepareRow(row);
                return (
                  <TableRow {...row.getRowProps()}>
                    {row.cells.map((cell) => (
                      <TableCell {...cell.getCellProps()}>
                        {cell.render("Cell")}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="h-20"></div>
        <div className="fixed bottom-0 right-0 left-0 md:left-64 bg-background py-4 border-t z-20 flex items-center justify-between px-4 md:px-6 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex-1 text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageOptions.length}
          </div>
          <div className="flex items-center space-x-2">
            <select
              className="h-8 w-[70px] rounded-md border border-input bg-background text-foreground px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
              }}
            >
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => previousPage()}
              disabled={!canPreviousPage}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => nextPage()}
              disabled={!canNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }
};

export default TotalData;
