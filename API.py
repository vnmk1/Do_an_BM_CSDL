import oracledb
from flask import Flask, jsonify, request
from flask_cors import CORS
import re
import traceback # Thêm để in traceback chi tiết
from functools import wraps # Thêm import này
from cryptography.fernet import Fernet
import jwt
import datetime
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64
import os

# ==============================================================================
# CAU HINH CSDL ORACLE
# ==============================================================================
DB_USER = "english_web_test"
DB_PASSWORD = "123"
DB_DSN = "localhost:1521/orcl"

# Khoi tao connection pool
try:
    pool = oracledb.create_pool(user=DB_USER, password=DB_PASSWORD, dsn=DB_DSN, min=2, max=5, wait_timeout=5000)
    print(">>> Connection pool created successfully.")
except Exception as e:
    print(f"!!! LOI KHI KHOI TAO CONNECTION POOL: {e}")
    pool = None

app = Flask(__name__)
# Cấu hình CORS chặt chẽ hơn nếu cần, ví dụ: CORS(app, origins="http://127.0.0.1:5501")
CORS(app)

# ==============================================================================
# CAU HINH MA HOA DOI XUNG (AES) - (Thêm phần này)
# ==============================================================================
# !!! DÁN KEY BẠN VỪA TẠO Ở BƯỚC 2 VÀO ĐÂY !!!
# (Lưu ý: Trong dự án thật, key này nên đọc từ biến môi trường, không nên viết cứng)
SYMMETRIC_KEY = b'fraPEbNsFGZF9z7q-xWwcTXNUK3qxrUvFkEc7ViUVGk='  # <-- THAY THẾ KEY CỦA BẠN VÀO ĐÂY

try:
    f = Fernet(SYMMETRIC_KEY)
    print(">>> Khoi tao ma hoa doi xung thanh cong.")
except Exception as e:
    print(f"!!! LOI KHI KHOI TAO MA HOA: {e}")
    f = None

def encrypt_data(data_str):
    """(Helper) Mã hóa một chuỗi (str) thành token (str)"""
    if f is None or data_str is None: return None
    try:
        token_bytes = f.encrypt(data_str.encode('utf-8'))
        return token_bytes.decode('utf-8')
    except Exception as e:
        print(f"!!! Loi khi ma hoa: {e}")
        return None

def decrypt_data(token_str):
    """(Helper) Giải mã một token (str) về chuỗi gốc (str)"""
    if f is None or token_str is None: return None
    try:
        data_bytes = f.decrypt(token_str.encode('utf-8'))
        return data_bytes.decode('utf-8')
    except Exception as e:
        # Lỗi phổ biến nhất là InvalidToken (nếu key sai hoặc dữ liệu không phải là mã hóa)
        print(f"!!! Loi khi giai ma: {e}")
        return None

#==============================================================================
#   CAU HINH MA HOA BAT DOI XUNG (JWT-RS256)
# ==============================================================================
try:
    # Đổi 'as f' thành 'as key_file'
    with open('private_key.pem', 'rb') as key_file:
        PRIVATE_KEY = key_file.read()
        
    with open('public_key.pem', 'rb') as key_file:
        PUBLIC_KEY = key_file.read()
        
    print(">>> Tai xong Private/Public keys cho JWT (RS256) thanh cong.")

except FileNotFoundError:
    print("!!! LOI: Khong tim thay 'private_key.pem' hoac 'public_key.pem'.")
    print("!!! Ban can chay 2 lenh OpenSSL de tao ra chung.")
    PRIVATE_KEY = None
    PUBLIC_KEY = None
except Exception as e:
    print(f"!!! LOI KHI TAI KEY JWT: {e}")
    PRIVATE_KEY = None
    PUBLIC_KEY = None

# ==============================================================================
# HAM HELPER DE TRUY VAN CSDL (Đã sửa lỗi đóng cursor)
# ==============================================================================
def db_query(sql, params=(), fetch_one=False):
    """
    Ham tien ich de chay truy van Oracle va tra ve ket qua dang dictionary.
    """
    if pool is None:
        print("!!! db_query Error: Connection pool is None.")
        # Ném lỗi ra ngoài để Flask bắt và trả về 500 rõ ràng hơn
        raise Exception("Lỗi hệ thống: Kết nối CSDL chưa sẵn sàng.")

    connection = None
    cursor = None
    is_dml = None # Khởi tạo biến is_dml
    try:
        # Lấy kết nối từ pool
        connection = pool.acquire()
        cursor = connection.cursor()

        # Thực thi truy vấn
        # print(f"--- Executing SQL: {sql} with params: {params}") # Bỏ comment để debug SQL
        cursor.execute(sql, params)

        # Xử lý INSERT/UPDATE/DELETE
        # Dùng cursor.rowcount > 0 để kiểm tra thay vì regex nếu chỉ cần biết có thay đổi không
        is_dml = re.match(r"^\s*(INSERT|UPDATE|DELETE)", sql, re.IGNORECASE)
        if is_dml:
            connection.commit()
            # Trả về số dòng bị ảnh hưởng (tùy chọn)
            # rowcount = cursor.rowcount
            return {"success": True} #, "rows_affected": rowcount}

        # Xử lý SELECT
        # Lấy tên cột (chỉ thực hiện nếu cursor.description không None)
        columns = [col[0].lower() for col in cursor.description] if cursor.description else []

        if fetch_one:
            row = cursor.fetchone()
            return dict(zip(columns, row)) if row else None
        else:
            # fetchall trả về list rỗng nếu không có kết quả, không cần kiểm tra None
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    except oracledb.DatabaseError as db_err:
        error, = db_err.args
        print(f"!!! Loi Oracle khi thuc thi SQL: {sql}")
        print(f"!!! Params: {params}")
        print(f"!!! Ma loi: {error.code}, Tin nhan: {error.message}")
        # Rollback nếu là lệnh DML và có lỗi
        if connection and is_dml:
             try: connection.rollback()
             except: pass # Bỏ qua nếu rollback lỗi
        # Ném lỗi ra để Flask trả về 500 kèm thông báo lỗi CSDL
        raise oracledb.DatabaseError(f"Lỗi CSDL: {error.message}") from db_err

    except Exception as e:
        print(f"!!! Loi Python chung khi thuc thi SQL: {sql}")
        print(f"!!! Params: {params}")
        print(f"!!! Loi Python: {e}")
        traceback.print_exc()
        # Ném lỗi chung ra để Flask trả về 500
        raise Exception(f"Lỗi server không xác định: {e}") from e

    finally:
        # Đóng cursor và giải phóng kết nối LUÔN LUÔN ở đây
        if cursor:
            try: cursor.close()
            except oracledb.Error as close_err: print(f"--- Canh bao: Loi khi dong cursor: {close_err}")
        if connection:
            try: pool.release(connection)
            except Exception as release_err: print(f"--- Canh bao: Loi khi release connection: {release_err}")

