# -*- coding: utf-8 -*-
import io
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

SUPABASE_URL = "https://nlpsvjweybdmkmrkfkyy.supabase.co"
SUPABASE_KEY = "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P"
STORAGE_PREFIX = f"{SUPABASE_URL}/storage/v1/object/public/joyas/"

def get_all_product_image_urls():
    url = f"{SUPABASE_URL}/rest/v1/productos?select=id,titulo,foto_principal,galeria_fotos"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    with urllib.request.urlopen(req) as resp:
        products = json.loads(resp.read().decode("utf-8"))
    
    unique_storage_paths = set()
    for p in products:
        foto = p.get("foto_principal")
        if foto and foto.startswith(STORAGE_PREFIX):
            path = foto[len(STORAGE_PREFIX):]
            unique_storage_paths.add(path)
        
        gallery = p.get("galeria_fotos")
        if isinstance(gallery, list):
            for g in gallery:
                if g and g.startswith(STORAGE_PREFIX):
                    path = g[len(STORAGE_PREFIX):]
                    unique_storage_paths.add(path)
                    
    return sorted(list(unique_storage_paths))

def check_and_compress(storage_path):
    public_url = f"{STORAGE_PREFIX}{storage_path}"
    # 1. Check size via HEAD request
    try:
        head_req = urllib.request.Request(public_url, method="HEAD")
        with urllib.request.urlopen(head_req, timeout=10) as head_resp:
            content_len = int(head_resp.headers.get("Content-Length") or 0)
    except Exception as e:
        return {"path": storage_path, "status": "head_error", "error": str(e)}

    # If smaller than 250KB, it's already well optimized!
    if content_len <= 250 * 1024:
        return {"path": storage_path, "status": "skipped", "orig_bytes": content_len}

    # 2. Download original image
    try:
        get_req = urllib.request.Request(public_url)
        with urllib.request.urlopen(get_req, timeout=20) as resp:
            raw_bytes = resp.read()
    except Exception as e:
        return {"path": storage_path, "status": "download_error", "error": str(e)}

    orig_size = len(raw_bytes)

    # 3. Compress with Pillow
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        orig_dims = img.size

        # Convert to RGB (handles RGBA, P, etc.)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        # Downscale if larger than 1200px
        img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        new_dims = img.size

        out_io = io.BytesIO()
        img.save(out_io, format="JPEG", quality=82, optimize=True)
        compressed_bytes = out_io.getvalue()
        new_size = len(compressed_bytes)

        # Only upload if compressed is actually smaller
        if new_size >= orig_size:
            return {"path": storage_path, "status": "no_reduction", "orig_bytes": orig_size}

        # 4. Upload back to Supabase Storage with upsert: true
        # Ensure path is URL-encoded for safety if needed, but storage_path usually has slashes
        # Supabase API expects path after /storage/v1/object/joyas/
        upload_url = f"{SUPABASE_URL}/storage/v1/object/joyas/{urllib.parse.quote(storage_path, safe='/')}"
        upload_req = urllib.request.Request(
            upload_url,
            data=compressed_bytes,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "image/jpeg",
                "x-upsert": "true"
            },
            method="POST"
        )
        with urllib.request.urlopen(upload_req, timeout=15) as up_resp:
            if up_resp.getcode() in (200, 201):
                savings_pct = (1 - new_size / orig_size) * 100
                return {
                    "path": storage_path,
                    "status": "compressed",
                    "orig_bytes": orig_size,
                    "new_bytes": new_size,
                    "orig_dims": orig_dims,
                    "new_dims": new_dims,
                    "savings_pct": round(savings_pct, 1)
                }
            else:
                return {"path": storage_path, "status": "upload_fail_code", "code": up_resp.getcode()}
    except Exception as e:
        return {"path": storage_path, "status": "process_error", "error": str(e)}

def main():
    print("=== YAMIKI JOYERIA - IMAGE OPTIMIZER & COMPRESSOR ===")
    print("1. Fetching all catalog image paths from Supabase...")
    paths = get_all_product_image_urls()
    print(f"Total unique Supabase image paths: {len(paths)}")

    print("\n2. Checking sizes and compressing heavy images (>250 KB)...")
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(check_and_compress, p): p for p in paths}
        for future in as_completed(futures):
            res = future.result()
            results.append(res)
            if res["status"] == "compressed":
                print(f" -> Optimized: {res['path']} | {res['orig_bytes']/1024:.0f}KB -> {res['new_bytes']/1024:.0f}KB (-{res['savings_pct']}%)")
            elif res["status"] == "head_error":
                print(f" [!] HEAD Error on {res['path']}: {res.get('error')}")

    compressed_items = [r for r in results if r["status"] == "compressed"]
    skipped_items = [r for r in results if r["status"] == "skipped"]
    total_orig = sum(r["orig_bytes"] for r in compressed_items)
    total_new = sum(r["new_bytes"] for r in compressed_items)
    saved_bytes = total_orig - total_new

    print("\n" + "="*50)
    print(f"OPTIMIZATION COMPLETE SUMMARY:")
    print(f"Total images checked: {len(results)}")
    print(f"Already lightweight (<=250KB): {len(skipped_items)}")
    print(f"Heavy images compressed & replaced: {len(compressed_items)}")
    if total_orig > 0:
        print(f"Total size before: {total_orig / (1024*1024):.2f} MB")
        print(f"Total size after:  {total_new / (1024*1024):.2f} MB")
        print(f"Total bandwidth saved: {saved_bytes / (1024*1024):.2f} MB ({saved_bytes/total_orig*100:.1f}% reduction)")
    print("="*50)

if __name__ == "__main__":
    main()
