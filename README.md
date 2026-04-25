LearnLingo - Online Language Learning System
Introduction

LearnLingo là một hệ thống học ngoại ngữ trực tuyến cho phép:

Học viên đăng ký và học khóa học
Giáo viên tạo và quản lý khóa học
Admin quản lý người dùng và hệ thống
Tích hợp nhiều cơ chế bảo mật

Project được xây dựng theo mô hình client-server với backend Flask và Oracle Database.

System Architecture
Frontend (HTML/CSS/JS)
        ↓
 REST API (Flask)
        ↓
Oracle Database
Project Structure
.
├── API(2).py              # Backend Flask API
├── index(2).html          # Giao diện chính
├── jvs(2).js              # Logic frontend
├── st(2).css              # Styling
├── english_web_test.sql   # Database schema
├── sys(2).sql             # Trigger / system logic
├── private_key.pem        # RSA private key
├── public_key.pem         # RSA public key
Technologies Used
Backend
Python (Flask)
Oracle Database
JWT (RS256)
Cryptography (AES - Fernet)
Frontend
HTML5
CSS3
JavaScript (Vanilla)
Security
Role-based Access Control (RBAC)
Oracle Virtual Private Database (VPD)
AES Encryption
RSA Encryption
Secure Quiz mechanism
Installation & Setup
1. Clone repository
git clone <your-repo-url>
cd learnlingo
2. Install dependencies
pip install flask flask-cors oracledb cryptography pyjwt
3. Configure database

Mở file API(2).py và chỉnh:

DB_USER = "english_web_test"
DB_PASSWORD = "123"
DB_DSN = "localhost:1521/orcl"
4. Generate RSA keys
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
5. Run backend
python API(2).py

Server chạy tại:

http://localhost:5000
6. Run frontend

Mở file:

index(2).html

Hoặc dùng Live Server trong VSCode.

Authentication & Authorization
Sử dụng header:
X-User-ID
Backend kiểm tra quyền bằng decorator:
@role_required('teacher')
Security Mechanisms
AES Encryption
Sử dụng Fernet để mã hóa dữ liệu nhạy cảm
JWT (RS256)
Dùng private/public key để ký và verify token
Oracle VPD
Set context user trong database
Giới hạn dữ liệu theo role
Main API Endpoints
Public APIs
Endpoint	Method	Description
/api/statistics	GET	Lấy thống kê hệ thống
/api/courses	GET	Danh sách khóa học
/api/languages	GET	Danh sách ngôn ngữ
Authentication
Endpoint	Method	Description
/api/login	POST	Đăng nhập
/api/register	POST	Đăng ký
/api/forgot-password	POST	Quên mật khẩu
/api/reset-password	POST	Đặt lại mật khẩu
Student
Endpoint	Method	Description
/api/enroll	POST	Đăng ký khóa học
Teacher
Endpoint	Method	Description
/api/courses	POST	Tạo khóa học
/api/teacher/courses	GET	Danh sách khóa học của giáo viên
Features
Student
Đăng ký / đăng nhập
Mua khóa học
Làm bài tập và bài thi
Theo dõi tiến độ học
Teacher
Tạo và quản lý khóa học
Upload nội dung
Tạo bài tập và bài thi
Admin
Quản lý người dùng
Khóa / mở tài khoản
Audit log từ database trigger