# ==============================================================================
# DECORATOR KIỂM TRA QUYỀN (ĐÃ SỬA ĐỂ CHẤP NHẬN NHIỀU VAI TRÒ)
# ==============================================================================
def role_required(*required_roles): # Chấp nhận một hoặc nhiều vai trò (vd: 'admin', 'student')
    """
    Decorator kiểm tra vai trò người dùng dựa trên header X-User-ID.
    Cho phép truy cập nếu người dùng có BẤT KỲ vai trò nào trong danh sách required_roles.
    """
    def decorator(f):
        @wraps(f) # Sử dụng wraps để giữ thông tin của hàm gốc
        def decorated_function(*args, **kwargs):
            user_id_str = request.headers.get('X-User-ID') # Lấy user_id từ header
            if not user_id_str:
                print("!!! Role Check Failed: Missing X-User-ID header")
                return jsonify({"error": "Thiếu thông tin xác thực (User-ID)"}), 401 # Lỗi 401

            try:
                user_id = int(user_id_str) # Chuyển đổi user_id sang số nguyên
            except ValueError:
                 print(f"!!! Role Check Failed: Invalid X-User-ID format: {user_id_str}")
                 return jsonify({"error": "Định dạng User-ID không hợp lệ"}), 400

            # Kiểm tra vai trò trong CSDL
            sql = "SELECT r.role_name FROM User_roles ur JOIN Roles r ON ur.role_id = r.role_id WHERE ur.user_id = :1"
            user_info = db_query(sql, (user_id,), fetch_one=True)

            # Xử lý trường hợp không tìm thấy user hoặc role_name là None
            if not user_info or not user_info.get('role_name'):
                 print(f"!!! Role Check Failed: User {user_id} not found or has no role.")
                 return jsonify({"error": "Người dùng không tồn tại hoặc chưa được gán vai trò"}), 403 # Lỗi 403

            current_role = user_info.get('role_name').lower() # Lấy role và chuyển sang chữ thường
            
            # Chuyển các vai trò yêu cầu sang chữ thường
            required_roles_lower = [r.lower() for r in required_roles]
            
            # Kiểm tra xem vai trò hiện tại có trong danh sách yêu cầu không
            if current_role not in required_roles_lower:
                print(f"!!! Role Check Failed: User {user_id} ({current_role}) required one of '{', '.join(required_roles)}'.")
                return jsonify({"error": f"Yêu cầu quyền: {', '.join(required_roles)}"}), 403 # Lỗi 403

            # Thêm user_id vào kwargs để hàm API có thể sử dụng
            kwargs['current_user_id'] = user_id
            print(f"--- Role Check Success: User {user_id} is '{current_role}'.")
            return f(*args, **kwargs) # Gọi hàm API gốc
        return decorated_function
    return decorator


# ==============================================================================
# CAC API ENDPOINTS (Đã sửa lỗi và thêm API /languages)
# ==============================================================================

@app.route("/api/statistics", methods=["GET"])
def get_statistics():
    """API lay thong ke cho trang chu."""
    try:
        # Sử dụng tuple unpacking để lấy giá trị count an toàn hơn
        students_result = db_query("SELECT COUNT(*) AS count FROM User_roles WHERE role_id = 3", fetch_one=True)
        teachers_result = db_query("SELECT COUNT(*) AS count FROM User_roles WHERE role_id = 2", fetch_one=True)
        courses_result = db_query("SELECT COUNT(*) AS count FROM Courses", fetch_one=True)
        languages_result = db_query("SELECT COUNT(*) AS count FROM Languages", fetch_one=True)

        # Trả về 0 nếu kết quả là None
        students_count = students_result['count'] if students_result else 0
        teachers_count = teachers_result['count'] if teachers_result else 0
        courses_count = courses_result['count'] if courses_result else 0
        languages_count = languages_result['count'] if languages_result else 0

        return jsonify({
            "students": students_count,
            "teachers": teachers_count,
            "courses": courses_count,
            "languages": languages_count
        })
    except Exception as e:
         # Hàm db_query đã in lỗi, chỉ cần trả về lỗi 500
         return jsonify({"error": f"Lỗi server khi lấy thống kê: {str(e)}"}), 500

@app.route("/api/languages", methods=["GET"])
def get_languages():
    """API lấy danh sách tất cả ngôn ngữ."""
    try:
        sql = "SELECT language_id, name FROM Languages ORDER BY name"
        languages = db_query(sql)
        # db_query trả về list rỗng nếu không có data, trả về None nếu lỗi trước khi fetch
        if languages is None:
             # Lỗi đã được db_query xử lý và ném ra, khối catch sẽ bắt
             # Hoặc có thể trả về lỗi ở đây nếu muốn thông báo khác
             return jsonify({"error": "Không thể lấy danh sách ngôn ngữ"}), 500
        return jsonify(languages) # Trả về list (có thể rỗng)
    except Exception as e:
        return jsonify({"error": f"Lỗi server khi lấy ngôn ngữ: {str(e)}"}), 500


# --- API Khóa học ---
@app.route("/api/courses", methods=["GET"])
def get_courses():
    """API lay tat ca khoa hoc (Phien ban FIX LOI TOAN DIEN)."""
    try:
        # SỬA LẠI SQL: Xử lý CLOB, Null và Join an toàn
        sql = """
            SELECT
                c.course_id, 
                c.title, 
                TO_CHAR(c.description) as description,  -- Ép kiểu CLOB sang String
                COALESCE(c.fee, 0) as fee,              -- Nếu Fee null thì tính là 0
                COALESCE(u.full_name, 'Chưa cập nhật') as teacher_name, -- Tránh lỗi thiếu tên GV
                COALESCE(l.name, 'Chung') as language_name,             -- Tránh lỗi thiếu ngôn ngữ
                (SELECT COUNT(*) FROM DK_COURSES dk WHERE dk.course_id = c.course_id) as enrollments
            FROM Courses c
            LEFT JOIN Users u ON c.teacher_id = u.user_id       -- Dùng LEFT JOIN để lỡ mất teacher vẫn hiện khóa học
            LEFT JOIN Languages l ON c.language_id = l.language_id
            ORDER BY c.course_id DESC
        """
        
        courses = db_query(sql)
        
        # In ra terminal để kiểm tra xem có lấy được dữ liệu không
        print(f"--- Debug: Lay duoc {len(courses) if courses else 0} khoa hoc tu DB.")
        
        if courses is None: 
            return jsonify({"error": "Lỗi truy vấn CSDL"}), 500
            
        return jsonify(courses) 

    except Exception as e:
        print(f"!!! LOI NGHIEM TRONG KHI LAY KHOA HOC: {e}")
        import traceback
        traceback.print_exc() # In chi tiết lỗi ra Terminal
        return jsonify({"error": f"Lỗi server: {str(e)}"}), 500

