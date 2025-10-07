$(document).ready(function() {
    const image = document.getElementById('preview-img');
    let cropper;
    let selection = null;
    let originalFile = null;

    $('#upload-file').on('change', function(event) {
        originalFile = event.target.files[0];
        if (originalFile) {
            // Reset UI
            $('#result-img').hide().attr('src', '');
            $('#result-box .placeholder').show();
            $('#download-link').hide();
            $('#process-btn').prop('disabled', true);
            $('#instruction-text').hide();

            const reader = new FileReader();
            reader.onload = function(e) {
                // Hide placeholder and show image
                $('#preview-box .placeholder').hide();
                image.src = e.target.result;
                $(image).show();

                // Destroy previous cropper instance if it exists
                if (cropper) {
                    cropper.destroy();
                }

                // Initialize Cropper.js
                cropper = new Cropper(image, {
                    viewMode: 1, // Restrict crop box to be within the canvas
                    dragMode: 'move', // Allow moving the image
                    zoomable: true,   // Allow zooming the image
                    zoomOnWheel: true, // Allow zooming with mouse wheel
                    autoCropArea: 0.8,
                    // The 'crop' event is fired whenever the crop box is moved or resized
                    crop(event) {
                        const data = event.detail;
                        selection = {
                            x: Math.round(data.x),
                            y: Math.round(data.y),
                            w: Math.round(data.width),
                            h: Math.round(data.height)
                        };
                        // Enable button only when there is a selection
                        $('#process-btn').prop('disabled', false);
                    },
                });
                $('#instruction-text').show();
            };
            reader.readAsDataURL(originalFile);
        }
    });

    $('#process-btn').on('click', function() {
        if (!originalFile || !selection) {
            alert('Please upload an image and select a watermark area.');
            return;
        }

        const formData = new FormData();
        formData.append('image', originalFile);
        formData.append('x', selection.x);
        formData.append('y', selection.y);
        formData.append('w', selection.w);
        formData.append('h', selection.h);

        const processBtn = $(this);
        processBtn.prop('disabled', true).text('处理中...');
        $('#instruction-text').hide();

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

                    // Generate new filename
                    const originalName = originalFile.name;
                    const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
                    const newFileName = `${baseName}_processed.png`;

                    $('#download-link').attr({
                        'href': response.image,
                        'download': newFileName
                    }).show();
                } else {
                    alert('Error: ' + response.message);
                }
            },
            error: function() {
                alert('An error occurred while communicating with the server.');
            },
            complete: function() {
                processBtn.prop('disabled', false).text('去除水印');
            }
        });
    });
});
