// Dia chi Back-end Python cua ban (ĐÃ CHẮC CHẮN LÀ CỔNG 5000)
const API_URL = 'http://localhost:5000/api';

// Bien toan cuc de giu thong tin nguoi dung da dang nhap
let currentUser = null;
// Bien tam cho chuc nang quen mat khau
let forgotPasswordUser = null; 
// Lưu trữ danh sách khóa học đã tải để tìm kiếm front-end
let loadedCoursesData = []; 


document.addEventListener('DOMContentLoaded', function() {
    checkSession(); 
    initMobileMenu();
    initScrollTopButton();
    // Gọi loadStatistics và loadCourses nếu chưa đăng nhập (checkSession không làm)
    if (!currentUser) {
        loadStatistics();
        loadCourses();
    }
});

function checkSession() {
    // Kiem tra xem co thong tin nguoi dung trong sessionStorage khong
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUIForLoggedInUser(); 
        loadStatistics();
        loadCourses();
        // Tải thông báo ngay khi kiểm tra session (nếu là student)
        if (currentUser && currentUser.user_id) {
            loadUserNotifications(currentUser.user_id);
        }Z
    }
}

/**
 * (Hàm helper mới) Tạo headers cho API
 * Tự động thêm 'X-User-ID' nếu đã đăng nhập
 */
function getApiHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (currentUser && currentUser.user_id) {
        // Gửi ID qua Header để xác thực thay vì body/query
        headers['X-User-ID'] = currentUser.user_id;
    }
    return headers;
}

// ================================================================
// GỌI API VÀ TẢI DỮ LIỆU
// ================================================================

async function loadStatistics() {
    try {
        const response = await fetch(`${API_URL}/statistics`);
        if (!response.ok) throw new Error('Failed to fetch statistics');
        
        const stats = await response.json();
        
        setTimeout(() => {
            animateValue('totalStudents', 0, stats.students || 0, 1000);
            animateValue('totalCourses', 0, stats.courses || 0, 1000);
            animateValue('totalTeachers', 0, stats.teachers || 0, 1000);
            animateValue('totalLanguages', 0, stats.languages || 0, 1000);
        }, 300);
    } catch (error) {
        console.error("Loi khi tai thong ke:", error);
    }
}

async function loadCourses() {
    const coursesList = document.getElementById('coursesList');
    coursesList.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Đang tải khóa học...</p>';

    try {
        const response = await fetch(`${API_URL}/courses`);
        if (!response.ok) throw new Error('Failed to fetch courses');
        
        const courses = await response.json();
        loadedCoursesData = courses; // Lưu lại để tìm kiếm
        coursesList.innerHTML = ''; 

        if (!courses || courses.length === 0) {
            coursesList.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Chưa có khóa học nào.</p>';
            return;
        }

        courses.forEach(course => {
            const courseCard = `
                <div class="course-card" onclick="openCourseDetail(${course.course_id})">
                    <div class="course-image">
                        <i class="fas fa-book-open"></i>
                    </div>
                    <div class="course-content">
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-desc">${course.description}</p>
                        <div class="course-meta">
                            <span class="course-teacher">
                                <i class="fas fa-user"></i> ${course.teacher_name || 'N/A'}
                            </span>
                            <span class="course-price">${(course.fee || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div style="margin-top: 10px; color: #718096; font-size: 13px;">
                            <i class="fas fa-globe"></i> ${course.language_name || 'N/A'} | 
                            <i class="fas fa-users"></i> ${course.enrollments || 0} học viên
                        </div>
                    </div>
                </div>
            `;
            coursesList.innerHTML += courseCard;
        });
    } catch (error) {
        console.error("Loi khi tai khoa hoc:", error);
        coursesList.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: red;">Không thể tải khóa học.</p>';
        loadedCoursesData = []; 
    }
}