@app.route("/api/courses", methods=["POST"])
@role_required('teacher') # Chỉ teacher mới được gọi
def create_course(current_user_id): # Nhận current_user_id từ decorator
    """API tạo khóa học mới - Chỉ dành cho teacher."""
    data = request.json
    title = data.get('title')
    description = data.get('description')
    language_id_str = data.get('language_id') # Lấy language_id dạng chuỗi từ JSON
    fee_str = data.get('fee')

    # --- Validation Input ---
    if not title or not language_id_str:
        return jsonify({"error": "Thiếu tiêu đề hoặc ngôn ngữ"}), 400
    try:
        # Chuyển đổi language_id và fee sang kiểu số
        language_id = int(language_id_str)
        # Xử lý fee: nếu không có thì mặc định là 0, nếu có thì chuyển đổi
        fee = float(fee_str) if fee_str is not None else 0.0
        if fee < 0: raise ValueError("Học phí không được âm")
    except (ValueError, TypeError) as ve:
         return jsonify({"error": f"Dữ liệu không hợp lệ: {ve}"}), 400

    # Dùng current_user_id đã được xác thực từ decorator
    teacher_id = current_user_id
    connection = None # Khởi tạo để dùng trong finally nếu cần
    cursor = None # Khởi tạo cursor

    try:
        sql = """
            INSERT INTO Courses (title, description, teacher_id, language_id, fee, create_at)
            VALUES (:1, :2, :3, :4, :5, SYSDATE)
            RETURNING course_id INTO :new_id
        """
        # Sử dụng connection và cursor riêng để xử lý RETURNING
        connection = pool.acquire()
        cursor = connection.cursor()
        new_id_var = cursor.var(oracledb.NUMBER) # Dùng oracledb.NUMBER rõ ràng hơn
        cursor.execute(sql, (title, description, teacher_id, language_id, fee, new_id_var))
        # Lấy giá trị trả về, getvalue() trả về list
        new_course_id = int(new_id_var.getvalue()[0]) if new_id_var.getvalue() else None
        connection.commit()
        # cursor.close() # Sẽ close trong finally
        # pool.release(connection) # Sẽ release trong finally
        # connection = None # Đánh dấu đã release thành công

        if new_course_id is not None:
            return jsonify({"success": True, "message": "Tạo khóa học thành công", "course_id": new_course_id}), 201
        else:
            # Trường hợp hiếm gặp: INSERT thành công nhưng không lấy được ID
             print("!!! Warning: Course created but failed to retrieve new ID.")
             return jsonify({"success": True, "message": "Tạo khóa học thành công nhưng không lấy được ID mới"}), 200

    except oracledb.DatabaseError as db_err:
        error, = db_err.args
        # Bắt lỗi trigger cụ thể
        if error.code == -20001: # Mã lỗi -20001 bạn đặt trong trigger
             print(f"--- Trigger Error (-20001) caught for user {teacher_id}.")
             return jsonify({"error": "Chỉ giáo viên mới được tạo khóa học (Lỗi Trigger)"}), 403
        else:
            # In lỗi Oracle chi tiết
            print(f"!!! Loi Oracle khi tao khoa hoc: {db_err}")
            return jsonify({"error": f"Lỗi CSDL khi tạo khóa học: {error.message}"}), 500
    except Exception as e:
        print(f"!!! Loi Python khi tao khoa hoc: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Lỗi server không xác định: {str(e)}"}), 500
    finally:
         # Đảm bảo connection được release nếu có lỗi xảy ra trước khi release thành công
         if cursor:
             try: cursor.close()
             except: pass
         if connection:
             try: pool.release(connection)
             except Exception as release_err: print(f"--- Canh bao: Loi release connection trong finally (create_course): {release_err}")


@app.route("/api/teacher/courses", methods=["GET"])
@role_required('teacher') # Chỉ teacher mới được xem
def get_teacher_courses(current_user_id):
    """API lấy các khóa học do giáo viên hiện tại tạo."""
    try:
        # current_user_id đã được decorator xác thực và truyền vào
        sql = """
            SELECT
                c.course_id, c.title, c.description, c.fee, c.create_at,
                l.name as language_name,
                (SELECT COUNT(*) FROM DK_COURSES dk WHERE dk.course_id = c.course_id) as enrollments
            FROM Courses c
            JOIN Languages l ON c.language_id = l.language_id
            WHERE c.teacher_id = :1
            ORDER BY c.create_at DESC
        """
        courses = db_query(sql, (current_user_id,))
        if courses is None:
             return jsonify({"error": "Không thể lấy khóa học của giáo viên"}), 500
        return jsonify(courses) # Trả về list (có thể rỗng)
    except Exception as e:
        return jsonify({"error": f"Lỗi server khi lấy khóa học của giáo viên: {str(e)}"}), 500

