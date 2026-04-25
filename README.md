LearnLingo
Introduction

LearnLingo là hệ thống học ngoại ngữ online với các vai trò:

Student: học và đăng ký khóa học
Teacher: tạo và quản lý khóa học
Admin: quản lý người dùng

Backend dùng Flask + Oracle, frontend dùng HTML/CSS/JS.

Tech Stack
Backend: Flask, Oracle DB
Frontend: HTML, CSS, JavaScript
Security: JWT (RS256), AES (Fernet), RBAC, Oracle VPD
Setup
1. Install
pip install flask flask-cors oracledb cryptography pyjwt
2. Config DB (API(2).py)
DB_USER = "english_web_test"
DB_PASSWORD = "123"
DB_DSN = "localhost:1521/orcl"
3. Generate RSA key
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
4. Run backend
python API(2).py
5. Run frontend

Mở file index(2).html

Main Features
Authentication (login/register/reset password)
Course management (teacher)
Course enrollment (student)
Role-based access control
Secure quiz system
API
GET /api/courses
POST /api/courses
POST /api/login
POST /api/register
Notes
Yêu cầu Oracle Database
Dùng cho mục đích học tập / demo
