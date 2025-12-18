/**
 * Compress and convert image to WebP format
 * @param {File} file - The image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 1200)
 * @param {number} options.maxHeight - Maximum height (default: 1200)
 * @param {number} options.quality - WebP quality 0-1 (default: 0.8)
 * @returns {Promise<Blob>} - Compressed WebP blob
 */
export const compressImage = (file, options = {}) => {
    const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;

            img.onload = () => {
                const canvas = document.createElement("canvas");
                let { width, height } = img;

                // Calculate new dimensions while maintaining aspect ratio
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to WebP blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // Create a new file with .webp extension
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, ".webp"),
                                { type: "image/webp" }
                            );
                            resolve(compressedFile);
                        } else {
                            reject(new Error("Canvas to Blob conversion failed"));
                        }
                    },
                    "image/webp",
                    quality
                );
            };

            img.onerror = () => {
                reject(new Error("Failed to load image"));
            };
        };

        reader.onerror = () => {
            reject(new Error("Failed to read file"));
        };
    });
};

/**
 * Get compressed file size as human-readable string
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
