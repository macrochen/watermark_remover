$(document).ready(function() {
    const image = document.getElementById('preview-img');
    const maskCanvas = document.getElementById('mask-canvas');
    const ctx = maskCanvas.getContext('2d');
    
    let cropper;
    let selection = null;
    let originalFile = null; // Keeps the very first uploaded file
    let currentImageSrc = null; // Tracks the current state of the edited image
    let historyStack = []; // For Undo functionality
    let removalMode = 'brush'; // Default to 'brush'
    let isDrawing = false;
    let brushSize = 20;

    // --- Core Logic: Watermark Removal ---
    const processWatermark = function() {
        if (!currentImageSrc) { return; }
        
        // Rect Mode Check
        if (removalMode === 'rect' && !selection) { return; }

        const formData = new FormData();
        
        // Convert current base64 image to blob to send as file
        const blob = dataURLtoBlob(currentImageSrc);
        formData.append('image', blob, 'current_image.png');

        if (removalMode === 'rect') {
            formData.append('x', selection.x);
            formData.append('y', selection.y);
            formData.append('w', selection.w);
            formData.append('h', selection.h);
        } else {
            // Brush mode
            // Get action type
            const actionType = $('input[name="action_type"]:checked').val();
            formData.append('action_type', actionType);
            
            maskCanvas.toBlob(function(maskBlob) {
                formData.append('mask', maskBlob, 'mask.png');
                sendRequest(formData);
            });
            return; 
        }
        
        sendRequest(formData);
    };

    const sendRequest = function(formData) {
        const processBtn = $('#process-btn');
        if (removalMode === 'rect') {
            processBtn.prop('disabled', true).text('处理中...');
        } else {
            document.body.style.cursor = 'wait';
        }
        
        $.ajax({
            url: '/api/remove-watermark',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.status === 'success') {
                    if (removalMode === 'rect') {
                        // Rect mode: Show comparison
                        $('#result-box .placeholder').hide();
                        $('#result-img').attr('src', response.image).show();
                        setupDownload(response.image);
                        $('.result-options').show();
                    } else {
                        // Brush mode: Update IN PLACE
                        pushHistory(); // Save state before updating
                        
                        updateImageSource(response.image);
                        
                        // Clear the strokes
                        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                        
                        setupDownload(response.image);
                    }
                } else {
                    console.error('Error: ' + response.message);
                }
            },
            error: function() {
                console.error('An error occurred while communicating with the server.');
            },
            complete: function() {
                if (removalMode === 'rect') {
                    processBtn.prop('disabled', false).text('去除水印');
                } else {
                    document.body.style.cursor = 'default';
                }
            }
        });
    }
    
    function updateImageSource(newSrc) {
        currentImageSrc = newSrc;
        image.src = newSrc;
    }

    function dataURLtoBlob(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    const debounce = (func, delay) => {
        let debounceTimer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(context, args), delay);
        };
    };

    // --- Mode Switching Logic ---
    function setMode(mode) {
        removalMode = mode;
        if (mode === 'rect') {
            $('#mode-rect').addClass('active');
            $('#mode-brush').removeClass('active');
            $('.brush-settings').hide();
            $('#rect-settings').css('display', 'flex'); 
            $('#mask-canvas').hide();
            
            $('#result-box').show();
            $('#preview-box').css('width', '48%'); 
            $('#preview-title').text('原始图片');
            $('#instruction-text').text('请在图片上拖拽鼠标以选择水印区域').show();
            
            if (!cropper && image.src) {
                initCropper();
            }
        } else {
            $('#mode-brush').addClass('active');
            $('#mode-rect').removeClass('active');
            $('.brush-settings').css('display', 'flex');
            $('#rect-settings').hide(); 
            
            $('#result-box').hide();
            $('#preview-box').css('width', '100%'); 
            $('#preview-title').text('涂抹消除模式 (直接涂抹不需要的地方)');
            $('#instruction-text').hide(); 
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            
            if (image.src) {
                setupCanvas();
            }
        }
    }

    $('#mode-rect').click(() => setMode('rect'));
    $('#mode-brush').click(() => setMode('brush'));

    // --- Rect Settings Logic ---
    function updateRectInputs(data) {
        $('#crop-x').val(Math.round(data.x));
        $('#crop-y').val(Math.round(data.y));
        $('#crop-w').val(Math.round(data.width));
        $('#crop-h').val(Math.round(data.height));
    }

    $('.coord-input').on('change', function() {
        if (!cropper) return;
        const x = parseFloat($('#crop-x').val());
        const y = parseFloat($('#crop-y').val());
        const w = parseFloat($('#crop-w').val());
        const h = parseFloat($('#crop-h').val());
        
        cropper.setData({
            x: x,
            y: y,
            width: w,
            height: h
        });
        
        processWatermark(); 
    });

    // --- Brush Logic ---
    function setupCanvas() {
        if (!image.complete) return; 
        
        const rect = image.getBoundingClientRect();
        
        maskCanvas.width = rect.width;
        maskCanvas.height = rect.height;
        
        $(maskCanvas).show().css('pointer-events', 'auto');
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        updateBrushStyle();
        ctx.lineWidth = brushSize;
    }
    
    function updateBrushStyle() {
        const actionType = $('input[name="action_type"]:checked').val();
        if (actionType === 'mosaic') {
            ctx.strokeStyle = '#000000'; // Black brush for mosaic
        } else {
            ctx.strokeStyle = '#ff0000'; // Red brush for removal
        }
    }
    
    $('input[name="action_type"]').change(function() {
        updateBrushStyle();
    });
    
    $(window).resize(debounce(function() {
        if (removalMode === 'brush') setupCanvas();
    }, 200));

    $('#brush-size').on('input', function() {
        brushSize = $(this).val();
        ctx.lineWidth = brushSize;
    });

    $('#clear-brush').click(function() {
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    });
    
    // Undo Logic
    function pushHistory() {
        historyStack.push(currentImageSrc);
        if (historyStack.length > 10) historyStack.shift(); 
    }
    
    $('#undo-btn').click(function() {
        if (historyStack.length > 0) {
            const prevSrc = historyStack.pop();
            updateImageSource(prevSrc);
            ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            setupDownload(prevSrc);
        } else {
            alert('没有更多可撤销的操作');
        }
    });

    // Drawing Events
    function startDraw(e) {
        isDrawing = true;
        draw(e);
    }
    
    function endDraw() {
        if (isDrawing) {
            isDrawing = false;
            ctx.beginPath();
            processWatermark(); 
        }
    }

    function draw(e) {
        if (!isDrawing) return;
        
        const rect = maskCanvas.getBoundingClientRect();
        const clientX = e.clientX || (e.originalEvent.touches && e.originalEvent.touches[0].clientX);
        const clientY = e.clientY || (e.originalEvent.touches && e.originalEvent.touches[0].clientY);
        
        if (!clientX || !clientY) return;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    $(maskCanvas).on('mousedown touchstart', startDraw);
    $(maskCanvas).on('mouseup touchend mouseout', endDraw);
    $(maskCanvas).on('mousemove touchmove', function(e) {
        if(isDrawing) e.preventDefault(); 
        draw(e);
    });


    // --- Core Logic: Image Loading & Cropper Setup ---
    function initCropper() {
        if (cropper) cropper.destroy();
        cropper = new Cropper(image, {
            viewMode: 1,
            dragMode: 'move',
            zoomable: false, 
            zoomOnWheel: false, 
            autoCrop: false, 
            ready() {
                const imgData = this.cropper.getImageData();
                const defaultW = 100;
                const defaultH = 100;
                const w = Math.min(defaultW, imgData.naturalWidth);
                const h = Math.min(defaultH, imgData.naturalHeight);
                const x = imgData.naturalWidth - w;
                const y = imgData.naturalHeight - h;
                
                this.cropper.crop(); 
                this.cropper.setData({
                    x: x,
                    y: y,
                    width: w,
                    height: h
                });
            },
            crop(event) {
                const data = event.detail;
                selection = {
                    x: Math.round(data.x),
                    y: Math.round(data.y),
                    w: Math.round(data.width),
                    h: Math.round(data.height)
                };
                
                updateRectInputs(data);

                if (removalMode === 'rect') {
                    $('#process-btn').prop('disabled', false);
                }
            },
            cropend: debounce(function() {
                if (removalMode === 'rect') {
                    processWatermark();
                }
            }, 500)
        });
    }

    const handleImageFile = function(file) {
        if (!file) return;
        originalFile = file;
        historyStack = []; 

        $('#result-img').hide().attr('src', '');
        $('#result-box .placeholder').show();
        $('#download-btn').hide();
        $('#copy-btn').hide();
        $('#process-btn').show().prop('disabled', true).text('去除水印');
        $('#main-toolbar').show();
        $('.result-options').hide();
        $('#instruction-text').hide();

        const reader = new FileReader();
        reader.onload = function(e) {
            currentImageSrc = e.target.result;
            image.src = currentImageSrc;

            $(image).off('load').on('load', function() {
                $(this).show();
                
                if (removalMode === 'rect') {
                    initCropper();
                    $('#instruction-text').text('请在图片上操作').show();
                } else {
                    setupCanvas();
                }
            });
        };
        reader.readAsDataURL(originalFile);
    };
    
    function setupDownload(url) {
        const originalName = originalFile ? originalFile.name : 'image.png';
        const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || 'image';
        const newFileName = `${baseName}_processed.png`;
        $('#download-btn').data('filename', newFileName).show();
        $('#copy-btn').show();
    }

    $('#upload-file').on('change', function(event) {
        handleImageFile(event.target.files[0]);
    });

    $(document).on('paste', function(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImageFile(file);
                event.preventDefault(); 
                break;
            }
        }
    });

    $('#try-crop-link').on('click', function(e) {
        e.preventDefault();
        setMode('rect');
    });

    $('#process-btn').on('click', function() {
        processWatermark();
    });

    $('#download-btn').on('click', function() {
        const imageDataURL = removalMode === 'rect' ? $('#result-img').attr('src') : $('#preview-img').attr('src');
        const filename = $(this).data('filename');
        if (!imageDataURL) { return; }
        const link = document.createElement('a');
        link.href = imageDataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    $('#copy-btn').on('click', async function() {
        const imageDataURL = removalMode === 'rect' ? $('#result-img').attr('src') : $('#preview-img').attr('src');
        if (!imageDataURL) return;
        try {
            const btn = $(this);
            const originalText = btn.text();
            btn.prop('disabled', true).text('复制中...');
            const response = await fetch(imageDataURL);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
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
        $('.img-magnifier-glass').remove();
        if (!resultImg.src || resultImg.style.display === 'none' || resultImg.width === 0) return;

        glass = document.createElement("DIV");
        glass.setAttribute("class", "img-magnifier-glass");
        resultBox.insertBefore(glass, resultImg);

        glass.style.backgroundImage = "url('" + resultImg.src + "')";
        glass.style.backgroundRepeat = "no-repeat";
        
        bw = 3; 
        w = glass.offsetWidth / 2;
        h = glass.offsetHeight / 2;
        glass.style.backgroundSize = (resultImg.width * zoom) + "px " + (resultImg.height * zoom) + "px";
    }

    $('#result-img').on('load', function() {
        initMagnifier();
    });

    $(resultBox).on('mousemove', function(e) {
        if (!glass || resultImg.style.display === 'none') return;
        
        const pos = getCursorPos(e);
        let x = pos.x;
        let y = pos.y;
        
        if (x > resultImg.width - (w / zoom)) {x = resultImg.width - (w / zoom);}
        if (x < w / zoom) {x = w / zoom;}
        if (y > resultImg.height - (h / zoom)) {y = resultImg.height - (h / zoom);}
        if (y < h / zoom) {y = h / zoom;}
        
        const imgRect = resultImg.getBoundingClientRect();
        const boxRect = resultBox.getBoundingClientRect();
        const imgLeft = imgRect.left - boxRect.left;
        const imgTop = imgRect.top - boxRect.top;
        
        const glassLeft = imgLeft + x - w;
        const glassTop = imgTop + y - h;

        glass.style.left = glassLeft + "px";
        glass.style.top = glassTop + "px";
        glass.style.backgroundPosition = "-" + ((x * zoom) - w + bw) + "px -" + ((y * zoom) - h + bw) + "px";
    });

    function getCursorPos(e) {
        let a, x = 0, y = 0;
        e = e || window.event;
        a = resultImg.getBoundingClientRect();
        x = e.pageX - a.left;
        y = e.pageY - a.top;
        x = x - window.pageXOffset;
        y = y - window.pageYOffset;
        return {x : x, y : y};
    }

    $(resultBox).on('mouseenter', function() {
        if (glass && resultImg.style.display !== 'none') {
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
    
    $('#preview-img').on('click', function() {
        if (removalMode === 'brush' && $(this).attr('src')) {
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

    // Initialize default mode UI
    setMode('brush');
});