async function openCourseDetail(courseId) {
    document.getElementById('courseTitle').textContent = "Đang tải...";
    document.getElementById('courseDetail').innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>';
    openModal('course'); 

    try {
        const response = await fetch(`${API_URL}/courses/${courseId}`);
        if (!response.ok) throw new Error('Failed to fetch course detail');
        const course = await response.json();

        let modulesHTML = '<h3 style="margin-top: 20px; color: #667eea; border-bottom: 2px solid #eee; padding-bottom: 10px;">📚 Nội dung khóa học:</h3><div class="modules-list">';
        
        if (course.modules && course.modules.length > 0) {
            course.modules.forEach(module => {
                let lessonsListHTML = '';
                
                if (module.lessons && module.lessons.length > 0) {
                    lessonsListHTML = '<div style="margin-top: 10px; padding-left: 15px; border-left: 2px solid #e2e8f0;">';
                    
                    module.lessons.forEach(lesson => {
                        let actionBtn = '';
                        const role = currentUser ? currentUser.role_name.toLowerCase() : '';

                        // --- LOGIC CHO GIÁO VIÊN ---
                        if (role === 'teacher') {
                             actionBtn = `
                                <div style="display: flex; gap: 5px;">
                                    <button onclick="openCreateQuizModal(${lesson.lesson_id})" 
                                        style="padding: 4px 8px; font-size: 11px; background: #48bb78; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Tạo bài thường">
                                        <i class="fas fa-plus"></i> Thường
                                    </button>
                                    <button onclick="openCreateSecureQuizModal(${lesson.lesson_id})" 
                                        style="padding: 4px 8px; font-size: 11px; background: #e53e3e; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Tạo bài bảo mật">
                                        <i class="fas fa-user-secret"></i> Bảo mật
                                    </button>
                                </div>
                            `; 
                        } 
                        // --- LOGIC CHO HỌC VIÊN (SỬA LỖI Ở ĐÂY) ---
                        else if (role === 'student') {
                            if (lesson.exercise_id) {
                                // console.log("Bài tập:", lesson.title, "Loại:", lesson.exercise_type); // Bật dòng này để debug nếu cần

                                // 1. Nếu là BÀI THI BẢO MẬT (secure_quiz) -> Hiện nút ĐỎ
                                if (lesson.exercise_type === 'secure_quiz') {
                                    actionBtn = `
                                        <button onclick="checkAndOpenQuiz(${lesson.exercise_id})" 
                                            style="margin-left: 10px; padding: 5px 12px; font-size: 12px; 
                                                   background: linear-gradient(90deg, #e53e3e, #c53030); 
                                                   color: white; border: none; border-radius: 20px; cursor: pointer; 
                                                   box-shadow: 0 2px 4px rgba(229, 62, 62, 0.3);">
                                            <i class="fas fa-lock"></i> Làm bài thi
                                        </button>
                                    `;
                                } 
                                // 2. Nếu là BÀI TẬP THƯỜNG (quiz/assignment/null) -> Hiện nút XANH
                                else {
                                    actionBtn = `
                                        <button onclick="openDoQuiz(${lesson.exercise_id})" 
                                            style="margin-left: 10px; padding: 5px 12px; font-size: 12px; 
                                                   background: linear-gradient(90deg, #4299e1, #3182ce); 
                                                   color: white; border: none; border-radius: 20px; cursor: pointer; 
                                                   box-shadow: 0 2px 4px rgba(66, 153, 225, 0.3);">
                                            <i class="fas fa-pen"></i> Luyện tập
                                        </button>
                                    `;
                                }
                            } else {
                                actionBtn = `<span style="font-size: 11px; color: #cbd5e0; margin-left: 10px;">(Chưa có bài)</span>`;
                            }
                        }

                        lessonsListHTML += `
                            <div style="padding: 8px 0; border-bottom: 1px dashed #eee; display: flex; justify-content: space-between; align-items: center;">
                                <span>
                                    <i class="${lesson.content_type === 'video' ? 'fas fa-play-circle' : 'fas fa-file-alt'}" style="color: #718096; margin-right: 5px;"></i>
                                    ${lesson.title}
                                </span>
                                <div>${actionBtn}</div>
                            </div>
                        `;
                    });
                    lessonsListHTML += '</div>';
                } else {
                    lessonsListHTML = '<p style="font-size: 13px; color: #a0aec0; font-style: italic; margin-top: 5px;">Chưa có bài học nào.</p>';
                }

                modulesHTML += `
                    <div class="module-item" style="background: #fff; border: 1px solid #e2e8f0; margin-bottom: 15px; padding: 15px; border-radius: 8px;">
                        <div style="font-weight: bold; color: #2d3748; font-size: 16px;">
                            📌 ${module.title}
                        </div>
                        ${lessonsListHTML}
                    </div>
                `;
            });
        } else {
             modulesHTML += '<p style="color: #718096; font-size: 14px; padding: 20px; text-align: center;">Chưa có nội dung.</p>';
        }
        modulesHTML += '</div>';

        // Logic nút đăng ký
        let isEnrolled = false;
        if (currentUser && currentUser.role_name === 'student') {
            const dashboardData = JSON.parse(sessionStorage.getItem('dashboardData') || '[]');
            isEnrolled = dashboardData.some(enrolledCourse => enrolledCourse.course_id === courseId);
        }
        const enrollButton = currentUser ? 
            (currentUser.role_name !== 'student' ? '' : (isEnrolled ? '<button class="btn-submit" disabled style="background:#48bb78; cursor:default;">✅ Đã đăng ký</button>' : `<button class="btn-submit" onclick="enrollCourse(${courseId})">Đăng ký ngay</button>`)) 
            : '<button class="btn-submit" onclick="showLoginAlert()">Đăng nhập để đăng ký</button>';

        document.getElementById('courseTitle').textContent = course.title;
        document.getElementById('courseDetail').innerHTML = `
            <div style="margin: 20px 0;">
                <p style="color: #555;">${course.description}</p>
                ${modulesHTML}
                <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">${enrollButton}</div>
            </div>
        `;
        
    } catch (error) {
        console.error(error);
        document.getElementById('courseDetail').innerHTML = '<p style="color: red;">Lỗi tải dữ liệu.</p>';
    }
}