@app.route("/api/courses/<int:course_id>", methods=["GET"])
def get_course_detail(course_id):
    try:
        # 1. Lấy thông tin khóa học (Giữ nguyên)
        sql_course = """
            SELECT c.course_id, c.title, c.description, c.fee, u.full_name as teacher_name, l.name as language_name
            FROM Courses c
            JOIN Users u ON c.teacher_id = u.user_id
            JOIN Languages l ON c.language_id = l.language_id
            WHERE c.course_id = :1
        """
        course_info = db_query(sql_course, (course_id,), fetch_one=True)
        if not course_info:
            return jsonify({"error": "Không tìm thấy khóa học"}), 404

        # 2. SỬA LẠI SQL: Lấy thêm exercise_type để phân biệt Bài thường/Bài thi
        sql_modules_lessons = """
            SELECT
                m.module_id, m.title as module_title, m.order_num as module_order,
                l.lesson_id, l.title as lesson_title, l.order_num as lesson_order,
                e.exercise_id,
                e.type as exercise_type  -- <--- LẤY THÊM CỘT NÀY
            FROM Modules m
            LEFT JOIN Lessons l ON m.module_id = l.module_id AND l.course_id = m.course_id
            -- Join để lấy bài tập mới nhất của bài học đó
            LEFT JOIN (
                SELECT lesson_id, exercise_id, type 
                FROM Exercises e1
                WHERE exercise_id = (SELECT MAX(exercise_id) FROM Exercises e2 WHERE e2.lesson_id = e1.lesson_id)
            ) e ON l.lesson_id = e.lesson_id
            WHERE m.course_id = :1
            ORDER BY m.order_num NULLS LAST, m.module_id, l.order_num NULLS LAST, l.lesson_id
        """
        
        module_data = db_query(sql_modules_lessons, (course_id,))
        if module_data is None: 
             return jsonify({"error": "Không thể lấy nội dung module"}), 500

        # Tái cấu trúc dữ liệu
        modules_dict = {}
        for row in module_data:
            module_id = row['module_id']
            if module_id not in modules_dict:
                modules_dict[module_id] = {
                    "module_id": module_id,
                    "title": row['module_title'],
                    "order_num": row['module_order'],
                    "lessons": []
                }
            
            if row['lesson_id'] is not None:
                 modules_dict[module_id]['lessons'].append({
                    "lesson_id": row['lesson_id'],
                    "title": row['lesson_title'],
                    "order_num": row['lesson_order'],
                    "exercise_id": row['exercise_id'],
                    "exercise_type": row['exercise_type'] # <--- Trả về Frontend
                 })

        course_info['modules'] = sorted(modules_dict.values(), key=lambda m: (m['order_num'] is None, m['order_num'], m['module_id']))

        return jsonify(course_info)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Lỗi server khi lấy chi tiết khóa học: {str(e)}"}), 500
# ==============================================================================
# CHỈNH SỬA API ĐĂNG NHẬP (/api/login)
# ==============================================================================
# --- API User/Auth ---
@app.route("/api/login", methods=["POST"])
def handle_login():
    """API xu ly dang nhap."""
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
         return jsonify({"error": "Thiếu tên đăng nhập hoặc mật khẩu"}), 400

    try:
        # SQL này so sánh HASH của mật khẩu được gửi lên
        # với HASH đã lưu trong CSDL
        sql = """
            SELECT u.user_id, u.user_name, u.email, u.full_name, r.role_name
            FROM Users u
            JOIN User_roles ur ON u.user_id = ur.user_id
            JOIN Roles r ON ur.role_id = r.role_id
            WHERE u.user_name = :1 AND u.password_hash = HASH_PASSWORD(:2)
        """
        # Tham số (params) giữ nguyên: (username, password)
        user = db_query(sql, (username, password), fetch_one=True)

        if user:
            return jsonify(user) # Trả về thông tin user nếu khớp
        else:
            # Trả về 401 nếu không khớp
            return jsonify({"error": "Tên đăng nhập hoặc mật khẩu không đúng"}), 401 # Unauthorized
    except Exception as e:
         return jsonify({"error": f"Lỗi server khi đăng nhập: {str(e)}"}), 500

# ==============================================================================
# CHỈNH SỬA API ĐĂNG KÝ (/api/register)
# ==============================================================================
@app.route("/api/register", methods=["POST"])
def handle_register():
    """API xu ly dang ky."""
    data = request.json
    username = data.get('username')
    fullName = data.get('fullName')
    email = data.get('email')
    password = data.get('password')

    # --- Validation Input ---
    if not all([username, fullName, email, password]):
        return jsonify({"error": "Vui lòng điền đầy đủ thông tin"}), 400
    if len(password) < 6: # Ví dụ kiểm tra độ dài mật khẩu
         return jsonify({"error": "Mật khẩu phải có ít nhất 6 ký tự"}), 400
    # Thêm kiểm tra định dạng email nếu cần

    connection = None # Khởi tạo để dùng trong finally
    cursor = None # Khởi tạo cursor
    try:
        # 1. Kiem tra ten dang nhap ton tai
        if db_query("SELECT 1 FROM Users WHERE user_name = :1", (username,), fetch_one=True):
            return jsonify({"error": "Tên đăng nhập đã tồn tại"}), 409 # Conflict

        # 2. Kiem tra email ton tai
        if db_query("SELECT 1 FROM Users WHERE email = :1", (email,), fetch_one=True):
            return jsonify({"error": "Email đã được sử dụng"}), 409 # Conflict

        # 3. Them user moi (Sử dụng HASH_PASSWORD)
        connection = pool.acquire()
        cursor = connection.cursor()
        new_id_var = cursor.var(oracledb.NUMBER)
        sql_insert_user = """
            INSERT INTO Users (user_name, email, full_name, create_at, password_hash)
            VALUES (:1, :2, :3, SYSDATE, HASH_PASSWORD(:4))
            RETURNING user_id INTO :new_id
        """
        # Thay đổi thứ tự tham số:
        cursor.execute(sql_insert_user, (username, email, fullName, password, new_id_var))
        new_user_id = int(new_id_var.getvalue()[0]) if new_id_var.getvalue() else None

        if new_user_id is None:
             raise Exception("Không thể tạo user mới hoặc lấy ID.")

        # 4. Gan vai tro 'student' (role_id = 3) cho user moi
        sql_insert_role = "INSERT INTO User_roles (user_id, role_id) VALUES (:1, 3)"
        cursor.execute(sql_insert_role, (new_user_id,))

        # 5. ========= TÍCH HỢP MÃ HÓA (YÊU CẦU 5) =========
        # Tạo nội dung thông báo
        welcome_message = f"Chào mừng {fullName} đã tham gia LearnLingo!"
        
        # Mã hóa nội dung
        encrypted_message = encrypt_data(welcome_message)
        
        # Lưu nội dung ĐÃ MÃ HÓA vào CSDL
        sql_insert_noti = """
            INSERT INTO Notifications (user_id, message, type)
            VALUES (:1, :2, 'info')
        """
        # encrypted_message là chuỗi token, không phải 'welcome_message'
        cursor.execute(sql_insert_noti, (new_user_id, encrypted_message))
        # ====================================================

        connection.commit()
        # cursor.close() # Sẽ close trong finally
        # pool.release(connection) # Sẽ release trong finally
        # connection = None # Đánh dấu đã release
        return jsonify({"success": True, "message": "Đăng ký thành công"}), 201

    except oracledb.DatabaseError as db_err:
        error, = db_err.args
        print(f"!!! Loi Oracle khi dang ky: {db_err}")
        return jsonify({"error": f"Lỗi CSDL khi đăng ký: {error.message}"}), 500
    except Exception as e:
        print(f"!!! Loi Python khi dang ky: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Lỗi server không xác định: {str(e)}"}), 500
    finally:
        if cursor:
             try: cursor.close()
             except: pass
        if connection: # Release nếu chưa được release ở try
             try: pool.release(connection)
             except Exception as release_err: print(f"--- Canh bao: Loi release connection trong finally (register): {release_err}")
