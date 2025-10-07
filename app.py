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

    try:
        x = int(float(request.form.get('x')))
        y = int(float(request.form.get('y')))
        w = int(float(request.form.get('w')))
        h = int(float(request.form.get('h')))
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'Invalid coordinate data'}), 400

    if file:
        filestr = file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

        mask = np.zeros(img.shape[:2], dtype=np.uint8)
        cv2.rectangle(mask, (x, y), (x + w, y + h), (255, 255, 255), -1)

        result_img = cv2.inpaint(img, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # Encode the result image to a memory buffer
        _, buffer = cv2.imencode('.png', result_img)
        
        # Convert the buffer to a base64 string
        img_str = base64.b64encode(buffer).decode('utf-8')
        
        # Create the data URL
        data_url = 'data:image/png;base64,' + img_str

        return jsonify({'status': 'success', 'image': data_url})
    
    return jsonify({'status': 'error', 'message': 'An unknown error occurred'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