async function enrollCourse(courseId) {
    if (!currentUser) {
        showLoginAlert();
        return;
    }

    if (currentUser.role_name !== 'student') {
        alert('Chỉ học viên mới có thể đăng ký khóa học!');
        return;
    }

    try {
        // (SỬA LỖI BẢO MẬT)
        const response = await fetch(`${API_URL}/enroll`, {
            method: 'POST',
            headers: getApiHeaders(), // Dùng header đã xác thực
            body: JSON.stringify({ 
                // Không cần gửi user_id, API tự lấy từ header
                course_id: courseId 
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            alert('Đăng ký khóa học thành công!');
            closeModal('course');
            loadCourses(); 
            updateUIForLoggedInUser(); 
        } else {
            alert(result.error || 'Có lỗi xảy ra khi đăng ký');
        }
    } catch (error) {
        console.error("Loi khi dang ky khoa hoc:", error);
        alert("Loi ket noi. Khong the dang ky.");
    }
}

function showLoginAlert() {
    closeModal('course'); 
    alert('Vui lòng đăng nhập để đăng ký khóa học!');
    openModal('login');
}

// ================================================================
// XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ
// ================================================================

async function handleLogin(event) {
    event.preventDefault(); 
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const loginButton = event.target.querySelector('.btn-submit'); 
    
    loginButton.disabled = true;
    loginButton.textContent = 'Đang đăng nhập...';
    showAlert('loginAlert', '', 'info'); 

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Login không cần header xác thực
            body: JSON.stringify({ username, password })
        });
        
        const user = await response.json();

        if (response.ok) {
            currentUser = user; 
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            
            showAlert('loginAlert', 'Đăng nhập thành công!', 'success');
            
            // Gọi hàm mới để tải thông báo ngay sau khi đăng nhập
            if (user.user_id) {
                loadUserNotifications(user.user_id); // Gọi hàm tải thông báo
            }
            
            setTimeout(() => {
                closeModal('login');
                updateUIForLoggedInUser(); 
                loadCourses();
                loadStatistics();
            }, 1000);
        } else {
            showAlert('loginAlert', user.error || `Lỗi ${response.status}: Đã có lỗi xảy ra`, 'error');
        }
    } catch (error) {
        console.error("Loi dang nhap:", error);
        showAlert('loginAlert', 'Lỗi kết nối máy chủ! Vui lòng thử lại.', 'error');
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Đăng nhập';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('regUsername').value;
    const fullName = document.getElementById('regFullName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const registerButton = event.target.querySelector('.btn-submit');

    registerButton.disabled = true;
    registerButton.textContent = 'Đang đăng ký...';
    showAlert('registerAlert', '', 'info');
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, fullName, email, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showAlert('registerAlert', 'Đăng ký thành công! Đang chuyển đến đăng nhập...', 'success');
            setTimeout(() => {
                closeModal('register');
                document.getElementById('loginUsername').value = username; 
                openModal('login');
            }, 1500);
            loadStatistics(); 
        } else {
            showAlert('registerAlert', result.error || `Lỗi ${response.status}: Đã có lỗi xảy ra`, 'error');
        }
    } catch (error) {
        console.error("Loi dang ky:", error);
        showAlert('registerAlert', 'Lỗi kết nối máy chủ! Vui lòng thử lại.', 'error');
    } finally {
        registerButton.disabled = false;
        registerButton.textContent = 'Đăng ký';
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('dashboardData'); 
    
    document.getElementById('guestActions').style.display = 'flex';
    document.getElementById('userInfo').classList.remove('active');
    document.getElementById('dashboardLink').style.display = 'none';
    
    showSection('home'); 
    loadStatistics();
    loadCourses();
    alert('Đã đăng xuất thành công!');
    // Xóa console thông báo (nếu có)
    console.clear();
}

// ================================================================
// XỬ LÝ QUÊN MẬT KHẨU
// ================================================================

async function handleForgotPassword(event) {
    event.preventDefault();
    const identifier = document.getElementById('forgotIdentifier').value.trim();
    const forgotButton = event.target.querySelector('.btn-submit');

    forgotButton.disabled = true;
    forgotButton.textContent = 'Đang gửi...';
    showAlert('forgotAlert', '', 'info');
    
    try {
        // 1. Goi API /forgot-password
        const response = await fetch(`${API_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // KHÔNG LƯU user_id nua
            // forgotPasswordUser = { user_id: result.user_id }; // <-- XÓA DÒNG NÀY
            
            showAlert('forgotAlert', `Yêu cầu thành công. Kiểm tra console server (demo) để lấy Token!`, 'success');
            
            // 2. Chuyen sang BUOC 3 (Nhap Token + MK moi)
            setTimeout(() => {
                document.getElementById('forgotStep1').style.display = 'none';
                //document.getElementById('forgotStep2').style.display = 'none'; // An buoc 2 (neu con)
                document.getElementById('forgotStep3').style.display = 'block'; // Hien buoc 3
                
                // Hien thi thong bao email da mask
                document.getElementById('forgotAlert').innerHTML = `
                    <div class="alert alert-success">
                        <small style="color: #22543d;">Yêu cầu gửi đến: ${result.masked_email}</small><br>
                        <small>(Kiểm tra console của server Python đang chạy để xem Token)</small>
                    </div>
                `;
            }, 1000);
        } else {
            showAlert('forgotAlert', result.error || `Lỗi ${response.status}: Không thể gửi yêu cầu`, 'error');
        }
    } catch (error) {
        console.error("Loi quen mat khau (step 1):", error);
        showAlert('forgotAlert', 'Lỗi kết nối! Vui lòng thử lại.', 'error');
    } finally {
         forgotButton.disabled = false;
         forgotButton.textContent = 'Gửi yêu cầu Token'; // Sửa text nút
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    
    // 1. Lay them TOKEN tu form
    const token = document.getElementById('resetToken').value.trim(); // <-- THÊM MỚI
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const resetButton = event.target.querySelector('.btn-submit');
    
    if (newPassword !== confirmPassword) {
        showAlert('forgotAlert', 'Mật khẩu xác nhận không khớp!', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showAlert('forgotAlert', 'Mật khẩu phải có ít nhất 6 ký tự!', 'error');
        return;
    }
    // Kiem tra token
    if (!token) {
        showAlert('forgotAlert', 'Vui lòng dán Reset Token vào!', 'error');
        return;
    }
    
    // KHONG CON CAN 'forgotPasswordUser'
    // if (!forgotPasswordUser || !forgotPasswordUser.user_id) { ... } // <-- XÓA KHỐI LỆNH NÀY

    resetButton.disabled = true;
    resetButton.textContent = 'Đang đặt lại...';
    showAlert('forgotAlert', '', 'info');

    try {
        // 2. Goi API /reset-password voi TOKEN
        const response = await fetch(`${API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                // Khong gui user_id
                token: token, // <-- GUI TOKEN
                newPassword: newPassword 
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showAlert('forgotAlert', 'Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...', 'success');
            // 3. Thanh cong, chuyen ve login
            setTimeout(() => {
                closeModal('forgot');
                openModal('login');
                showAlert('loginAlert', 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập với mật khẩu mới!', 'success');
            }, 2000);
        } else {
            // Hien thi loi tu server (vd: Token het han, khong hop le)
            showAlert('forgotAlert', result.error || `Lỗi ${response.status}: Không thể đặt lại mật khẩu`, 'error');
        }
    } catch (error) {
        console.error("Loi dat lai mat khau:", error);
        showAlert('forgotAlert', 'Lỗi kết nối! Vui lòng thử lại.', 'error');
    } finally {
         resetButton.disabled = false;
         resetButton.textContent = 'Đặt lại mật khẩu';
    }
}


function resetForgotPasswordForm() {
    document.getElementById('forgotStep1').style.display = 'block'; // Hien buoc 1
    document.getElementById('forgotStep2').style.display = 'none'; // An buoc 2
    document.getElementById('forgotStep3').style.display = 'none'; // An buoc 3
    
    const formStep1 = document.getElementById('forgotStep1').querySelector('form');
    if (formStep1) formStep1.reset();
    
    // Reset form buoc 2 (neu con)
     const formStep2 = document.getElementById('forgotStep2');
    if (formStep2) {
        const form = formStep2.querySelector('form');
        if(form) form.reset();
    }

     const formStep3 = document.getElementById('forgotStep3').querySelector('form');
    if (formStep3) formStep3.reset();
    
    document.getElementById('forgotAlert').innerHTML = '';
    // forgotPasswordUser = null; // <-- XÓA DÒNG NÀY
}


// ================================================================
// GIAO DIỆN NGƯỜI DÙNG (UI)
// ================================================================

function updateUIForLoggedInUser() {
    if (!currentUser) return; 

    document.getElementById('guestActions').style.display = 'none';
    document.getElementById('userInfo').classList.add('active');
    
    const firstLetter = currentUser.full_name?.charAt(0)?.toUpperCase() || '?'; 
    document.getElementById('userName').textContent = currentUser.full_name || 'Người dùng';
    document.getElementById('userAvatar').textContent = firstLetter;
    document.getElementById('dropdownAvatar').textContent = firstLetter;
    document.getElementById('dropdownName').textContent = currentUser.full_name || 'Người dùng';
    document.getElementById('dropdownEmail').textContent = currentUser.email || 'N/A';
    
    const roleNames = { 'admin': 'Quản trị viên', 'teacher': 'Giảng viên', 'student': 'Học viên' };
    document.getElementById('dropdownRole').textContent = roleNames[currentUser.role_name] || 'Người dùng';
    
    const teacherActions = document.getElementById('teacherActions');
    if (teacherActions) {
        if (currentUser.role_name === 'teacher') {
            teacherActions.style.display = 'block'; // Hiện nếu là Teacher
        } else {
            teacherActions.style.display = 'none';  // Ẩn nếu là Student/Admin
        }
    }

    if (currentUser.role_name === 'student') {
        document.getElementById('dashboardLink').style.display = 'block'; 
        loadDashboard(); 
    } else {
        document.getElementById('dashboardLink').style.display = 'none'; 
        document.getElementById('enrolledCoursesList').innerHTML = '';
        updateUserStats(0, 0); 
    }
     loadCourses();
     loadStatistics();
}

async function loadDashboard() {
    if (!currentUser || currentUser.role_name !== 'student') {
         document.getElementById('enrolledCoursesList').innerHTML = ''; 
         updateUserStats(0, 0);
        return;
    }

    const enrolledList = document.getElementById('enrolledCoursesList');
    enrolledList.innerHTML = '<p style="text-align: center; color: #718096; padding: 40px;">Đang tải dashboard...</p>';
    updateUserStats('...', '...'); 

    try {
        // (SỬA LỖI BẢO MẬT)
        const response = await fetch(`${API_URL}/dashboard`, {
            method: 'GET',
            headers: getApiHeaders() // Dùng header đã xác thực
        });
        
        if (!response.ok) {
             let errorMsg = 'Failed to fetch dashboard data';
             try { 
                 const errData = await response.json();
                 errorMsg = errData.error || errorMsg;
             } catch(e) {}
             throw new Error(errorMsg);
        }
        
        const enrolledCourses = await response.json();
        sessionStorage.setItem('dashboardData', JSON.stringify(enrolledCourses)); 
        
        if (!enrolledCourses || enrolledCourses.length === 0) {
            enrolledList.innerHTML = '<p style="text-align: center; color: #718096; padding: 40px;">Bạn chưa đăng ký khóa học nào. Hãy khám phá các khóa học và bắt đầu học ngay!</p>';
            updateUserStats(0, 0); 
            return;
        }
        
        enrolledList.innerHTML = ''; 
        let totalCourses = enrolledCourses.length;
        let totalProgressSum = 0;

        enrolledCourses.forEach(course => {
            let modulesHTML = '';
             if (course.modules && course.modules.length > 0) {
                 course.modules.forEach(module => {
                    let lessonsHTML = '';
                    if (module.lessons && module.lessons.length > 0) {
                        module.lessons.forEach(lesson => {
                            const icon = lesson.content_type === 'video' ? '🎥' : (lesson.content_type === 'text' ? '📝' : '❓'); 
                            lessonsHTML += `
                                <div class="lesson-item">
                                    ${icon} ${lesson.title || 'Bài học không tên'}
                                    <div style="margin-top: 5px;">
                                        <div class="progress-bar" style="height: 6px;">
                                            <div class="progress-fill" style="width: ${lesson.progress || 0}%"></div>
                                        </div>
                                        <small style="color: #718096;">${lesson.progress || 0}% hoàn thành</small>
                                    </div>
                                </div>
                            `;
                        });
                    } else {
                         lessonsHTML = '<p style="font-size: 13px; color: #a0aec0; margin-left: 10px;">Chưa có bài học.</p>';
                    }
                    
                    const uniqueModuleId = `module_${course.course_id}_${module.module_id}`;
                    modulesHTML += `
                        <div class="module-item" onclick="toggleLessons('${uniqueModuleId}')">
                            <strong>📚 ${module.title || 'Module không tên'}</strong>
                            <small style="color: #718096; margin-left: 10px;">${module.lessons ? module.lessons.length : 0} bài học</small>
                            <div class="lesson-list" id="${uniqueModuleId}">
                                ${lessonsHTML}
                            </div>
                        </div>
                    `;
                });
             } else {
                 modulesHTML = '<p style="font-size: 14px; color: #a0aec0;">Khóa học chưa có module.</p>';
             }
            
            const card = `
                <div class="enrolled-card">
                    <h3 style="color: #2d3748; margin-bottom: 10px;">${course.title || 'Khóa học không tên'}</h3>
                    <p style="color: #718096; font-size: 14px; margin-bottom: 10px;">
                        <i class="fas fa-user"></i> ${course.teacher_name || 'N/A'}
                    </p>
                    <p style="color: #667eea; font-weight: 600; margin-bottom: 15px;">
                        ${course.overall_progress || 0}% hoàn thành
                    </p>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${course.overall_progress || 0}%"></div>
                    </div>
                    <div class="modules-list" style="margin-top: 15px;">
                        ${modulesHTML}
                    </div>
                    <button class="btn-submit" style="margin-top: 20px;" onclick="continueLearning(${course.course_id})">
                        Tiếp tục học
                    </button>
                </div>
            `;
            enrolledList.innerHTML += card;
            totalProgressSum += (course.overall_progress || 0); 
        });
        
        let avgProgress = totalCourses > 0 ? Math.round(totalProgressSum / totalCourses) : 0;
        updateUserStats(totalCourses, avgProgress);

    } catch (error) {
        console.error("Loi khi tai dashboard:", error);
        enrolledList.innerHTML = `<p style="text-align: center; color: red; padding: 40px;">Không thể tải dữ liệu dashboard. Lỗi: ${error.message}</p>`;
        updateUserStats('Lỗi', 'Lỗi'); 
    }
}

// (SỬA LỖI LOGIC) Di chuyển hàm này ra ngoài scope global
/************************************************************
 * (Hàm mới) Tải thông báo của người dùng và in ra console
 * @param {number} userId ID của người dùng (để kiểm tra)
 ************************************************************/
async function loadUserNotifications(userId) {
    // Hàm này chỉ chạy khi đã đăng nhập, nên currentUser phải tồn tại
    if (!currentUser || !userId || currentUser.user_id !== userId) {
        console.warn("loadUserNotifications: Dữ liệu user không đồng bộ hoặc chưa đăng nhập.");
        return;
    }

    console.log("Đang tải thông báo cho user:", userId);
    try {
        // (SỬA LỖI CÚ PHÁP & BẢO MẬT)
        const response = await fetch(`${API_URL}/notifications`, {
            method: 'GET',
            headers: getApiHeaders() // Dùng hàm helper (đã có X-User-ID)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Lỗi khi tải thông báo");
        }
        
        const notifications = await response.json();
        
        // In kết quả đã giải mã ra console để kiểm tra
        console.log("=== THÔNG BÁO ĐÃ GIẢI MÃ TỪ SERVER ===");
        console.table(notifications);
        // ==============================================

    } catch (error) {
        console.error("Lỗi khi tải thông báo:", error.message);
    }
}


// Hàm cập nhật stats trên dropdown người dùng
function updateUserStats(courseCount, progressAvg) {
     const countEl = document.getElementById('userCoursesCount');
     const progressEl = document.getElementById('userProgressAvg');
     if (countEl) countEl.textContent = courseCount;
     if (progressEl) progressEl.textContent = typeof progressAvg === 'number' ? `${progressAvg}%` : progressAvg; 
}


// Hàm toggle danh sách bài học
function toggleLessons(moduleId) {
    const lessonList = document.getElementById(moduleId);
    if(lessonList) { 
        lessonList.classList.toggle('active');
    } else {
        console.warn("Khong tim thay element voi ID:", moduleId);
    }
}

function continueLearning(courseId) {
    alert('Chức năng học tập đang được phát triển! Khóa học ID: ' + courseId);
}

// ================================================================
// CÁC HÀM TIỆN ÍCH KHÁC
// ================================================================

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) {
        return; 
    }
    end = parseInt(end) || 0; 
    start = parseInt(start) || 0;

    const range = end - start;
    if (range === 0) {
        obj.textContent = end;
        return;
    }
    const increment = end > start ? 1 : -1;
    const stepTime = range !== 0 ? Math.max(1, Math.abs(Math.floor(duration / range))) : duration; 
    let current = start;
    
    if (obj.timer) clearInterval(obj.timer); 

    obj.timer = setInterval(function() {
        current += increment;
        obj.textContent = current;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) { 
            obj.textContent = end; 
            clearInterval(obj.timer);
            obj.timer = null; 
        }
    }, stepTime);
}

function searchCourses() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const coursesList = document.getElementById('coursesList');
    coursesList.innerHTML = ''; 

    const filteredCourses = loadedCoursesData.filter(course => 
        (course.title && course.title.toLowerCase().includes(searchTerm)) ||
        (course.description && course.description.toLowerCase().includes(searchTerm))
    );

    if (filteredCourses.length === 0) {
        coursesList.innerHTML = `<p style="text-align: center; color: #718096; padding: 40px; grid-column: 1/-1;">
            ${searchTerm ? `Không tìm thấy khóa học nào khớp với "${searchTerm}"!` : 'Chưa có khóa học nào.'}
        </p>`;
        return;
    }

    filteredCourses.forEach(course => {
         const courseCard = `
                <div class="course-card" onclick="openCourseDetail(${course.course_id})">
                    <div class="course-image"> <i class="fas fa-book-open"></i> </div>
                    <div class="course-content">
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-desc">${course.description}</p>
                        <div class="course-meta">
                            <span class="course-teacher"><i class="fas fa-user"></i> ${course.teacher_name || 'N/A'}</span>
                            <span class="course-price">${(course.fee || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div style="margin-top: 10px; color: #718096; font-size: 13px;">
                            <i class="fas fa-globe"></i> ${course.language_name || 'N/A'} | 
                            <i class="fas fa-users"></i> ${course.enrollments || 0} học viên
                        </div>
                    </div>
                </div>
            `;
            coursesList.innerHTML += courseCard;
    });
}