# ==============================================================================
# THÊM API MỚI: XEM THÔNG BÁO (ĐỌC VÀ GIẢI MÃ) (ĐÃ SỬA DECORATOR)
# ==============================================================================
@app.route("/api/notifications", methods=["GET"])
@role_required('student', 'teacher', 'admin') # SỬA Ở ĐÂY: Chấp nhận 1 trong 3 vai trò
def get_notifications(current_user_id):
    """API lấy thông báo của người dùng (Đã giải mã)"""
    user_id = current_user_id # DÙNG ID ĐÃ XÁC THỰC TỪ DECORATOR

    try:
        # 1. Lấy dữ liệu ĐÃ MÃ HÓA từ CSDL
        sql = "SELECT notification_id, message, type, sent_date FROM Notifications WHERE user_id = :1 ORDER BY sent_date DESC"
        notifications_encrypted = db_query(sql, (user_id,))
        if notifications_encrypted is None:
             return jsonify({"error": "Không thể lấy thông báo"}), 500

        # 2. Giải mã dữ liệu
        notifications_decrypted = []
        for noti in notifications_encrypted:
            # Giải mã từng tin nhắn
            decrypted_msg = decrypt_data(noti['message'])
            
            notifications_decrypted.append({
                "notification_id": noti['notification_id'],
                # Nếu giải mã lỗi, trả về thông báo lỗi
                "message": decrypted_msg or "[Lỗi giải mã thông báo]", 
                "type": noti['type'],
                "sent_date": noti['sent_date']
            })

        # 3. Trả về dữ liệu đã giải mã cho client
        return jsonify(notifications_decrypted)
        
    except Exception as e:
        print(f"!!! Loi khi lay thong bao: {e}")
        return jsonify({"error": f"Lỗi server khi lấy thông báo: {str(e)}"}), 500
# ==============================================================================
# API ĐĂNG KÝ KHÓA HỌC VÀ DASHBOARD HỌC VIÊN
# ==============================================================================
# --- API Học viên ---
@app.route("/api/enroll", methods=["POST"])
@role_required('student') # LỚP 1: Chặn ở "cửa" API
def enroll_course(current_user_id):
    """API dang ky khoa hoc."""
    data = request.json
    course_id_str = data.get('course_id')
    user_id = current_user_id # DÙNG ID ĐÃ XÁC THỰC
    
    # (Thêm 1 bước validation nhỏ)
    if not course_id_str:
        return jsonify({"error": "Thiếu course_id"}), 400
    try:
        course_id = int(course_id_str)
    except (ValueError, TypeError):
         return jsonify({"error": "Course ID không hợp lệ"}), 400
    # (Kết thúc validation)

    try:
        # 1. Kiem tra da dang ky chua (Việc này decorator không làm)
        sql_check = "SELECT 1 FROM DK_COURSES WHERE student_id = :1 AND course_id = :2"
        existing = db_query(sql_check, (user_id, course_id), fetch_one=True)
        if existing:
            return jsonify({"error": "Bạn đã đăng ký khóa học này rồi"}), 409 # Conflict

        # 2. Them vao bang DK_COURSES
        sql_insert = "INSERT INTO DK_COURSES (student_id, course_id, status, enroll_date) VALUES (:1, :2, 'active', SYSDATE)"
        result = db_query(sql_insert, (user_id, course_id))

        if result and result.get("success"):
            return jsonify({"success": True, "message": "Đăng ký thành công"})
        else:
            return jsonify({"error": "Không thể đăng ký khóa học do lỗi DML"}), 500

    except oracledb.DatabaseError as db_err:
        error, = db_err.args
        # LỚP 2: Bắt lỗi từ "két sắt" CSDL (phòng trường hợp Lớp 1 bị hỏng)
        if error.code == -20002:
             print(f"--- Trigger Error (-20002) caught for user {user_id}.")
             return jsonify({"error": "Chỉ học viên mới được đăng ký khóa học (Lỗi Trigger)"}), 403
        else:
            print(f"!!! Loi Oracle khi dang ky khoa hoc: {db_err}")
            return jsonify({"error": f"Lỗi CSDL khi đăng ký: {error.message}"}), 500
    except Exception as e:
        print(f"!!! Loi Python khi dang ky khoa hoc: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Lỗi server không xác định: {str(e)}"}), 500
    
