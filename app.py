import requests

BACKEND_URL = "http://localhost:5000/health"  # adjust if running in Docker or remote

try:
    res = requests.get(BACKEND_URL, timeout=5)
    res.raise_for_status()
    data = res.json()
    print("✅ Backend is running!")
    print("Health response:", data)
except Exception as e:
    print("❌ Backend check failed:", e)
