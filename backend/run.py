import os
import sys
import uvicorn

if __name__ == "__main__":
    # Ensure current directory is in sys.path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"Starting Nihon Backend on http://{host}:{port}")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