function showSection(section) {
    if (section === 'courses') {
        document.getElementById('homeSection').style.display = 'block';
        document.getElementById('dashboardSection').classList.remove('active');
        setTimeout(() => { 
             const coursesElement = document.getElementById('courses');
             if (coursesElement) { 
                 coursesElement.scrollIntoView({ behavior: 'smooth' });
             }
        }, 0); 

    } else if (section === 'dashboard') {
         if (!currentUser || currentUser.role_name !== 'student') {
             alert("Vui lòng đăng nhập với tài khoản học viên để xem Dashboard.");
             openModal('login'); 
             return; 
         }
        document.getElementById('homeSection').style.display = 'none';
        document.getElementById('dashboardSection').classList.add('active');
        loadDashboard(); 

    } else { // Mặc định là 'home'
        document.getElementById('homeSection').style.display = 'block';
        document.getElementById('dashboardSection').classList.remove('active');
    }
}


function openModal(type) {
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    
    const modalId = `${type}Modal`;
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.style.display = 'flex';
        
        if (type === 'forgot') {
            resetForgotPasswordForm();
        }
        if (type === 'login' || type === 'register') {
             const alertId = `${type}Alert`;
             const alertContainer = document.getElementById(alertId);
             if (alertContainer) alertContainer.innerHTML = '';
        }

    } else {
        console.error("Khong tim thay modal voi ID:", modalId);
    }
}

