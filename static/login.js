// static/login.js
// ตรวจสอบให้แน่ใจว่า API_BASE_URL ถูกกำหนดค่าไว้ใน static/utils.js และถูกโหลดก่อนไฟล์นี้

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        console.error("Login form not found!");
        return;
    }

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginErrorElement = document.getElementById('loginError');

        if (!usernameInput || !passwordInput || !loginErrorElement) {
            console.error("Required form elements for login not found!");
            return;
        }

        loginErrorElement.textContent = ''; // ล้างข้อผิดพลาดเก่า

        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) {
            loginErrorElement.textContent = 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน';
            return;
        }

        // ตรวจสอบว่า API_BASE_URL ถูกโหลดมาจาก utils.js หรือไม่
        if (typeof API_BASE_URL === 'undefined') {
            console.error('API_BASE_URL is not defined. Make sure utils.js is loaded before login.js and defines it.');
            loginErrorElement.textContent = 'เกิดข้อผิดพลาดในการตั้งค่าระบบ (ไม่พบ URL ของ API)';
            Swal.fire({
                icon: 'error',
                title: 'ข้อผิดพลาดการตั้งค่า',
                text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (API URL not found)',
            });
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/login`, { // ใช้ API_BASE_URL จาก utils.js
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                console.log('Login successful:', data);
                // จัดเก็บข้อมูลผู้ใช้ (ไม่รวมรหัสผ่าน) และ token (ถ้ามี)
                localStorage.setItem('currentUser', JSON.stringify({
                    id: data.user.id,
                    username: data.user.username,
                    full_name: data.user.full_name,
                    role: data.user.role,
                    hcode: data.user.hcode
                    // token: data.access_token // หากใช้ JWT
                }));

                Swal.fire({
                    icon: 'success',
                    title: 'เข้าสู่ระบบสำเร็จ!',
                    text: `ยินดีต้อนรับ, ${data.user.full_name}`,
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    window.location.href = '/index'; // เปลี่ยนเส้นทางไปยังหน้าหลักของแอปพลิเคชัน
                });

            } else {
                // Login failed
                loginErrorElement.textContent = data.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
                Swal.fire({
                    icon: 'error',
                    title: 'เข้าสู่ระบบไม่สำเร็จ',
                    text: data.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
                });
            }
        } catch (error) {
            console.error('Login request failed:', error);
            loginErrorElement.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์';
             Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
            });
        }
    });
});
