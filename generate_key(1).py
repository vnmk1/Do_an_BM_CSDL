# File: generate_key.py
from cryptography.fernet import Fernet

key = Fernet.generate_key()
print("Key của bạn (sao chép và dán vào API.py):")
print(key.decode())