function closeModal(type) {
    const modalId = `${type}Modal`;
     const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.style.display = 'none';
    
        const alertId = `${type}Alert`;
        const alertContainer = document.getElementById(alertId);
        if (alertContainer) {
            alertContainer.innerHTML = '';
        }
        if (type === 'forgot') {
            setTimeout(() => resetForgotPasswordForm(), 300); 
        }
    } else {
         console.error("Khong tim thay modal de dong voi ID:", modalId);
    }
}

function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (container) {
         if (message) {
            const alertClass = type === 'success' ? 'alert-success' : (type === 'error' ? 'alert-error' : 'alert-info'); 
            container.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
         } else {
             container.innerHTML = ''; 
         }
    }
}

function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

document.addEventListener('click', function(event) {
    const userInfo = document.getElementById('userInfo');
    const dropdown = document.getElementById('userDropdown');
    
    if (dropdown && userInfo && !userInfo.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

function openProfileModal() {
    toggleUserDropdown(); 
    alert('Chức năng chỉnh sửa thông tin cá nhân đang được phát triển!');
}
function openSettingsModal() {
    toggleUserDropdown(); 
    alert('Chức năng cài đặt đang được phát triển!');
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
         const modalId = event.target.id;
         const type = modalId.replace('Modal', ''); 
         closeModal(type);
    }
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchCourses();
        }
    });
} else {
     console.warn("Khong tim thay searchInput element");
}