# ==============================================================================
# API LẤY THÔNG TIN DASHBOARD HỌC VIÊN
# ==============================================================================
@app.route("/api/dashboard", methods=["GET"])
@role_required('student') # Chỉ student mới có dashboard
def get_dashboard(current_user_id):
    """API lay thong tin dashboard cua hoc vien."""
    user_id = current_user_id # DÙNG ID ĐÃ XÁC THỰC
    try:
        # Câu SQL để lấy thông tin khóa học, module, lesson và progress của user
        sql = """
            SELECT
                c.course_id, c.title as course_title, u.full_name as teacher_name,
                m.module_id, m.title as module_title, m.order_num as module_order,
                l.lesson_id, l.title as lesson_title, l.content_type, l.order_num as lesson_order,
                COALESCE(p.progress, 0) as lesson_progress,
                dk.dk_courses_id
            FROM DK_COURSES dk
            JOIN Courses c ON dk.course_id = c.course_id
            JOIN Users u ON c.teacher_id = u.user_id
            -- Dùng LEFT JOIN phòng trường hợp khóa học chưa có module/lesson
            LEFT JOIN Modules m ON c.course_id = m.course_id
            LEFT JOIN Lessons l ON m.module_id = l.module_id AND l.course_id = m.course_id
            LEFT JOIN Progress p ON p.dk_courses_id = dk.dk_courses_id AND p.lesson_id = l.lesson_id
            WHERE dk.student_id = :1
            ORDER BY c.course_id, m.order_num NULLS LAST, m.module_id, l.order_num NULLS LAST, l.lesson_id
        """
        data = db_query(sql, (user_id,))
        if data is None: # Lỗi từ db_query
            return jsonify({"error": "Không thể lấy dữ liệu dashboard"}), 500

        # Tái cấu trúc dữ liệu trả về (giữ nguyên logic)
        enrolled_courses = {}
        # ... (Phần xử lý lặp qua data và tạo cấu trúc enrolled_courses giữ nguyên) ...
        for row in data:
            course_id = row['course_id']
            if course_id not in enrolled_courses:
                 enrolled_courses[course_id] = { "course_id": course_id, "title": row['course_title'], "teacher_name": row['teacher_name'], "modules": {}, "total_lessons": 0, "completed_lessons": 0 }

            # Chỉ xử lý module/lesson nếu module_id tồn tại (do LEFT JOIN)
            if row['module_id'] is not None:
                module_id = row['module_id']
                if module_id not in enrolled_courses[course_id]['modules']:
                     enrolled_courses[course_id]['modules'][module_id] = { "module_id": module_id, "title": row['module_title'], "order_num": row['module_order'], "lessons": [] }

                # Chỉ thêm lesson nếu lesson_id tồn tại
                if row['lesson_id'] is not None:
                     enrolled_courses[course_id]['modules'][module_id]['lessons'].append({ "lesson_id": row['lesson_id'], "title": row['lesson_title'], "content_type": row['content_type'], "order_num": row['lesson_order'], "progress": row['lesson_progress'] })
                     # Chỉ tính lesson có ID vào tổng số
                     enrolled_courses[course_id]['total_lessons'] += 1
                     if row['lesson_progress'] == 100:
                         enrolled_courses[course_id]['completed_lessons'] += 1


        final_list = []
        for course in enrolled_courses.values():
            # Sắp xếp module và lesson trước khi thêm vào list cuối cùng
            course_modules_list = sorted(course['modules'].values(), key=lambda m: (m['order_num'] is None, m['order_num'], m['module_id']))
            for module in course_modules_list:
                 module['lessons'] = sorted(module['lessons'], key=lambda l: (l['order_num'] is None, l['order_num'], l['lesson_id']))
            course['modules'] = course_modules_list

            # Tính % tổng
            course['overall_progress'] = round((course['completed_lessons'] / course['total_lessons']) * 100) if course['total_lessons'] > 0 else 0
            final_list.append(course)

        # Sắp xếp danh sách khóa học cuối cùng (ví dụ theo ID)
        final_list.sort(key=lambda c: c['course_id'])

        return jsonify(final_list)

    except Exception as e:
        return jsonify({"error": f"Lỗi server khi lấy dashboard: {str(e)}"}), 500


