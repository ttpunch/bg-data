import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Search, Settings, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MachineDetailsList = () => {
    const [machines, setMachines] = useState([]);
    const [filteredMachines, setFilteredMachines] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMachines();
    }, []);

    useEffect(() => {
        if (searchTerm) {
            const filtered = machines.filter(
                (machine) =>
                    machine.machine_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    machine.machine_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    machine.location?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredMachines(filtered);
        } else {
            setFilteredMachines(machines);
        }
    }, [searchTerm, machines]);

    const fetchMachines = async () => {
        try {
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/machine-details`);
            setMachines(response.data);
            setFilteredMachines(response.data);
        } catch (error) {
            console.error("Error fetching machines:", error);
            toast.error("Failed to load machine details");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Machine Details</h1>
                    <p className="text-muted-foreground">
                        Manage machine specifications and technical details
                    </p>
                </div>
                <Link to="/machine-details/add">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Machine
                    </Button>
                </Link>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by machine no, name, or location..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Machine Cards Grid */}
            {filteredMachines.length === 0 ? (
                <Card className="p-8">
                    <div className="text-center text-muted-foreground">
                        <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No machines found</p>
                        <p className="text-sm">
                            {searchTerm
                                ? "Try a different search term"
                                : "Add your first machine to get started"}
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredMachines.map((machine) => (
                        <Link key={machine._id} to={`/machine-details/${machine._id}`}>
                            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Settings className="h-5 w-5 text-primary" />
                                        {machine.machine_no}
                                    </CardTitle>
                                    {machine.machine_name && (
                                        <CardDescription className="text-base font-medium">
                                            {machine.machine_name}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    {machine.location && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                            <MapPin className="h-4 w-4" />
                                            {machine.location}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {machine.specifications?.length || 0} specifications
                                        </span>
                                        <span className="text-primary hover:underline">
                                            View Details →
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MachineDetailsList;