function initMobileMenu() {
    const navMenu = document.querySelector('.nav-menu');
    // Sửa lại: Lấy nút toggle bằng class đã thêm trong HTML
    const toggleButton = document.querySelector('.menu-toggle'); 

    if (navMenu && toggleButton) {
        toggleButton.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            toggleButton.innerHTML = navMenu.classList.contains('active') ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
        });
        
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                 if (navMenu.classList.contains('active')) {
                     navMenu.classList.remove('active');
                     toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
                 }
            });
        });

    } else {
         console.warn("Khong tim thay navMenu hoac menuToggle element.");
    }
}


function initScrollTopButton() {
    let scrollTopBtn = document.querySelector('.scroll-top-btn');
    if (!scrollTopBtn) {
        scrollTopBtn = document.createElement('button');
        scrollTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        scrollTopBtn.style.cssText = `
            position: fixed; bottom: 30px; right: 30px;
            width: 50px; height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; border: none; border-radius: 50%;
            cursor: pointer; display: none; /* Bắt đầu ẩn */ align-items: center;
            justify-content: center; font-size: 20px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            transition: opacity 0.3s, transform 0.3s; /* Thêm opacity transition */ z-index: 999;
            opacity: 0; /* Bắt đầu ẩn */ transform: translateY(20px); /* Hiệu ứng trồi lên */
        `;
        scrollTopBtn.className = 'scroll-top-btn';
        document.body.appendChild(scrollTopBtn);

        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                scrollTopBtn.style.opacity = '1';
                scrollTopBtn.style.transform = 'translateY(0)';
                scrollTopBtn.style.display = 'flex'; 
            } else {
                scrollTopBtn.style.opacity = '0';
                scrollTopBtn.style.transform = 'translateY(20px)';
                 setTimeout(() => {
                     if (window.pageYOffset <= 300) { 
                          scrollTopBtn.style.display = 'none';
                     }
                 }, 300); 
            }
        });

        scrollTopBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        scrollTopBtn.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
        });
        scrollTopBtn.addEventListener('mouseleave', function() {
            if (this.style.opacity === '1') { 
                this.style.transform = 'translateY(0)';
            }
        });

    }
}

    // ================================================================
// LOGIC NGHIỆP VỤ BẢO MẬT & BÀI TẬP
// ================================================================

// --- PHẦN 1: GIÁO VIÊN TẠO ĐỀ (UI ĐỘNG) ---

// Biến lưu danh sách câu hỏi tạm thời
let tempQuestions = [];

function openCreateQuizModal(lessonId) {
    document.getElementById('quizLessonId').value = lessonId;
    document.getElementById('questionsContainer').innerHTML = '';
    tempQuestions = [];
    addQuestionUI(); // Thêm sẵn 1 câu hỏi trống
    openModal('createQuiz');
}

