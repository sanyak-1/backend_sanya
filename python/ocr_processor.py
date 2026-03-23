import sys
import os
import json
import cv2
import numpy as np
from PIL import Image

# ══════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ══════════════════════════════════════════════════════════
if len(sys.argv) < 2:
    print(json.dumps({"success": False, "error": "Usage: ocr_processor.py <file_path> <poppler_path>"}))
    sys.exit(1)

FILE_PATH = sys.argv[1]
POPPLER_PATH = sys.argv[2] if len(sys.argv) > 2 else None

# Global reader instance (lazy-loaded)
READER = None

# ══════════════════════════════════════════════════════════
# EASYOCR INITIALIZATION (Project-Local Storage)
# ══════════════════════════════════════════════════════════
def get_reader():
    """
    Lazy initialization of EasyOCR Reader with project-local model storage
    Models will be stored in: DocuMind/easyocr_models/
    """
    global READER
    if READER is None:
        import easyocr
        
        # ✅ Store models in project directory (not system-wide)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_storage_dir = os.path.join(project_root, 'easyocr_models')
        
        # Create directory if it doesn't exist
        os.makedirs(model_storage_dir, exist_ok=True)
        
        print(f"📦 EasyOCR model storage: {model_storage_dir}", file=sys.stderr)
        
        try:
            print("📥 Initializing EasyOCR...", file=sys.stderr)
            READER = easyocr.Reader(
                ['en'],
                gpu=False,  # Set to True if you have CUDA GPU
                verbose=False,
                quantize=True,
                download_enabled=True,
                model_storage_directory=model_storage_dir
            )
            print("✅ EasyOCR initialized successfully", file=sys.stderr)
        except Exception as e:
            print(f"❌ EasyOCR initialization failed: {e}", file=sys.stderr)
            raise
    
    return READER

