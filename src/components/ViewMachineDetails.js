import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Trash2, ArrowLeft, Save, Pencil, X, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

const ViewMachineDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [machine, setMachine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({});
    const [newSpec, setNewSpec] = useState({ key: "", value: "" });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchMachine();
    }, [id]);

    const fetchMachine = async () => {
        try {
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/machine-details/${id}`);
            setMachine(response.data);
            setEditData(response.data);
        } catch (error) {
            console.error("Error fetching machine:", error);
            toast.error("Failed to load machine details");
            navigate("/machine-details");
        } finally {
            setLoading(false);
        }
    };

    const handleEditToggle = () => {
        if (isEditing) {
            // Cancel edit - reset to original
            setEditData({ ...machine });
        }
        setIsEditing(!isEditing);
    };

    const handleInputChange = (e) => {
        setEditData({ ...editData, [e.target.name]: e.target.value });
    };

    const handleSpecChange = (index, field, value) => {
        const updatedSpecs = [...editData.specifications];
        updatedSpecs[index] = { ...updatedSpecs[index], [field]: value };
        setEditData({ ...editData, specifications: updatedSpecs });
    };

    const handleAddSpec = () => {
        if (newSpec.key.trim() && newSpec.value.trim()) {
            const updatedSpecs = [...(editData.specifications || []), { ...newSpec }];
            setEditData({ ...editData, specifications: updatedSpecs });
            setNewSpec({ key: "", value: "" });
        } else {
            toast.error("Please enter both field name and value");
        }
    };

    const handleRemoveSpec = (index) => {
        const updatedSpecs = editData.specifications.filter((_, i) => i !== index);
        setEditData({ ...editData, specifications: updatedSpecs });
    };

    const handleSave = async () => {
        setIsSaving(true);
        const promise = new Promise(async (resolve, reject) => {
            try {
                const response = await axios.put(
                    `${process.env.REACT_APP_API_URL}/api/machine-details/${id}`,
                    editData
                );
                setMachine(response.data);
                setIsEditing(false);
                resolve("Machine details updated successfully");
            } catch (error) {
                console.error("Error updating machine:", error);
                reject(error.response?.data?.message || "Failed to update machine");
            } finally {
                setIsSaving(false);
            }
        });

        toast.promise(promise, {
            loading: "Saving changes...",
            success: (data) => `${data}`,
            error: (err) => `${err}`,
        });
    };

    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this machine?")) return;

        const promise = new Promise(async (resolve, reject) => {
            try {
                await axios.delete(`${process.env.REACT_APP_API_URL}/api/machine-details/${id}`);
                resolve("Machine deleted successfully");
                navigate("/machine-details");
            } catch (error) {
                console.error("Error deleting machine:", error);
                reject("Failed to delete machine");
            }
        });

        toast.promise(promise, {
            loading: "Deleting machine...",
            success: (data) => `${data}`,
            error: (err) => `${err}`,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!machine) return null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => navigate("/machine-details")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Machine List
            </Button>

            {/* Machine Info Card */}
            <Card className="shadow-lg">
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle className="text-2xl">
                            {isEditing ? (
                                <Input
                                    name="machine_no"
                                    value={editData.machine_no}
                                    onChange={handleInputChange}
                                    className="text-2xl font-bold h-auto py-1"
                                />
                            ) : (
                                machine.machine_no
                            )}
                        </CardTitle>
                        <CardDescription className="text-base mt-2">
                            {isEditing ? (
                                <Input
                                    name="machine_name"
                                    value={editData.machine_name || ""}
                                    onChange={handleInputChange}
                                    placeholder="Machine name"
                                />
                            ) : (
                                machine.machine_name || "No name specified"
                            )}
                        </CardDescription>
                        {(machine.location || isEditing) && (
                            <div className="flex items-center gap-2 text-muted-foreground mt-2">
                                <MapPin className="h-4 w-4" />
                                {isEditing ? (
                                    <Input
                                        name="location"
                                        value={editData.location || ""}
                                        onChange={handleInputChange}
                                        placeholder="Location"
                                        className="h-8"
                                    />
                                ) : (
                                    machine.location
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant={isEditing ? "outline" : "secondary"}
                            size="sm"
                            onClick={handleEditToggle}
                            className="gap-2"
                        >
                            {isEditing ? (
                                <>
                                    <X className="h-4 w-4" />
                                    Cancel
                                </>
                            ) : (
                                <>
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                </>
                            )}
                        </Button>
                        {isEditing && (
                            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-2">
                                <Save className="h-4 w-4" />
                                Save
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Specifications */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Specifications</h3>
                            <span className="text-sm text-muted-foreground">
                                {editData.specifications?.length || 0} items
                            </span>
                        </div>

                        {editData.specifications?.length > 0 ? (
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-muted">
                                        <tr>
                                            <th className="text-left p-3 text-sm font-medium">Field</th>
                                            <th className="text-left p-3 text-sm font-medium">Value</th>
                                            {isEditing && <th className="w-12"></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editData.specifications.map((spec, index) => (
                                            <tr key={index} className="border-t">
                                                <td className="p-3 font-medium">
                                                    {isEditing ? (
                                                        <Input
                                                            value={spec.key}
                                                            onChange={(e) => handleSpecChange(index, "key", e.target.value)}
                                                            className="h-8"
                                                        />
                                                    ) : (
                                                        spec.key
                                                    )}
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {isEditing ? (
                                                        <Input
                                                            value={spec.value}
                                                            onChange={(e) => handleSpecChange(index, "value", e.target.value)}
                                                            className="h-8"
                                                        />
                                                    ) : (
                                                        spec.value
                                                    )}
                                                </td>
                                                {isEditing && (
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
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground border rounded-lg">
                                No specifications added yet
                            </div>
                        )}

                        {/* Add New Specification (always visible in edit mode) */}
                        {isEditing && (
                            <div className="flex gap-2 items-end mt-4">
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
                        )}
                    </div>

                    {/* Delete Button */}
                    {isEditing && (
                        <div className="pt-4 border-t">
                            <Button variant="destructive" onClick={handleDelete} className="gap-2">
                                <Trash2 className="h-4 w-4" />
                                Delete Machine
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ViewMachineDetails;