function addQuestionUI() {
    const container = document.getElementById('questionsContainer');
    const qIndex = container.children.length + 1;
    
    const html = `
        <div class="question-block" style="background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
            <h4 style="margin-bottom: 10px; color: #4a5568;">Câu hỏi #${qIndex}</h4>
            <input type="text" class="q-content form-control" placeholder="Nhập nội dung câu hỏi..." style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #cbd5e0; border-radius: 5px;">
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <input type="text" class="q-opt-a" placeholder="Đáp án A" style="padding: 8px; border: 1px solid #cbd5e0; border-radius: 5px;">
                <input type="text" class="q-opt-b" placeholder="Đáp án B" style="padding: 8px; border: 1px solid #cbd5e0; border-radius: 5px;">
                <input type="text" class="q-opt-c" placeholder="Đáp án C" style="padding: 8px; border: 1px solid #cbd5e0; border-radius: 5px;">
                <input type="text" class="q-opt-d" placeholder="Đáp án D" style="padding: 8px; border: 1px solid #cbd5e0; border-radius: 5px;">
            </div>
            
            <div style="margin-top: 10px;">
                <label style="font-size: 13px; font-weight: 600;">Đáp án đúng:</label>
                <select class="q-correct" style="padding: 5px; border-radius: 5px;">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                </select>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

async function submitCreateQuiz() {
    const lessonId = document.getElementById('quizLessonId').value;
    const title = document.getElementById('quizTitle').value;
    
    // Thu thập dữ liệu từ các ô input
    const blocks = document.querySelectorAll('.question-block');
    const questions = [];
    
    blocks.forEach(block => {
        const content = block.querySelector('.q-content').value;
        const a = block.querySelector('.q-opt-a').value;
        const b = block.querySelector('.q-opt-b').value;
        const c = block.querySelector('.q-opt-c').value;
        const d = block.querySelector('.q-opt-d').value;
        const correct = block.querySelector('.q-correct').value;
        
        if(content && a && b) { // Validate cơ bản
            questions.push({
                question: content,
                options: { A: a, B: b, C: c, D: d },
                correct_answer: correct
            });
        }
    });

    if (questions.length === 0) {
        alert("Vui lòng nhập ít nhất 1 câu hỏi đầy đủ!");
        return;
    }

    // Gửi lên API để mã hóa
    try {
        const response = await fetch(`${API_URL}/exercises`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                lesson_id: lessonId,
                title: title,
                content: questions // Server sẽ mã hóa cục này
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            alert("Đã lưu và MÃ HÓA đề thi thành công!");
            closeModal('createQuiz');
            // Reload course detail để thấy bài tập mới (cần logic reload, tạm thời bỏ qua)
        } else {
            alert("Lỗi: " + result.error);
        }
    } catch (error) {
        console.error("Error creating quiz:", error);
        alert("Lỗi kết nối!");
    }
}

// --- PHẦN 2: HỌC VIÊN LÀM BÀI (GIẢI MÃ & HIỂN THỊ) ---

let currentQuizData = null;

async function openDoQuiz(exerciseId) {
    document.getElementById('doQuizTitle').textContent = "Đang tải & Giải mã đề thi...";
    document.getElementById('quizArea').innerHTML = '<div style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Đang bảo mật...</div>';
    openModal('doQuiz');
    document.getElementById('quizResult').style.display = 'none';
    document.getElementById('btnSubmitQuiz').style.display = 'block';

    try {
        // Gọi API lấy dữ liệu (API sẽ tự giải mã trả về JSON)
        const response = await fetch(`${API_URL}/exercises/${exerciseId}`, {
            headers: getApiHeaders()
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        currentQuizData = result.questions; // Lưu lại để chấm điểm
        document.getElementById('doQuizTitle').textContent = result.title;
        
        // Render câu hỏi ra màn hình
        let html = '';
        result.questions.forEach((q, index) => {
            html += `
                <div class="quiz-item" style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                    <p style="font-weight: 600; margin-bottom: 10px;">Câu ${index + 1}: ${q.question}</p>
                    <div class="options-list">
                        ${Object.entries(q.options).map(([key, val]) => `
                            <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                                <input type="radio" name="q_${index}" value="${key}"> 
                                <strong>${key}.</strong> ${val}
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        document.getElementById('quizArea').innerHTML = html;

    } catch (error) {
        document.getElementById('quizArea').innerHTML = `<p style="color:red">Lỗi: ${error.message}</p>`;
    }
}

function submitQuizAnswers() {
    if (!currentQuizData) return;
    
    let score = 0;
    let total = currentQuizData.length;
    
    // Chấm điểm Client-side (Trong thực tế nên chấm ở Server để bảo mật tuyệt đối)
    currentQuizData.forEach((q, index) => {
        const selected = document.querySelector(`input[name="q_${index}"]:checked`);
        if (selected && selected.value === q.correct_answer) {
            score++;
        }
    });
    
    const percentage = Math.round((score / total) * 100);
    
    document.getElementById('scoreText').textContent = `${score}/${total} (${percentage}%)`;
    document.getElementById('quizResult').style.display = 'block';
    document.getElementById('btnSubmitQuiz').style.display = 'none';
    
    // Kéo xuống xem kết quả
    document.getElementById('quizResult').scrollIntoView({behavior: 'smooth'});
}
 

// ================================================================
// LOGIC TẠO KHÓA HỌC (TEACHER)
// ================================================================

async function handleCreateCourse(event) {
    event.preventDefault();
    
    // Lấy dữ liệu từ form
    const title = document.getElementById('ccTitle').value;
    const desc = document.getElementById('ccDesc').value;
    const langId = document.getElementById('ccLang').value;
    const fee = document.getElementById('ccFee').value;
    
    const submitBtn = event.target.querySelector('.btn-submit');
    const originalText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    try {
        const response = await fetch(`${API_URL}/courses`, {
            method: 'POST',
            headers: getApiHeaders(), // Quan trọng: Gửi kèm Token/ID để Server biết ai tạo
            body: JSON.stringify({
                title: title,
                description: desc,
                language_id: langId,
                fee: fee
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Tạo khóa học thành công!");
            closeModal('createCourse');
            event.target.reset(); // Xóa trắng form
            
            // Tải lại danh sách để thấy khóa học mới
            loadCourses(); 
            loadStatistics();
        } else {
            alert("❌ Lỗi: " + (result.error || "Không thể tạo khóa học"));
        }
    } catch (error) {
        console.error("Lỗi tạo khóa học:", error);
        alert("Lỗi kết nối server!");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ============================================================
// LOGIC MỚI: ĐỀ THI BẢO MẬT (SECURE QUIZ)
// ============================================================

// 1. Mở Modal Tạo Đề Bảo Mật
function openCreateSecureQuizModal(lessonId) {
    document.getElementById('secureQuizLessonId').value = lessonId;
    document.getElementById('secureQuestionsContainer').innerHTML = ''; // Reset container mới
    document.getElementById('secureAccessCode').value = ''; // Reset mật mã
    addSecureQuestionUI(); // Thêm 1 câu hỏi mẫu
    openModal('createSecureQuiz');
}

// 2. Thêm UI câu hỏi (Copy logic cũ nhưng đổi container)
function addSecureQuestionUI() {
    const container = document.getElementById('secureQuestionsContainer');
    const qIndex = container.children.length + 1;
    // HTML y hệt addQuestionUI cũ, chỉ đổi class để dễ CSS nếu cần
    const html = `
        <div class="question-block-secure" style="background: #fff5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #feb2b2;">
            <h4 style="color: #c53030;">Câu hỏi bảo mật #${qIndex}</h4>
            <input type="text" class="q-content form-control" placeholder="Nội dung câu hỏi..." style="width: 100%; padding: 8px; margin-bottom: 10px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <input type="text" class="q-opt-a" placeholder="Đáp án A">
                <input type="text" class="q-opt-b" placeholder="Đáp án B">
                <input type="text" class="q-opt-c" placeholder="Đáp án C">
                <input type="text" class="q-opt-d" placeholder="Đáp án D">
            </div>
            <div style="margin-top: 10px;">
                <label>Đáp án đúng:</label>
                <select class="q-correct"><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

// 3. Gửi Đề Bảo Mật lên Server (Gọi API MỚI)
async function submitCreateSecureQuiz() {
    const lessonId = document.getElementById('secureQuizLessonId').value;
    const title = document.getElementById('secureQuizTitle').value;
    const accessCode = document.getElementById('secureAccessCode').value; // Lấy mã

    if (!accessCode) {
        alert("Vui lòng nhập Mật mã truy cập!");
        return;
    }

    // Thu thập câu hỏi từ container MỚI
    const blocks = document.querySelectorAll('.question-block-secure');
    const questions = [];
    blocks.forEach(block => {
        // Logic lấy value y hệt cũ
        const content = block.querySelector('.q-content').value;
        const a = block.querySelector('.q-opt-a').value;
        const b = block.querySelector('.q-opt-b').value;
        const c = block.querySelector('.q-opt-c').value;
        const d = block.querySelector('.q-opt-d').value;
        const correct = block.querySelector('.q-correct').value;
        if(content && a) questions.push({ question: content, options: {A:a, B:b, C:c, D:d}, correct_answer: correct });
    });

    if (questions.length === 0) { alert("Nhập ít nhất 1 câu hỏi!"); return; }

    try {
        // GỌI API /api/exercises/secure
        const response = await fetch(`${API_URL}/exercises/secure`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                lesson_id: lessonId,
                title: title,
                content: questions,
                access_code: accessCode // Gửi mã lên
            })
        });
        const result = await response.json();
        if (response.ok) {
            alert("✅ Tạo đề thi BẢO MẬT thành công!");
            closeModal('createSecureQuiz');
        } else {
            alert("❌ Lỗi: " + result.error);
        }
    } catch (e) { console.error(e); alert("Lỗi kết nối"); }
}