# ══════════════════════════════════════════════════════════
# OPENCV PREPROCESSING
# ══════════════════════════════════════════════════════════
def preprocess_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    
    # 1. Convert to Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Rescale (Zoom in 2x) - This helps with small decimals!
    height, width = gray.shape[:2]
    gray = cv2.resize(gray, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
    
    # ✅ FIX: Also resize the original 'img' so table cropping coordinates match!
    img = cv2.resize(img, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
    
    # 3. Increase Contrast (Make text blacker, background whiter)
    alpha = 1.5 # Contrast control
    beta = 0    # Brightness control
    adjusted = cv2.convertScaleAbs(gray, alpha=alpha, beta=beta)
    
    # 4. Thresholding to remove shadows
    _, thresh = cv2.threshold(adjusted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return img, thresh

# ══════════════════════════════════════════════════════════
# TABLE DETECTION
# ══════════════════════════════════════════════════════════
def detect_tables(image, thresh):
    """Detect table regions using morphological operations"""
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    
    horizontal_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
    vertical_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vertical_kernel, iterations=2)
    
    table_mask = cv2.addWeighted(horizontal_lines, 0.5, vertical_lines, 0.5, 0.0)
    _, table_mask = cv2.threshold(table_mask, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    contours, _ = cv2.findContours(table_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    tables = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w > 100 and h > 50:  # Minimum table size
            tables.append((x, y, w, h))
    
    return tables

def erase_table_lines(table_crop, thresh_crop):
    """Remove grid lines from table for cleaner OCR"""
    working_image = thresh_crop.copy()
    
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    horizontal_lines = cv2.morphologyEx(working_image, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
    
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    vertical_lines = cv2.morphologyEx(working_image, cv2.MORPH_OPEN, vertical_kernel, iterations=2)
    
    lines = cv2.addWeighted(horizontal_lines, 1, vertical_lines, 1, 0.0)
    
    line_erased = working_image.copy()
    line_erased[lines > 0] = 255
    line_erased = cv2.GaussianBlur(line_erased, (3, 3), 0)
    
    return line_erased

# ══════════════════════════════════════════════════════════
# EASYOCR TEXT EXTRACTION
# ══════════════════════════════════════════════════════════
def extract_text_with_easyocr(image_path):
    """
    Extract text using EasyOCR with maximum accuracy settings
    Returns: {text, words, tables}
    """
    # 🚀 NEW: original & thresh are now zoomed 2x!
    original, thresh = preprocess_image(image_path)
    
    # Detect tables
    table_regions = detect_tables(original, thresh)
    tables_data = []
    base_path = os.path.splitext(image_path)[0]
    
    # Process tables separately
    for idx, (x, y, w, h) in enumerate(table_regions):
        table_crop = original[y:y+h, x:x+w]
        thresh_crop = thresh[y:y+h, x:x+w]
        
        table_path = f"{base_path}_table_{idx}.png"
        cv2.imwrite(table_path, table_crop)
        
        line_erased = erase_table_lines(table_crop, thresh_crop)
        erased_path = f"{base_path}_table_{idx}_erased.png"
        cv2.imwrite(erased_path, line_erased)
        
        tables_data.append({
            # Scale coordinates back to 1x for Node.js
            "x": int(x // 2),
            "y": int(y // 2),
            "width": int(w // 2),
            "height": int(h // 2),
            "path": table_path,
            "erasedPath": erased_path
        })
    
    # Get EasyOCR reader
    reader = get_reader()
    
    # Anti-hallucination allowlist
    allowlist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,!?@#$%&*()[]{}:;"\'-/\\+='
    
    # 🚀 NEW: EASYOCR EXTRACTION WITH YOUR UPDATED SETTINGS
    results = reader.readtext(
        original,              # Pass the 2x zoomed image for maximum detail
        detail=1,              # Return bounding boxes + confidence
        paragraph=False,       # Word-level detection (required for table parsing)
        min_size=10,           
        text_threshold=0.7,    
        low_text=0.4,          
        link_threshold=0.4,    
        canvas_size=2560,      
        mag_ratio=2.5,         # 🚀 Increased from 2.0
        slope_ths=0.1,         
        ycenter_ths=0.5,       
        height_ths=0.5,        
        width_ths=0.5,         
        add_margin=0.1,        
        contrast_ths=0.1,      
        adjust_contrast=0.7,   # 🚀 Increased contrast handling
        decoder='beamsearch',  # 🚀 Added beamsearch for tiny symbols
        allowlist=allowlist    
    )
    
    # Convert EasyOCR format to word-level data
    words = []
    full_text_lines = []
    
    for detection in results:
        bbox, text, confidence = detection
        
        x_coords = [point[0] for point in bbox]
        y_coords = [point[1] for point in bbox]
        
        x = int(min(x_coords))
        y = int(min(y_coords))
        width = int(max(x_coords) - min(x_coords))
        height = int(max(y_coords) - min(y_coords))
        
        word_data = {
            "text": text.strip(),
            # ✅ Downscale coordinates back to 1x space for the Node.js structural tree
            "x": x // 2,
            "y": y // 2,
            "width": width // 2,
            "height": height // 2,
            "confidence": int(confidence * 100),  
            "line": 0,  
            "block": 0
        }
        
        if word_data["text"]: 
            words.append(word_data)
            full_text_lines.append(word_data["text"])
    
    words.sort(key=lambda w: (w['y'], w['x']))
    full_text = ' '.join(full_text_lines)
    
    return {
        "text": full_text,
        "words": words,
        "tables": tables_data
    }

# ══════════════════════════════════════════════════════════
# PDF PROCESSING
# ══════════════════════════════════════════════════════════
def extract_text_from_pdf(pdf_path):
    """Extract text from multi-page PDFs"""
    from pdf2image import convert_from_path
    
    convert_kwargs = {"dpi": 300, "fmt": "png"}
    if POPPLER_PATH:
        convert_kwargs["poppler_path"] = POPPLER_PATH
    
    pages = convert_from_path(pdf_path, **convert_kwargs)
    all_pages_data = []
    full_text = ""
    
    for page_num, page_image in enumerate(pages, start=1):
        temp_path = f"{pdf_path}_page_{page_num}.png"
        page_image.save(temp_path, "PNG")
        
        try:
            page_data = extract_text_with_easyocr(temp_path)
            all_pages_data.append({
                "page": page_num,
                "text": page_data["text"],
                "words": page_data["words"],
                "tables": page_data["tables"]
            })
            full_text += f"\n--- Page {page_num} ---\n{page_data['text']}"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    return {
        "text": full_text,
        "pages": all_pages_data
    }

# ══════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════
def main():
    """Main execution function"""
    if not os.path.exists(FILE_PATH):
        raise FileNotFoundError(f"File not found: {FILE_PATH}")
    
    ext = os.path.splitext(FILE_PATH)[1].lower()
    
    if ext == '.pdf':
        result = extract_text_from_pdf(FILE_PATH)
        output = {
            "success": True,
            "text": result["text"],
            "pages": result["pages"],
            "fileType": ext,
            "charCount": len(result["text"])
        }
    elif ext in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']:
        result = extract_text_with_easyocr(FILE_PATH)
        output = {
            "success": True,
            "text": result["text"],
            "pages": [{
                "page": 1,
                "text": result["text"],
                "words": result["words"],
                "tables": result["tables"]
            }],
            "fileType": ext,
            "charCount": len(result["text"])
        }
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    
    # ✅ Output JSON to stdout (Node.js reads this)
    print(json.dumps(output))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(json.dumps({
            "success": False,
            "error": str(e),
            "traceback": error_details
        }), file=sys.stderr)
        sys.exit(1)