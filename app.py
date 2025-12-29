from flask import Flask, render_template, request, jsonify
import cv2
import numpy as np
import base64

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/remove-watermark', methods=['POST'])
def remove_watermark():
    if 'image' not in request.files:
        return jsonify({'status': 'error', 'message': 'No image file found'}), 400
    
    file = request.files['image']
    
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400

    # Check if a mask image is provided
    mask_file = request.files.get('mask')
    
    img = None
    mask = None

    if file:
        filestr = file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if mask_file:
        # Mode 1: Mask-based removal (Brush mode)
        mask_str = mask_file.read()
        npmask = np.frombuffer(mask_str, np.uint8)
        
        # Read as UNCHANGED to capture Alpha channel if present
        mask_img = cv2.imdecode(npmask, cv2.IMREAD_UNCHANGED) 
        
        # Resize mask to match image dimensions
        # Note: OpenCv Resize takes (Width, Height)
        if img is not None and mask_img is not None:
             target_h, target_w = img.shape[:2]
             mask_h, mask_w = mask_img.shape[:2]
             
             if (mask_w != target_w) or (mask_h != target_h):
                 mask_img = cv2.resize(mask_img, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
        
        # Create Binary Mask
        if mask_img is not None:
            # Check for Alpha Channel (4 channels)
            if len(mask_img.shape) == 3 and mask_img.shape[2] == 4:
                # Use Alpha channel as mask
                _, mask = cv2.threshold(mask_img[:, :, 3], 0, 255, cv2.THRESH_BINARY)
            else:
                # Fallback: Convert to grayscale and threshold
                # If image is BGR/RGB
                if len(mask_img.shape) == 3:
                    mask_temp = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
                else:
                    mask_temp = mask_img
                _, mask = cv2.threshold(mask_temp, 0, 255, cv2.THRESH_BINARY)

            # Dilate the mask slightly to cover edges of the brush strokes better
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=1)

    else:
        # Mode 2: Rectangle-based removal (Crop/Rect mode)
        try:
            x = int(float(request.form.get('x')))
            y = int(float(request.form.get('y')))
            w = int(float(request.form.get('w')))
            h = int(float(request.form.get('h')))
            
            if img is not None:
                mask = np.zeros(img.shape[:2], dtype=np.uint8)
                cv2.rectangle(mask, (x, y), (x + w, y + h), (255, 255, 255), -1)
        except (ValueError, TypeError):
             return jsonify({'status': 'error', 'message': 'Invalid parameters: provide mask or coordinates'}), 400

    if img is not None and mask is not None:
        # Perform Action based on type
        action_type = request.form.get('action_type', 'remove') # 'remove' or 'mosaic'
        
        if action_type == 'mosaic':
            # Mosaic Effect
            h, w = img.shape[:2]
            mosaic_scale = 0.05
            
            # Ensure safe dimensions (at least 1 pixel)
            small_w = max(1, int(w * mosaic_scale))
            small_h = max(1, int(h * mosaic_scale))
            
            small = cv2.resize(img, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
            mosaic_img = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
            
            # Combine
            mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
            result_img = np.where(mask_3ch > 0, mosaic_img, img)
            
        else:
            # Default: Watermark Removal (Inpainting)
            result_img = cv2.inpaint(img, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # Encode the result image to a memory buffer
        _, buffer = cv2.imencode('.png', result_img)
        
        # Convert the buffer to a base64 string
        img_str = base64.b64encode(buffer).decode('utf-8')
        
        # Create the data URL
        data_url = 'data:image/png;base64,' + img_str

        return jsonify({'status': 'success', 'image': data_url})
    
    return jsonify({'status': 'error', 'message': 'An unknown error occurred or inputs were invalid'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5002)