// ============================================================
// LOGIC MỚI: SINH VIÊN LÀM BÀI (XỬ LÝ MÃ HÓA LAI)
// ============================================================

let pendingQuizId = null;

// Hàm kiểm tra khi bấm nút "Làm bài"
async function checkAndOpenQuiz(exerciseId) {
    pendingQuizId = exerciseId;
    // Ở đây để đơn giản: Chúng ta sẽ thử gọi API lấy đề trước.
    // Nếu API trả về lỗi (hoặc logic backend trả cờ báo cần pass), ta mới hiện modal.
    // Nhưng do bạn muốn tách biệt, tôi sẽ làm luồng giả định:
    // Ta sẽ mở Modal nhập mã luôn. Nếu người dùng nhập sai hoặc đề không có pass thì API verify sẽ báo.
    // (Trong thực tế, bạn nên có 1 API check status trước).
    
    // Tạm thời: Mở luôn modal nhập mã cho ngầu
    openModal('accessCode');
}

// Hàm xác thực và vào thi
async function verifyAndStartQuiz() {
    const code = document.getElementById('studentAccessCode').value;
    if(!code) { alert("Chưa nhập mã!"); return; }

    try {
        // 1. Lấy Public Key
        const keyRes = await fetch(`${API_URL}/public-key`);
        const keyData = await keyRes.json();
        
        // 2. Mã hóa AES & RSA (Client Side)
        const aesKey = CryptoJS.lib.WordArray.random(32);
        const iv = CryptoJS.lib.WordArray.random(16);
        
        const encryptedCode = CryptoJS.AES.encrypt(code, aesKey, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
        
        const encryptor = new JSEncrypt();
        encryptor.setPublicKey(keyData.public_key);
        const encryptedAesKey = encryptor.encrypt(CryptoJS.enc.Base64.stringify(aesKey));

        // 3. Gửi lên API Verify
        const verifyRes = await fetch(`${API_URL}/exercises/verify`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                exercise_id: pendingQuizId,
                encrypted_aes_key: encryptedAesKey,
                encrypted_code: encryptedCode.toString(),
                iv: CryptoJS.enc.Base64.stringify(iv)
            })
        });

        const verifyResult = await verifyRes.json();

        if (verifyRes.ok && verifyResult.success) {
            // 4. Nếu đúng pass, mở bài thi (Hàm cũ)
            closeModal('accessCode');
            openDoQuiz(pendingQuizId); // Gọi lại hàm cũ để tải đề
        } else {
            alert("⛔ Mật mã không đúng! (Hoặc đề này là đề thường, hãy thử vào trực tiếp)");
            // Fallback: Nếu đề thường mà lỡ bấm vào đây, thử mở luôn
            if (verifyResult.error && verifyResult.error.includes("không có mật mã")) {
                 closeModal('accessCode');
                 openDoQuiz(pendingQuizId);
            }
        }
    } catch (e) {
        console.error(e);
        alert("Lỗi xử lý bảo mật: " + e.message);
    }
}
    