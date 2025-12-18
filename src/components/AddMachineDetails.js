import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

const AddMachineDetails = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        machine_no: "",
        machine_name: "",
        location: "",
        image: "",
    });
    const [specifications, setSpecifications] = useState([]);
    const [newSpec, setNewSpec] = useState({ key: "", value: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAddSpec = () => {
        if (newSpec.key.trim() && newSpec.value.trim()) {
            setSpecifications([...specifications, { ...newSpec }]);
            setNewSpec({ key: "", value: "" });
        } else {
            toast.error("Please enter both key and value for the specification");
        }
    };

    const handleRemoveSpec = (index) => {
        setSpecifications(specifications.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.machine_no.trim()) {
            toast.error("Machine No is required");
            return;
        }

        setIsSubmitting(true);
        const promise = new Promise(async (resolve, reject) => {
            try {
                await axios.post(`${process.env.REACT_APP_API_URL}/api/machine-details`, {
                    ...formData,
                    specifications,
                });
                resolve("Machine details saved successfully");
                navigate("/machine-details");
            } catch (error) {
                console.error("Error saving machine:", error);
                reject(error.response?.data?.message || "Failed to save machine details");
            } finally {
                setIsSubmitting(false);
            }
        });

        toast.promise(promise, {
            loading: "Saving machine details...",
            success: (data) => `${data}`,
            error: (err) => `${err}`,
        });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => navigate("/machine-details")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Machine List
            </Button>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl">Add New Machine</CardTitle>
                    <CardDescription>
                        Enter machine information and add specifications as needed
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label htmlFor="machine_no" className="text-sm font-medium">
                                    Machine No <span className="text-destructive">*</span>
                                </label>
                                <Input
                                    id="machine_no"
                                    name="machine_no"
                                    placeholder="Enter machine number (e.g., MCH-001)"
                                    value={formData.machine_no}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="machine_name" className="text-sm font-medium">
                                    Machine Name
                                </label>
                                <Input
                                    id="machine_name"
                                    name="machine_name"
                                    placeholder="Enter machine name (e.g., CNC Lathe)"
                                    value={formData.machine_name}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="location" className="text-sm font-medium">
                                    Location
                                </label>
                                <Input
                                    id="location"
                                    name="location"
                                    placeholder="Enter location (e.g., Bay 3, Section A)"
                                    value={formData.location}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        {/* Specifications Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Specifications</h3>
                                <span className="text-sm text-muted-foreground">
                                    {specifications.length} added
                                </span>
                            </div>

                            {/* Current Specifications */}
                            {specifications.length > 0 && (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="text-left p-3 text-sm font-medium">Field</th>
                                                <th className="text-left p-3 text-sm font-medium">Value</th>
                                                <th className="w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {specifications.map((spec, index) => (
                                                <tr key={index} className="border-t">
                                                    <td className="p-3 font-medium">{spec.key}</td>
                                                    <td className="p-3 text-muted-foreground">{spec.value}</td>
                                                    <td className="p-3">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveSpec(index)}
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Add New Specification */}
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-sm font-medium mb-1 block">Field Name</label>
                                    <Input
                                        placeholder="e.g., Spindle Speed"
                                        value={newSpec.key}
                                        onChange={(e) => setNewSpec({ ...newSpec, key: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm font-medium mb-1 block">Value</label>
                                    <Input
                                        placeholder="e.g., 8000 RPM"
                                        value={newSpec.value}
                                        onChange={(e) => setNewSpec({ ...newSpec, value: e.target.value })}
                                    />
                                </div>
                                <Button type="button" onClick={handleAddSpec} size="icon" variant="secondary">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 justify-end pt-4 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate("/machine-details")}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="gap-2">
                                <Save className="h-4 w-4" />
                                Save Machine
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default AddMachineDetails;