# ==============================================================================
# API QUÊN MẬT KHẨU (Đã sửa để nhận user_id khi gửi lại mã)
# ==============================================================================
@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    identifier = request.json.get('identifier') # Email hoặc username
    user_id_resend = request.json.get('user_id') # Vẫn hỗ trợ gửi lại mã

    if PRIVATE_KEY is None: # Kiểm tra key trước
        return jsonify({"error": "Lỗi server: Private key chưa được cấu hình"}), 500

    user = None
    if user_id_resend: # Nếu là gửi lại, tìm bằng user_id
         try:
             user_id = int(user_id_resend)
             user = db_query("SELECT user_id, email FROM Users WHERE user_id = :1", (user_id,), fetch_one=True)
         except (ValueError, TypeError):
              return jsonify({"error": "User ID không hợp lệ để gửi lại mã"}), 400
    elif identifier: # Nếu là lần đầu, tìm bằng identifier
        user = db_query("SELECT user_id, email FROM Users WHERE LOWER(user_name) = LOWER(:1) OR LOWER(email) = LOWER(:2)", (identifier, identifier), fetch_one=True)
    else:
        return jsonify({"error": "Thiếu thông tin (email/username hoặc user_id)"}), 400

    if not user or not user.get('user_id') or not user.get('email'):
        return jsonify({"error": "Không tìm thấy tài khoản hợp lệ"}), 404

    user_id = user['user_id']
    
    # === TAO TOKEN (JWT) ===
    try:
        payload = {
            'sub': str(user_id), # <--- SỬA Ở ĐÂY: Chuyển user_id thành chuỗi
            'iat': datetime.datetime.utcnow(), # 'iat' (issued at)
            'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=15), # Het han sau 15 phut
            'aud': 'password-reset' # 'aud' (audience) - muc dich cua token
        }
        # Ky token bang Private Key
        token = jwt.encode(payload, PRIVATE_KEY, algorithm='RS256')
        
        # Thay vi luu code, chung ta "gui" token (in ra console)
        print("========================")
        print(f"TOKEN DAT LAI MAT KHAU (DEMO) CHO {user['email']}:")
        print(token) # In ra token (day la chuoi dai)
        print("========================")
        
        # Tra ve cho client biet la thanh cong
        return jsonify({
            "success": True,
            "message": f"Yêu cầu đã được gửi (check console demo để lấy token)",
            "masked_email": maskEmail(user['email'])
            # Khong can tra ve user_id, client khong can luu nua
        })

    except Exception as e:
        print(f"!!! Loi khi tao JWT: {e}")
        return jsonify({"error": f"Lỗi server khi tạo token: {str(e)}"}), 500


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    # Nhan token
    data = request.json
    token = data.get('token') # Nhan token tu client
    new_password = data.get('newPassword')

    # --- Validation ---
    if not token or not new_password:
        return jsonify({"error": "Thiếu token hoặc mật khẩu mới"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Mật khẩu mới phải có ít nhất 6 ký tự"}), 400
    
    if PUBLIC_KEY is None:
         return jsonify({"error": "Lỗi server: Public key chưa được cấu hình"}), 500

    try:
        # === XAC THUC TOKEN ===
        # Giai ma va xac thuc token bang Public Key
        # Neu token gia mao, het han, hoac sai muc dich (aud) => se nem ra loi
        payload = jwt.decode(
            token, 
            PUBLIC_KEY, 
            algorithms=['RS256'], 
            audience='password-reset' # Kiem tra token nay co dung la de reset MK khong
        )
        
        # Neu thanh cong, lay user_id TU TOKEN (rat an toan)
        user_id = payload['sub']
        
        # === CAP NHAT MAT KHAU ===
        # Cap nhat HASH cua mat khau moi
        sql = "UPDATE Users SET password_hash = HASH_PASSWORD(:1) WHERE user_id = :2"
        result = db_query(sql, (new_password, user_id))

        if result and result.get("success"):
            return jsonify({"success": True, "message": "Đặt lại mật khẩu thành công"})
        else:
            return jsonify({"error": "Không thể cập nhật mật khẩu"}), 500

    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token đã hết hạn. Vui lòng yêu cầu lại."}), 401
    except jwt.InvalidAudienceError:
         return jsonify({"error": "Token không hợp lệ cho mục đích này."}), 401
    except jwt.InvalidTokenError as e:
        print(f"!!! Loi xac thuc JWT: {e}")
        return jsonify({"error": "Token không hợp lệ hoặc đã bị thay đổi."}), 401
    except Exception as e:
         print(f"!!! Loi server khi dat lai mat khau: {e}")
         return jsonify({"error": f"Lỗi server không xác định: {str(e)}"}), 500
        

# Hàm maskEmail (giữ nguyên)
def maskEmail(email):
    if not isinstance(email, str) or '@' not in email: return "***" # Xử lý email không hợp lệ
    parts = email.split('@')
    if len(parts[0]) <= 3: return parts[0][0] + '***@' + parts[1]
    return parts[0][0:3] + '***@' + parts[1]

# ==============================================================================
# XỬ LÝ LỖI CHUNG (Tùy chọn)
# ==============================================================================
@app.errorhandler(Exception)
def handle_exception(e):
    """Bắt các lỗi không được xử lý cụ thể trong các API."""
    # In lỗi chi tiết ra server log
    print(f"!!! UNHANDLED EXCEPTION: {e}")
    traceback.print_exc()

    # Trả về lỗi JSON chung cho client
    # Có thể tùy chỉnh dựa trên loại lỗi 'e' nếu cần
    response = jsonify({"error": f"Lỗi server nội bộ: {str(e)}"})
    response.status_code = 500
    # Thêm header CORS nếu cần thiết cho lỗi 500
    # response.headers.add('Access-Control-Allow-Origin', '*') # Hoặc domain cụ thể
    return response

# ==============================================================================
# NGHIỆP VỤ BẢO MẬT: CHỐNG LỘ ĐỀ THI (Question Bank Security)
# ==============================================================================
import json

@app.route("/api/exercises", methods=["POST"])
@role_required('teacher')
def create_exercise(current_user_id):
    """
    API cho Giáo viên tạo bài tập trắc nghiệm.
    Dữ liệu câu hỏi sẽ được MÃ HÓA trước khi lưu xuống DB.
    """
    data = request.json
    lesson_id = data.get('lesson_id')
    title = data.get('title')
    questions_data = data.get('content') # Đây là List các object câu hỏi (JSON)

    if not all([lesson_id, title, questions_data]):
        return jsonify({"error": "Thiếu thông tin bài tập"}), 400

    # 1. Chuyển đổi list câu hỏi sang chuỗi JSON
    try:
        json_str = json.dumps(questions_data, ensure_ascii=False)
    except Exception as e:
        return jsonify({"error": "Dữ liệu câu hỏi không đúng định dạng JSON"}), 400

    # 2. MÃ HÓA NỘI DUNG (QUAN TRỌNG)
    # Chỉ có server giữ Key này mới giải mã được. DBA mở bảng ra chỉ thấy chuỗi ký tự lộn xộn.
    encrypted_content = encrypt_data(json_str)
    
    # --- THÊM ĐOẠN NÀY ĐỂ KIỂM TRA ---
    print("\n" + "="*40)
    print("🔍 [KIỂM TRA BẢO MẬT] ĐANG TẠO ĐỀ THI:")
    print(f"➤ Nội dung gốc (JSON): {json_str}")
    print("-" * 40)
    print(f"➤ Sau khi mã hóa (Lưu DB): {encrypted_content}")
    print("="*40 + "\n")
    
    if not encrypted_content:
        return jsonify({"error": "Lỗi mã hóa dữ liệu"}), 500

    try:
        sql = """
            INSERT INTO Exercises (title, type, content, lesson_id)
            VALUES (:1, 'quiz', :2, :3)
        """
        # Lưu encrypted_content vào cột CLOB
        db_query(sql, (title, encrypted_content, lesson_id))
        return jsonify({"success": True, "message": "Đã tạo bài tập và mã hóa an toàn!"}), 201
    except Exception as e:
        return jsonify({"error": f"Lỗi lưu bài tập: {str(e)}"}), 500


@app.route("/api/exercises/<int:exercise_id>", methods=["GET"])
@role_required('student', 'teacher')
def get_exercise_content(exercise_id, current_user_id):
    """
    API lấy nội dung bài tập (ĐÃ FIX LỖI LOB)
    """
    try:
        # 1. Lấy nội dung từ DB
        sql = "SELECT title, content FROM Exercises WHERE exercise_id = :1"
        row = db_query(sql, (exercise_id,), fetch_one=True)
        
        if not row:
            return jsonify({"error": "Không tìm thấy bài tập"}), 404

        # === FIX LỖI LOB Ở ĐÂY ===
        lob_object = row['content']
        
        # Kiểm tra xem nó có phải là LOB không, nếu phải thì .read() để lấy chuỗi
        if hasattr(lob_object, 'read'):
            encrypted_content = lob_object.read()
        else:
            encrypted_content = str(lob_object) # Nếu đã là string thì giữ nguyên
            
        # =========================

        # LOG KIỂM TRA
        print("\n" + "="*40)
        print(f"🔓 [HỌC SINH LÀM BÀI] ĐANG GIẢI MÃ ID: {exercise_id}")
        # Bây giờ encrypted_content đã là string nên mới cắt [:50] được
        print(f"➤ Dữ liệu lấy từ DB (Mã hóa): {encrypted_content[:50]}...") 

        # 2. GIẢI MÃ
        decrypted_json_str = decrypt_data(encrypted_content)
        
        print(f"➤ Sau khi giải mã: {decrypted_json_str[:50]}...") # In 50 ký tự đầu
        print("="*40 + "\n")
        
        if not decrypted_json_str:
            return jsonify({"error": "Không thể giải mã (Key sai hoặc dữ liệu hỏng)"}), 500

        # 3. Trả về JSON
        questions = json.loads(decrypted_json_str)

        return jsonify({
            "exercise_id": exercise_id,
            "title": row['title'],
            "questions": questions
        })

    except Exception as e:
        print(f"Lỗi lấy bài tập: {e}")
        import traceback
        traceback.print_exc() # In chi tiết lỗi để dễ sửa
        return jsonify({"error": "Lỗi server khi tải bài tập"}), 500
    
# --- API MỚI 1: Tạo Đề Thi Bảo Mật (Riêng biệt) ---
@app.route("/api/exercises/secure", methods=["POST"])
@role_required('teacher')
def create_secure_exercise(current_user_id):
    """API riêng cho việc tạo đề thi có mật mã"""
    data = request.json
    lesson_id = data.get('lesson_id')
    title = data.get('title')
    questions_data = data.get('content')
    access_code = data.get('access_code') # Bắt buộc phải có

    if not all([lesson_id, title, questions_data, access_code]):
        return jsonify({"error": "Thiếu thông tin hoặc mật mã bảo vệ"}), 400

    # 1. Mã hóa nội dung câu hỏi (như cũ)
    json_str = json.dumps(questions_data, ensure_ascii=False)
    encrypted_content = encrypt_data(json_str)
    
    # 2. Mã hóa access_code (để bảo mật trong DB)
    encrypted_access_code = encrypt_data(access_code)

    try:
        sql = """
            INSERT INTO Exercises (title, type, content, lesson_id, access_code)
            VALUES (:1, 'secure_quiz', :2, :3, :4)
        """
        # Lưu ý: type là 'secure_quiz' để phân biệt
        db_query(sql, (title, encrypted_content, lesson_id, encrypted_access_code))
        return jsonify({"success": True, "message": "Đã tạo Đề Thi Bảo Mật thành công!"}), 201
    except Exception as e:
        return jsonify({"error": f"Lỗi tạo đề bảo mật: {str(e)}"}), 500

# --- API MỚI 2: Lấy Public Key ---
@app.route("/api/public-key", methods=["GET"])
def get_public_key():
    if PUBLIC_KEY:
        return jsonify({"public_key": PUBLIC_KEY.decode('utf-8')})
    return jsonify({"error": "Server chưa cấu hình Key"}), 500

# --- API MỚI 3: Xác thực Mật mã (Hybrid Decryption) ---
@app.route("/api/exercises/verify", methods=["POST"])
@role_required('student')
def verify_exercise_access(current_user_id):
    """
    API xác thực mật mã bài thi (Hybrid Decryption)
    Quy trình:
    1. Client gửi: encrypted_aes_key (RSA) + encrypted_code (AES) + iv (AES)
    2. Server: Dùng Private Key (RSA) giải mã encrypted_aes_key -> Lấy AES Key (Base64) -> Decode về Raw Bytes
    3. Server: Dùng AES Key giải mã encrypted_code -> Lấy Code gốc
    4. Server: So sánh Code gốc với DB
    """
    data = request.json
    exercise_id = data.get('exercise_id')
    enc_aes_key_b64 = data.get('encrypted_aes_key') 
    enc_code_b64 = data.get('encrypted_code')       
    iv_b64 = data.get('iv')                        

    if not all([exercise_id, enc_aes_key_b64, enc_code_b64, iv_b64]):
        return jsonify({"error": "Thiếu dữ liệu xác thực"}), 400

    try:
        # 1. Tải Private Key RSA
        if PRIVATE_KEY is None:
            return jsonify({"error": "Server chưa có Private Key"}), 500

        private_key_obj = serialization.load_pem_private_key(
            PRIVATE_KEY, 
            password=None, 
            backend=default_backend()
        )
        
        # 2. GIẢI MÃ RSA: Lấy AES Key (đang ở dạng Base64)
        # Kết quả trả về là bytes của chuỗi Base64 (VD: b'ZnR...==')
        aes_key_base64_bytes = private_key_obj.decrypt(
            base64.b64decode(enc_aes_key_b64),
            padding.PKCS1v15()
        )
        
        # --- [FIX LỖI INVALID KEY SIZE] ---
        # Frontend gửi Key dưới dạng Base64 (44 chars), nhưng AES cần 32 bytes raw.
        # Ta phải decode Base64 một lần nữa để lấy lại Key gốc 32 bytes.
        try:
            aes_key = base64.b64decode(aes_key_base64_bytes)
        except Exception:
            # Phòng trường hợp data bị lỗi hoặc đã là raw bytes
            aes_key = aes_key_base64_bytes
            
        # Kiểm tra độ dài key (phải là 16, 24 hoặc 32 bytes)
        if len(aes_key) not in [16, 24, 32]:
             # Nếu decode base64 vẫn không đúng size, có thể do format từ JS khác
             print(f"!!! Cảnh báo Key Size: {len(aes_key)} bytes. Đang thử dùng trực tiếp...")

        # 3. GIẢI MÃ AES: Lấy Access Code
        iv = base64.b64decode(iv_b64)
        cipher_text = base64.b64decode(enc_code_b64)
        
        cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        
        padded_code = decryptor.update(cipher_text) + decryptor.finalize()
        
        # Bỏ padding PKCS7
        # Lấy giá trị byte cuối cùng để biết độ dài padding cần cắt
        pad_len = padded_code[-1]
        user_code_input = padded_code[:-pad_len].decode('utf-8') 

        # 4. Lấy Code gốc từ DB và so sánh
        row = db_query("SELECT access_code FROM Exercises WHERE exercise_id = :1", (exercise_id,), fetch_one=True)
        
        if not row: 
            return jsonify({"error": "Bài tập không tồn tại"}), 404
            
        # Nếu trong DB không có code (NULL) -> Bài này không khóa -> OK luôn
        if not row['access_code']:
             return jsonify({"success": True, "message": "Bài tập không có mật mã"})

        # Giải mã code trong DB ra (Dùng hàm decrypt_data Fernet của bạn)
        real_code = decrypt_data(row['access_code']) 
        
        if user_code_input == real_code:
            return jsonify({"success": True, "message": "Mật mã chính xác"})
        else:
            return jsonify({"success": False, "error": "Mật mã sai!"}), 403

    except Exception as e:
        print(f"Lỗi verify chi tiết: {e}")
        import traceback
        traceback.print_exc() # In lỗi đầy đủ ra terminal
        return jsonify({"error": f"Lỗi xác thực: {str(e)}"}), 400
# ==============================================================================
# CHAY MAY CHU
# ==============================================================================
if __name__ == "__main__":
    if pool is None or PRIVATE_KEY is None: # Kiem tra ca key
        print("!!! KHONG THE KHOI DONG SERVER. Kiem tra loi khoi tao Pool hoac thieu file Key.")
    else:
        print(f"--- Khoi dong may chu Flask tai http://localhost:5000 ---")
        app.run(debug=True, host='0.0.0.0', port=5000)