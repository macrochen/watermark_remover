$(document).ready(function() {
    const image = document.getElementById('preview-img');
    let cropper;
    let selection = null;
    let originalFile = null;
    let currentMode = 'inpaint'; // Mode can be 'inpaint' or 'crop'

    $('#upload-file').on('change', function(event) {
        originalFile = event.target.files[0];
        if (originalFile) {
            currentMode = 'inpaint'; // Reset mode on new upload

            // Reset UI
            $('#result-img').hide().attr('src', '');
            $('#result-box .placeholder').show();
            $('#download-btn').hide();
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
                    });
                    $('#instruction-text').text('请在图片上拖拽鼠标以选择水印区域').show();
                });
            };
            reader.readAsDataURL(originalFile);
        }
    });

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
        const originalName = originalFile.name;
        const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
        const newFileName = `${baseName}_cropped.png`;
        $('#download-btn').data('filename', newFileName).show();
        $(this).prop('disabled', true);
        $('.result-options').hide();
    });

    $('#process-btn').on('click', function() {
        if (!originalFile || !selection) { return; }
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
                    const originalName = originalFile.name;
                    const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
                    const newFileName = `${baseName}_processed.png`;
                    $('#download-btn').data('filename', newFileName).show();
                    $('.result-options').show();
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

    // New robust download handler
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

    // --- Modal Logic ---
    const modal = $('#image-modal');
    const modalImg = $('#modal-image');

    // When the user clicks on the result image, open the modal
    $('#result-img').on('click', function() {
        if ($(this).attr('src')) { // Only open if there is an image
            modal.css('display', 'flex');
            modalImg.attr('src', $(this).attr('src'));
        }
    });

    // Function to close the modal
    function closeModal() {
        modal.hide();
    }

    // When the user clicks on <span> (x), close the modal
    $('.close-btn').on('click', closeModal);

    // When the user clicks anywhere on the modal background, close it
    modal.on('click', function(event) {
        if ($(event.target).is(modal)) {
            closeModal();
        }
    });
});
