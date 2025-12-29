$(document).ready(function() {
    const image = document.getElementById('preview-img');
    let cropper;
    let selection = null;
    let originalFile = null;
    let currentMode = 'inpaint'; // Mode can be 'inpaint' or 'crop'

    // --- Core Logic: Watermark Removal ---
    const processWatermark = function() {
        if (!originalFile || !selection) { return; }
        const formData = new FormData();
        formData.append('image', originalFile);
        formData.append('x', selection.x);
        formData.append('y', selection.y);
        formData.append('w', selection.w);
        formData.append('h', selection.h);
        
        const processBtn = $('#process-btn');
        processBtn.prop('disabled', true).text('处理中...');
        
        $.ajax({
            url: '/api/remove-watermark',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.status === 'success') {
                    $('#result-box .placeholder').hide();
                    $('#result-img').attr('src', response.image).show();
                    
                    const originalName = originalFile.name || 'image.png';
                    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || 'image';
                    const newFileName = `${baseName}_processed.png`;
                    
                    $('#download-btn').data('filename', newFileName).show();
                    $('#copy-btn').show(); // Show copy button
                    $('.result-options').show();
                } else {
                    console.error('Error: ' + response.message);
                }
            },
            error: function() {
                console.error('An error occurred while communicating with the server.');
            },
            complete: function() {
                processBtn.prop('disabled', false).text('去除水印');
            }
        });
    };

    const debounce = (func, delay) => {
        let debounceTimer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(context, args), delay);
        };
    };

    // --- Core Logic: Image Loading & Cropper Setup ---
    const handleImageFile = function(file) {
        if (!file) return;
        originalFile = file;
        currentMode = 'inpaint'; 

        // Reset UI
        $('#result-img').hide().attr('src', '');
        $('#result-box .placeholder').show();
        $('#download-btn').hide();
        $('#copy-btn').hide();
        $('#process-btn').show().prop('disabled', true).text('去除水印');
        $('#confirm-crop-btn').hide();
        $('.result-options').hide();
        $('#instruction-text').hide();

        const reader = new FileReader();
        reader.onload = function(e) {
            $('#preview-box .placeholder').hide();
            image.src = e.target.result;

            $(image).off('load').on('load', function() {
                $(this).show();
                if (cropper) {
                    cropper.destroy();
                }
                cropper = new Cropper(image, {
                    viewMode: 1,
                    dragMode: 'move',
                    zoomable: true,
                    zoomOnWheel: true,
                    autoCropArea: 0.8,
                    crop(event) {
                        const data = event.detail;
                        selection = {
                            x: Math.round(data.x),
                            y: Math.round(data.y),
                            w: Math.round(data.width),
                            h: Math.round(data.height)
                        };
                        if (currentMode === 'inpaint') {
                            $('#process-btn').prop('disabled', false);
                        } else if (currentMode === 'crop') {
                            $('#confirm-crop-btn').prop('disabled', false);
                        }
                    },
                    cropend: debounce(function() {
                        if (currentMode === 'inpaint') {
                            processWatermark();
                        }
                    }, 500)
                });
                $('#instruction-text').text('请在图片上拖拽鼠标以选择水印区域').show();
            });
        };
        reader.readAsDataURL(originalFile);
    };

    // --- Event Listeners: Upload & Paste ---

    // 1. File Input Change
    $('#upload-file').on('change', function(event) {
        handleImageFile(event.target.files[0]);
    });

    // 2. Global Paste Event
    $(document).on('paste', function(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                // If the pasted file doesn't have a name (common for screenshots), give it one
                if (!file.name || file.name === 'image.png') {
                    // Create a new File object to set a name if possible, or just treat it as png
                    // Note: File properties are read-only, but we store it in 'originalFile'
                    // We can just rely on the fallback name logic in processWatermark
                }
                handleImageFile(file);
                event.preventDefault(); // Prevent default paste behavior
                break;
            }
        }
    });

    // --- Event Listeners: Actions ---

    $('#try-crop-link').on('click', function(e) {
        e.preventDefault();
        currentMode = 'crop';
        $('#instruction-text').text('请拖拽出一个您希望保留的区域').show();
        $('#process-btn').hide();
        $('#confirm-crop-btn').show().prop('disabled', true);
        $('.result-options').hide();
        if (cropper) {
            cropper.setDragMode('crop');
            cropper.clear();
        }
    });

    $('#confirm-crop-btn').on('click', function() {
        if (!cropper) { return; }
        const canvas = cropper.getCroppedCanvas();
        const croppedImageDataURL = canvas.toDataURL('image/png');
        $('#result-box .placeholder').hide();
        $('#result-img').attr('src', croppedImageDataURL).show();
        
        const originalName = originalFile.name || 'image.png';
        const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || 'image';
        const newFileName = `${baseName}_cropped.png`;
        
        $('#download-btn').data('filename', newFileName).show();
        $('#copy-btn').show();
        $(this).prop('disabled', true);
        $('.result-options').hide();
    });

    $('#process-btn').on('click', function() {
        processWatermark();
    });

    // Download Handler
    $('#download-btn').on('click', function() {
        const imageDataURL = $('#result-img').attr('src');
        const filename = $(this).data('filename');
        if (!imageDataURL) { return; }
        const link = document.createElement('a');
        link.href = imageDataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Copy to Clipboard Handler
    $('#copy-btn').on('click', async function() {
        const imageDataURL = $('#result-img').attr('src');
        if (!imageDataURL) return;

        try {
            const btn = $(this);
            const originalText = btn.text();
            btn.prop('disabled', true).text('复制中...');

            // Fetch the Data URL to get a Blob
            const response = await fetch(imageDataURL);
            const blob = await response.blob();

            // Write Blob to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);

            btn.text('已复制!');
            setTimeout(() => {
                btn.prop('disabled', false).text(originalText);
            }, 2000);

        } catch (err) {
            console.error('Failed to copy image: ', err);
            alert('复制失败，请确保您在 HTTPS 环境或本地 localhost 下使用。');
            $(this).prop('disabled', false).text('复制结果图片');
        }
    });

    // --- Magnifier Logic ---
    const resultImg = document.getElementById('result-img');
    const resultBox = document.getElementById('result-box');
    let glass, w, h, bw;
    const zoom = 3;

    function initMagnifier() {
        // Remove existing glass if any
        $('.img-magnifier-glass').remove();

        // Only initialize if image is visible
        if (!resultImg.src || resultImg.style.display === 'none' || resultImg.width === 0) return;

        glass = document.createElement("DIV");
        glass.setAttribute("class", "img-magnifier-glass");
        resultBox.insertBefore(glass, resultImg);

        // Set background properties for the glass
        glass.style.backgroundImage = "url('" + resultImg.src + "')";
        glass.style.backgroundRepeat = "no-repeat";
        
        bw = 3; // border width defined in css / 2 approx or ignored if calculating perfectly
        w = glass.offsetWidth / 2;
        h = glass.offsetHeight / 2;
        
        // Calculate the ratio between resultImg natural size and displayed size
        // But actually, for magnifier, we want to zoom the DISPLAYED image or the NATURAL image?
        // Usually we want to see details, so zooming the natural image is better if displayed is small.
        // However, a simple lens implementation scales the background image relative to the glass.
        // Let's implement: Background Size = (img width * zoom) x (img height * zoom)
        
        glass.style.backgroundSize = (resultImg.width * zoom) + "px " + (resultImg.height * zoom) + "px";
    }

    // Initialize magnifier when result image loads or updates
    $('#result-img').on('load', function() {
        initMagnifier();
    });

    // Handle mouse movement over the image box (to cover edge cases)
    // We attach to resultBox but check if mouse is over image
    $(resultBox).on('mousemove', function(e) {
        if (!glass || resultImg.style.display === 'none') return;
        
        // Prevent default only if necessary, but here we want click to pass through?
        // e.preventDefault(); 
        
        const pos = getCursorPos(e);
        let x = pos.x;
        let y = pos.y;
        
        // Prevent the magnifier glass from being positioned outside the image
        if (x > resultImg.width - (w / zoom)) {x = resultImg.width - (w / zoom);}
        if (x < w / zoom) {x = w / zoom;}
        if (y > resultImg.height - (h / zoom)) {y = resultImg.height - (h / zoom);}
        if (y < h / zoom) {y = h / zoom;}
        
        // Set the position of the magnifier glass
        // We need to position it relative to the image, and account for image offset within box if any
        // Since resultBox is flex center, image might have offset.
        // Let's position glass absolute to resultBox, matching image position + cursor logic
        
        // Simpler: Center the glass on the cursor
        // Cursor pos is relative to image.
        // Image offset within resultBox:
        const imgRect = resultImg.getBoundingClientRect();
        const boxRect = resultBox.getBoundingClientRect();
        const imgLeft = imgRect.left - boxRect.left;
        const imgTop = imgRect.top - boxRect.top;
        
        const glassLeft = imgLeft + x - w;
        const glassTop = imgTop + y - h;

        glass.style.left = glassLeft + "px";
        glass.style.top = glassTop + "px";
        
        // Display what the magnifier glass "sees":
        glass.style.backgroundPosition = "-" + ((x * zoom) - w + bw) + "px -" + ((y * zoom) - h + bw) + "px";
    });

    // Helper to get cursor position relative to image
    function getCursorPos(e) {
        let a, x = 0, y = 0;
        e = e || window.event;
        // Get the x and y positions of the image:
        a = resultImg.getBoundingClientRect();
        // Calculate the cursor's x and y coordinates, relative to the image:
        x = e.pageX - a.left;
        y = e.pageY - a.top;
        // Consider any page scrolling:
        x = x - window.pageXOffset;
        y = y - window.pageYOffset;
        return {x : x, y : y};
    }

    // Toggle visibility
    $(resultBox).on('mouseenter', function() {
        if (glass && resultImg.style.display !== 'none') {
            // Update size in case of window resize
             glass.style.backgroundSize = (resultImg.width * zoom) + "px " + (resultImg.height * zoom) + "px";
             glass.style.display = "block";
        }
    });

    $(resultBox).on('mouseleave', function() {
        if (glass) glass.style.display = "none";
    });

    // --- Modal Logic ---
    const modal = $('#image-modal');
    const modalImg = $('#modal-image');

    $('#result-img').on('click', function() {
        if ($(this).attr('src')) {
            modal.css('display', 'flex');
            modalImg.attr('src', $(this).attr('src'));
        }
    });

    function closeModal() {
        modal.hide();
    }

    $('.close-btn').on('click', closeModal);

    modal.on('click', function(event) {
        if ($(event.target).is(modal)) {
            closeModal();
        }
    });
});