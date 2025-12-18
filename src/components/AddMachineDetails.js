import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus, Trash2, ArrowLeft, Save, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage, formatFileSize } from "../lib/imageCompression";

const AddMachineDetails = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        machine_no: "",
        machine_name: "",
        location: "",
    });
    const [specifications, setSpecifications] = useState([]);
    const [newSpec, setNewSpec] = useState({ key: "", value: "", image: null, imagePreview: null });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleNewSpecImageChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Compress image to WebP format
                const originalSize = file.size;
                const compressedFile = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
                const compressedSize = compressedFile.size;

                console.log(`Image compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);

                const reader = new FileReader();
                reader.onloadend = () => {
                    setNewSpec({ ...newSpec, image: compressedFile, imagePreview: reader.result });
                };
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error("Compression failed, using original:", error);
                // Fallback to original if compression fails
                const reader = new FileReader();
                reader.onloadend = () => {
                    setNewSpec({ ...newSpec, image: file, imagePreview: reader.result });
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const removeNewSpecImage = () => {
        setNewSpec({ ...newSpec, image: null, imagePreview: null });
    };

    const handleAddSpec = () => {
        if (newSpec.key.trim() && (newSpec.value.trim() || newSpec.image)) {
            setSpecifications([...specifications, {
                key: newSpec.key,
                value: newSpec.value,
                image: newSpec.image,
                imagePreview: newSpec.imagePreview
            }]);
            setNewSpec({ key: "", value: "", image: null, imagePreview: null });
        } else {
            toast.error("Please enter field name and either value or image");
        }
    };

    const handleRemoveSpec = (index) => {
        setSpecifications(specifications.filter((_, i) => i !== index));
    };

    const uploadImage = async (file) => {
        const formData = new FormData();
        formData.append("image", file);
        const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/image`, formData);
        return response.data.link;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.machine_no.trim()) {
            toast.error("Machine No is required");
            return;
        }

        // Auto-add any pending specification
        let finalSpecs = [...specifications];
        if (newSpec.key.trim() && (newSpec.value.trim() || newSpec.image)) {
            finalSpecs = [...finalSpecs, { ...newSpec }];
        }

        setIsSubmitting(true);
        const promise = new Promise(async (resolve, reject) => {
            try {
                // Upload images for each spec that has one
                const processedSpecs = await Promise.all(
                    finalSpecs.map(async (spec) => {
                        let imageUrl = "";
                        if (spec.image) {
                            imageUrl = await uploadImage(spec.image);
                        }
                        return {
                            key: spec.key,
                            value: spec.value || "",
                            image: imageUrl
                        };
                    })
                );

                await axios.post(`${process.env.REACT_APP_API_URL}/api/machine-details`, {
                    ...formData,
                    specifications: processedSpecs,
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
                                <div className="space-y-2">
                                    {specifications.map((spec, index) => (
                                        <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm">{spec.key}</div>
                                                {spec.value && (
                                                    <div className="text-sm text-muted-foreground truncate">{spec.value}</div>
                                                )}
                                            </div>
                                            {spec.imagePreview && (
                                                <img
                                                    src={spec.imagePreview}
                                                    alt="Spec"
                                                    className="h-10 w-10 rounded border object-cover flex-shrink-0"
                                                />
                                            )}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveSpec(index)}
                                                className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add New Specification */}
                            <div className="space-y-3 p-3 border rounded-lg border-dashed">
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-sm font-medium mb-1 block">Field Name</label>
                                        <Input
                                            placeholder="e.g., Spindle Speed or Name Plate"
                                            value={newSpec.key}
                                            onChange={(e) => setNewSpec({ ...newSpec, key: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-sm font-medium mb-1 block">Value (optional if image)</label>
                                        <Input
                                            placeholder="e.g., 8000 RPM"
                                            value={newSpec.value}
                                            onChange={(e) => setNewSpec({ ...newSpec, value: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {newSpec.imagePreview ? (
                                        <div className="relative">
                                            <img
                                                src={newSpec.imagePreview}
                                                alt="Preview"
                                                className="h-12 w-auto rounded border object-cover"
                                            />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute -top-2 -right-2 h-5 w-5"
                                                onClick={removeNewSpecImage}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer">
                                            <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md hover:bg-muted transition-colors text-sm">
                                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">Add Image</span>
                                            </div>
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleNewSpecImageChange}
                                            />
                                        </label>
                                    )}
                                    <Button type="button" onClick={handleAddSpec} size="sm" variant="secondary" className="gap-1">
                                        <Plus className="h-4 w-4" />
                                        Add Field
                                    </Button>
                                </div>
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
